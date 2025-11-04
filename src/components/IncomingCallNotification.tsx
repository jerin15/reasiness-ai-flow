import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WebRTCCall } from "./WebRTCCall";
import { Button } from "./ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { toast } from "sonner";

type IncomingCall = {
  id: string;
  caller_id: string;
  call_type: "voice" | "video";
  caller_name: string;
  caller_avatar?: string;
};

export const IncomingCallNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [showCallDialog, setShowCallDialog] = useState(false);
  
  // Create a proper ringtone sound (longer and more noticeable)
  const [ringtone] = useState(() => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a more attention-grabbing ringtone pattern
    const createRingtone = () => {
      const duration = 2;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, duration * sampleRate, sampleRate);
      const channel = buffer.getChannelData(0);
      
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        // Create a pattern with multiple frequencies for attention
        const freq1 = 800 * Math.sin(2 * Math.PI * 2 * t);
        const freq2 = 1000 * Math.sin(2 * Math.PI * 3 * t);
        channel[i] = (Math.sin(2 * Math.PI * freq1 * t) + Math.sin(2 * Math.PI * freq2 * t)) * 0.3;
      }
      
      return buffer;
    };
    
    const source = audioContext.createBufferSource();
    source.buffer = createRingtone();
    source.loop = true;
    source.connect(audioContext.destination);
    
    return { context: audioContext, source };
  });

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
    if (!currentUserId) return;

    const channel = supabase
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_sessions",
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const session = payload.new as any;
          
          // Fetch caller details
          const { data: callerProfile } = await supabase
            .from("profiles")
            .select("full_name, email, avatar_url")
            .eq("id", session.caller_id)
            .single();

          setIncomingCall({
            id: session.id,
            caller_id: session.caller_id,
            call_type: session.call_type,
            caller_name: callerProfile?.full_name || callerProfile?.email || "Unknown",
            caller_avatar: callerProfile?.avatar_url,
          });

          // Play ringtone
          try {
            ringtone.source.start(0);
          } catch (e) {
            // Already started
          }

          // Show prominent toast notification
          toast.error(`🔔 INCOMING ${session.call_type.toUpperCase()} CALL from ${callerProfile?.full_name || "Unknown"}`, {
            duration: 30000,
            style: {
              background: '#ef4444',
              color: 'white',
              fontSize: '16px',
              fontWeight: 'bold',
            },
          });

          // Continuous vibration on mobile
          if (navigator.vibrate) {
            const vibratePattern = [300, 200, 300, 200, 300];
            const vibrateInterval = setInterval(() => {
              navigator.vibrate(vibratePattern);
            }, 2000);
            (window as any).callVibrateInterval = vibrateInterval;
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "call_sessions",
          filter: `callee_id=eq.${currentUserId}`,
        },
        (payload) => {
          const session = payload.new as any;
          if (
            session.status === "ended" ||
            session.status === "declined" ||
            session.status === "answered"
          ) {
            try {
              ringtone.source.stop();
            } catch (e) {
              // Already stopped
            }
            if ((window as any).callVibrateInterval) {
              clearInterval((window as any).callVibrateInterval);
            }
            if (session.status !== "answered") {
              setIncomingCall(null);
              setShowCallDialog(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      try {
        ringtone.source.stop();
      } catch (e) {
        // Already stopped
      }
      if ((window as any).callVibrateInterval) {
        clearInterval((window as any).callVibrateInterval);
      }
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const answerCall = () => {
    try {
      ringtone.source.stop();
    } catch (e) {
      // Already stopped
    }
    if ((window as any).callVibrateInterval) {
      clearInterval((window as any).callVibrateInterval);
    }
    setShowCallDialog(true);
  };

  const declineCall = async () => {
    try {
      ringtone.source.stop();
    } catch (e) {
      // Already stopped
    }
    if ((window as any).callVibrateInterval) {
      clearInterval((window as any).callVibrateInterval);
    }
    
    if (incomingCall) {
      await supabase
        .from("call_sessions")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", incomingCall.id);
    }
    
    setIncomingCall(null);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (!incomingCall && !showCallDialog) return null;

  return (
    <>
      {incomingCall && !showCallDialog && (
        <>
          {/* Fullscreen overlay with blur */}
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in" />
          
          {/* Prominent call notification */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in zoom-in">
            <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-2xl shadow-2xl p-8 max-w-md w-full border-4 border-white animate-pulse">
              <div className="flex flex-col items-center gap-6">
                {/* Large Avatar */}
                <Avatar className="h-32 w-32 ring-4 ring-white">
                  <AvatarImage src={incomingCall.caller_avatar} />
                  <AvatarFallback className="bg-white/20 text-white text-4xl font-bold">
                    {getInitials(incomingCall.caller_name)}
                  </AvatarFallback>
                </Avatar>
                
                {/* Caller Info */}
                <div className="text-center">
                  <p className="text-3xl font-bold mb-2">{incomingCall.caller_name}</p>
                  <p className="text-xl capitalize flex items-center justify-center gap-2">
                    <Phone className="h-6 w-6 animate-bounce" />
                    Incoming {incomingCall.call_type} call...
                  </p>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-6 mt-4">
                  <Button
                    onClick={declineCall}
                    variant="destructive"
                    size="lg"
                    className="rounded-full h-20 w-20 bg-red-700 hover:bg-red-800 shadow-lg"
                  >
                    <PhoneOff className="h-10 w-10" />
                  </Button>
                  <Button
                    onClick={answerCall}
                    size="lg"
                    className="rounded-full h-20 w-20 bg-green-500 hover:bg-green-600 shadow-lg animate-bounce"
                  >
                    <Phone className="h-10 w-10" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {showCallDialog && incomingCall && (
        <WebRTCCall
          open={showCallDialog}
          onOpenChange={(open) => {
            setShowCallDialog(open);
            if (!open) setIncomingCall(null);
          }}
          callType={incomingCall.call_type}
          partnerId={incomingCall.caller_id}
          partnerName={incomingCall.caller_name}
          partnerAvatar={incomingCall.caller_avatar}
          isIncoming={true}
          callSessionId={incomingCall.id}
        />
      )}
    </>
  );
};
