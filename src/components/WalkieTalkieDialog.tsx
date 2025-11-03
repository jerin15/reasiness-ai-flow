import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mic, MicOff, Radio } from 'lucide-react';

interface WalkieTalkieDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
}

export const WalkieTalkieDialog = ({ 
  open, 
  onOpenChange, 
  recipientId, 
  recipientName 
}: WalkieTalkieDialogProps) => {
  const [isTalking, setIsTalking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const signalChannelRef = useRef<any>(null);

  // ICE servers configuration for WebRTC
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (open && currentUserId && recipientId) {
      initializeConnection();
    }

    return () => {
      cleanup();
    };
  }, [open, currentUserId, recipientId]);

  const initializeConnection = async () => {
    try {
      setIsConnecting(true);

      // Set up signaling channel
      setupSignalingChannel();

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      localStreamRef.current = stream;

      // Create peer connection
      const peerConnection = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = peerConnection;

      // Add local audio tracks
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      // Handle remote audio
      peerConnection.ontrack = (event) => {
        console.log('📻 Received remote audio track');
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate');
        await supabase.from('walkie_talkie_signals').insert({
          caller_id: currentUserId,
          callee_id: recipientId,
          signal_type: 'ice-candidate',
          signal_data: { candidate: event.candidate }
        } as any);
        }
      };

      // Handle connection state
      peerConnection.onconnectionstatechange = () => {
        console.log('🔗 Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
          toast.success(`Connected to ${recipientName}`);
        } else if (peerConnection.connectionState === 'failed' || 
                   peerConnection.connectionState === 'disconnected') {
          setIsConnected(false);
          toast.error('Connection lost');
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      await supabase.from('walkie_talkie_signals').insert({
        caller_id: currentUserId,
        callee_id: recipientId,
        signal_type: 'offer',
        signal_data: { sdp: offer }
      } as any);

      // Mark as active call
      await supabase.from('active_walkie_calls').insert({
        caller_id: currentUserId,
        callee_id: recipientId
      } as any);

      console.log('📞 Walkie-talkie call initiated');
    } catch (error: any) {
      console.error('Error initializing connection:', error);
      toast.error('Failed to connect: ' + error.message);
      setIsConnecting(false);
    }
  };

  const setupSignalingChannel = () => {
    // Listen for WebRTC signals
    const channel = supabase
      .channel(`walkie-talkie-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'walkie_talkie_signals',
          filter: `callee_id=eq.${currentUserId}`
        },
        async (payload) => {
          const signal = payload.new;
          console.log('📡 Received signal:', signal.signal_type);
          
          if (!peerConnectionRef.current) return;

          try {
            switch (signal.signal_type) {
              case 'offer':
                await handleOffer(signal.signal_data.sdp);
                break;
              case 'answer':
                await handleAnswer(signal.signal_data.sdp);
                break;
              case 'ice-candidate':
                await handleIceCandidate(signal.signal_data.candidate);
                break;
              case 'end-call':
                cleanup();
                onOpenChange(false);
                toast.info(`${recipientName} ended the call`);
                break;
            }

            // Mark signal as processed
            await supabase
              .from('walkie_talkie_signals')
              .update({ is_processed: true })
              .eq('id', signal.id);
          } catch (error) {
            console.error('Error handling signal:', error);
          }
        }
      )
      .subscribe();

    signalChannelRef.current = channel;
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;

    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);

    await supabase.from('walkie_talkie_signals').insert({
      caller_id: currentUserId,
      callee_id: recipientId,
      signal_type: 'answer',
      signal_data: { sdp: answer }
    } as any);
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return;
    await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
  };

  const startTalking = () => {
    if (!isConnected) {
      toast.error('Not connected yet. Please wait...');
      return;
    }
    
    setIsTalking(true);
    
    // Enable audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = true;
      });
    }
    
    toast.success('🎤 You are now speaking');
  };

  const stopTalking = () => {
    setIsTalking(false);
    
    // Disable audio tracks (mute)
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
  };

  const endCall = async () => {
    // Send end call signal
    await supabase.from('walkie_talkie_signals').insert({
      caller_id: currentUserId,
      callee_id: recipientId,
      signal_type: 'end-call',
      signal_data: {}
    } as any);

    cleanup();
    onOpenChange(false);
  };

  const cleanup = async () => {
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Unsubscribe from signaling
    if (signalChannelRef.current) {
      await supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }

    // Remove active call
    await supabase
      .from('active_walkie_calls')
      .delete()
      .or(`caller_id.eq.${currentUserId},callee_id.eq.${currentUserId}`);

    setIsConnected(false);
    setIsConnecting(false);
    setIsTalking(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Walkie-Talkie with {recipientName}
          </DialogTitle>
        </DialogHeader>

        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className="flex flex-col items-center gap-6 py-8">
          {/* Connection Status */}
          <div className="text-center">
            {isConnecting && (
              <p className="text-sm text-muted-foreground animate-pulse">
                Connecting to {recipientName}...
              </p>
            )}
            {isConnected && (
              <div className="flex items-center gap-2 text-green-600">
                <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
                <p className="text-sm font-medium">Connected</p>
              </div>
            )}
          </div>

          {/* Push-to-Talk Button */}
          <div className="relative">
            <Button
              size="lg"
              variant={isTalking ? "default" : "outline"}
              className={`h-32 w-32 rounded-full transition-all ${
                isTalking ? 'scale-110 shadow-lg bg-primary' : ''
              }`}
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onMouseLeave={stopTalking}
              onTouchStart={startTalking}
              onTouchEnd={stopTalking}
              disabled={!isConnected}
            >
              {isTalking ? (
                <Mic className="h-12 w-12" />
              ) : (
                <MicOff className="h-12 w-12" />
              )}
            </Button>
          </div>

          <p className="text-sm text-center text-muted-foreground max-w-[280px]">
            {isConnected 
              ? 'Hold the button to talk. Release to listen.'
              : 'Waiting for connection...'
            }
          </p>

          {/* End Call Button */}
          <Button
            variant="destructive"
            onClick={endCall}
            className="w-full"
          >
            End Call
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
