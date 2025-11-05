import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

type CallType = "voice" | "video";

type WebRTCCallProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  callType: CallType;
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
  isIncoming?: boolean;
  callSessionId?: string;
};

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export const WebRTCCall = ({
  open,
  onOpenChange,
  callType,
  partnerId,
  partnerName,
  partnerAvatar,
  isIncoming = false,
  callSessionId: initialCallSessionId,
}: WebRTCCallProps) => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [callSessionId, setCallSessionId] = useState<string | null>(
    initialCallSessionId || null
  );
  const [callStatus, setCallStatus] = useState<string>(
    isIncoming ? "ringing" : "connecting"
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    const initUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (!open || !currentUserId) return;

    const setupCall = async () => {
      try {
        // Get local media
        const constraints = {
          audio: true,
          video: callType === "video",
        };

        localStream.current = await navigator.mediaDevices.getUserMedia(
          constraints
        );

        if (localVideoRef.current && callType === "video") {
          localVideoRef.current.srcObject = localStream.current;
        }

        // Initialize peer connection
        peerConnection.current = new RTCPeerConnection(ICE_SERVERS);

        // Add local tracks
        localStream.current.getTracks().forEach((track) => {
          peerConnection.current!.addTrack(track, localStream.current!);
        });

        // Handle remote stream
        remoteStream.current = new MediaStream();
        peerConnection.current.ontrack = (event) => {
          event.streams[0].getTracks().forEach((track) => {
            remoteStream.current!.addTrack(track);
          });
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream.current;
          }
        };

        // Handle ICE candidates
        peerConnection.current.onicecandidate = async (event) => {
          if (event.candidate && callSessionId) {
            await supabase.from("ice_candidates").insert({
              call_session_id: callSessionId,
              user_id: currentUserId,
              candidate: JSON.stringify(event.candidate.toJSON()),
            });
          }
        };

        // Handle connection state
        peerConnection.current.onconnectionstatechange = () => {
          console.log(
            "Connection state:",
            peerConnection.current?.connectionState
          );
          if (peerConnection.current?.connectionState === "connected") {
            setCallStatus("connected");
          } else if (
            peerConnection.current?.connectionState === "disconnected" ||
            peerConnection.current?.connectionState === "failed"
          ) {
            endCall();
          }
        };

        if (isIncoming && callSessionId) {
          // Answer incoming call
          await answerCall(callSessionId);
        } else {
          // Create new call
          await createCall();
        }

        // Subscribe to ICE candidates
        const candidatesChannel = supabase
          .channel(`ice-candidates-${callSessionId || "new"}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "ice_candidates",
              filter: `call_session_id=eq.${callSessionId}`,
            },
            async (payload) => {
              const candidate = JSON.parse(
                (payload.new as any).candidate
              ) as RTCIceCandidateInit;
              if ((payload.new as any).user_id !== currentUserId) {
                try {
                  if (
                    peerConnection.current?.remoteDescription &&
                    peerConnection.current.remoteDescription.type
                  ) {
                    await peerConnection.current.addIceCandidate(
                      new RTCIceCandidate(candidate)
                    );
                  } else {
                    iceCandidatesQueue.current.push(candidate);
                  }
                } catch (error) {
                  console.error("Error adding ICE candidate:", error);
                }
              }
            }
          )
          .subscribe();

        // Subscribe to call session updates
        const sessionChannel = supabase
          .channel(`call-session-${callSessionId || "new"}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "call_sessions",
              filter: `id=eq.${callSessionId}`,
            },
            async (payload) => {
              const session = payload.new as any;
              if (session.status === "answered" && !isIncoming && session.answer) {
                await peerConnection.current!.setRemoteDescription(
                  new RTCSessionDescription(JSON.parse(session.answer))
                );
                // Process queued ICE candidates
                for (const candidate of iceCandidatesQueue.current) {
                  await peerConnection.current!.addIceCandidate(
                    new RTCIceCandidate(candidate)
                  );
                }
                iceCandidatesQueue.current = [];
              } else if (session.status === "ended" || session.status === "declined") {
                endCall();
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(candidatesChannel);
          supabase.removeChannel(sessionChannel);
        };
      } catch (error: any) {
        console.error("Error setting up call:", error);
        toast.error(error.message || "Failed to set up call");
        endCall();
      }
    };

    setupCall();

    return () => {
      cleanup();
    };
  }, [open, currentUserId, callSessionId, isIncoming]);

  const createCall = async () => {
    try {
      console.log('[WebRTC] Creating call to:', partnerId);
      const offer = await peerConnection.current!.createOffer();
      await peerConnection.current!.setLocalDescription(offer);

      const { data, error } = await supabase
        .from("call_sessions")
        .insert({
          caller_id: currentUserId,
          callee_id: partnerId,
          call_type: callType,
          offer: JSON.stringify(offer),
          status: 'ringing'
        })
        .select()
        .single();

      if (error) {
        console.error('[WebRTC] Error inserting call session:', error);
        throw error;
      }
      
      console.log('[WebRTC] Call session created:', data);
      setCallSessionId(data.id);
      setCallStatus("ringing");
    } catch (error: any) {
      console.error("Error creating call:", error);
      toast.error("Failed to start call");
      endCall();
    }
  };

  const answerCall = async (sessionId: string) => {
    try {
      const { data: session } = await supabase
        .from("call_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (!session || !session.offer) {
        throw new Error("Call session not found");
      }

      await peerConnection.current!.setRemoteDescription(
        new RTCSessionDescription(JSON.parse(session.offer))
      );

      const answer = await peerConnection.current!.createAnswer();
      await peerConnection.current!.setLocalDescription(answer);

      await supabase
        .from("call_sessions")
        .update({
          answer: JSON.stringify(answer),
          status: "answered",
          answered_at: new Date().toISOString(),
        })
        .eq("id", sessionId);

      setCallStatus("connected");
    } catch (error: any) {
      console.error("Error answering call:", error);
      toast.error("Failed to answer call");
      endCall();
    }
  };

  const endCall = async () => {
    if (callSessionId) {
      await supabase
        .from("call_sessions")
        .update({
          status: "ended",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callSessionId);
    }
    cleanup();
    onOpenChange(false);
  };

  const declineCall = async () => {
    if (callSessionId) {
      await supabase
        .from("call_sessions")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callSessionId);
    }
    cleanup();
    onOpenChange(false);
  };

  const cleanup = () => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    remoteStream.current = null;
  };

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current && callType === "video") {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && endCall()}>
      <DialogContent className="p-0 max-w-4xl h-[80vh] flex flex-col gap-0 bg-gradient-to-b from-background to-muted/20">
        <div className="flex-1 relative flex items-center justify-center bg-muted/20">
          {callType === "video" ? (
            <>
              {/* Remote video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Local video (small preview) */}
              <div className="absolute top-4 right-4 w-48 h-36 rounded-lg overflow-hidden shadow-lg border-2 border-background">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-32 w-32">
                <AvatarImage src={partnerAvatar} />
                <AvatarFallback className="bg-primary/10 text-primary text-4xl font-semibold">
                  {getInitials(partnerName)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <h3 className="text-2xl font-semibold">{partnerName}</h3>
                <p className="text-muted-foreground capitalize">{callStatus}</p>
              </div>
            </div>
          )}
        </div>

        {/* Call controls */}
        <div className="p-6 bg-background border-t flex items-center justify-center gap-4">
          {isIncoming && callStatus === "ringing" ? (
            <>
              <Button
                onClick={declineCall}
                variant="destructive"
                size="lg"
                className="rounded-full h-14 w-14"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
              <Button
                onClick={() => answerCall(callSessionId!)}
                variant="default"
                size="lg"
                className="rounded-full h-14 w-14 bg-green-500 hover:bg-green-600"
              >
                <Phone className="h-6 w-6" />
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={toggleMute}
                variant={isMuted ? "destructive" : "secondary"}
                size="lg"
                className="rounded-full h-14 w-14"
              >
                {isMuted ? (
                  <MicOff className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>
              {callType === "video" && (
                <Button
                  onClick={toggleVideo}
                  variant={isVideoOff ? "destructive" : "secondary"}
                  size="lg"
                  className="rounded-full h-14 w-14"
                >
                  {isVideoOff ? (
                    <VideoOff className="h-6 w-6" />
                  ) : (
                    <Video className="h-6 w-6" />
                  )}
                </Button>
              )}
              <Button
                onClick={endCall}
                variant="destructive"
                size="lg"
                className="rounded-full h-14 w-14"
              >
                <PhoneOff className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
