import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';

interface VoiceCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientId: string;
  recipientName: string;
  isIncoming?: boolean;
  callId?: string;
  offer?: RTCSessionDescriptionInit;
}

export const VoiceCallDialog = ({ 
  open, 
  onOpenChange, 
  recipientId, 
  recipientName,
  isIncoming = false,
  callId: initialCallId,
  offer: incomingOffer
}: VoiceCallDialogProps) => {
  const [callStatus, setCallStatus] = useState<'connecting' | 'ringing' | 'connected' | 'ended'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [callId, setCallId] = useState<string>(initialCallId || '');
  const [callDuration, setCallDuration] = useState(0);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Get current user's name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setCurrentUserName(profile.full_name);
        }
      }
    };
    initUser();
  }, []);

  useEffect(() => {
    if (open && currentUserId) {
      if (isIncoming) {
        handleIncomingCall();
      } else {
        initiateCall();
      }
    }

    return () => {
      cleanup();
    };
  }, [open, currentUserId]);

  const setupPeerConnection = async () => {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;

    // Get local audio stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = stream;

      // Add audio track to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      console.log('🎤 Local stream added');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error('Microphone access denied');
      endCall();
      return null;
    }

    // Handle incoming audio stream
    pc.ontrack = (event) => {
      console.log('🔊 Received remote audio stream');
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play();
      setCallStatus('connected');
      startCallTimer();
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: {
            candidate: event.candidate,
            from: currentUserId,
            to: recipientId,
            callId: callId
          }
        });
        console.log('📤 Sent ICE candidate');
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        startCallTimer();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    return pc;
  };

  const initiateCall = async () => {
    try {
      const newCallId = `call_${Date.now()}`;
      setCallId(newCallId);
      setCallStatus('ringing');
      console.log('📞 Initiating call:', newCallId);

      const pc = await setupPeerConnection();
      if (!pc) return;

      // Create offer first
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Set up signaling channel
      const channelName = `voice-call-${newCallId}`;
      const channel = supabase
        .channel(channelName, {
          config: { broadcast: { self: false } }
        })
        .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
          console.log('📥 Received answer');
          if (payload.to === currentUserId && payload.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          }
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.to === currentUserId && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            console.log('📥 Added ICE candidate');
          }
        })
        .on('broadcast', { event: 'call-ended' }, ({ payload }) => {
          if (payload.to === currentUserId) {
            endCall();
          }
        })
        .subscribe();

      channelRef.current = channel;

      // Send call invitation to recipient's personal channel
      const inviteChannel = supabase.channel(`user-calls-${recipientId}`);
      await inviteChannel.send({
        type: 'broadcast',
        event: 'call-offer',
        payload: {
          offer: offer,
          from: currentUserId,
          fromName: currentUserName || 'Someone',
          to: recipientId,
          callId: newCallId
        }
      });

      console.log('📤 Sent call offer to recipient');
    } catch (error) {
      console.error('Error initiating call:', error);
      toast.error('Failed to initiate call');
      endCall();
    }
  };

  const handleIncomingCall = async () => {
    try {
      setCallStatus('ringing');
      const pc = await setupPeerConnection();
      if (!pc) return;

      // Set up signaling channel for this specific call
      const channelName = `voice-call-${callId}`;
      const channel = supabase
        .channel(channelName, {
          config: { broadcast: { self: false } }
        })
        .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
          if (payload.to === currentUserId && payload.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            console.log('📥 Added ICE candidate');
          }
        })
        .on('broadcast', { event: 'call-ended' }, ({ payload }) => {
          if (payload.to === currentUserId) {
            endCall();
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && incomingOffer) {
            // Process the offer once channel is ready
            handleOffer(pc, channel);
          }
        });

      channelRef.current = channel;
      
      console.log('✅ Ready to answer call on channel:', channelName);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      toast.error('Failed to answer call');
      endCall();
    }
  };

  const handleOffer = async (pc: RTCPeerConnection, channel: any) => {
    try {
      if (!incomingOffer) return;

      console.log('📥 Processing offer');
      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      
      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      // Send answer
      await channel.send({
        type: 'broadcast',
        event: 'call-answer',
        payload: {
          answer: answer,
          from: currentUserId,
          to: recipientId,
          callId: callId
        }
      });
      
      console.log('📤 Sent answer');
    } catch (error) {
      console.error('Error handling offer:', error);
      toast.error('Failed to process call');
      endCall();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const startCallTimer = () => {
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const endCall = async () => {
    setCallStatus('ended');

    // Send end call signal
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'call-ended',
        payload: {
          from: currentUserId,
          to: recipientId,
          callId: callId
        }
      });
    }

    cleanup();
    onOpenChange(false);
  };

  const cleanup = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setCallDuration(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Voice Call with {recipientName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-8">
          {/* Call Status */}
          <div className="text-center">
            <div className={`flex items-center gap-2 ${
              callStatus === 'connected' ? 'text-green-600' : 
              callStatus === 'ringing' ? 'text-blue-600' : 'text-yellow-600'
            }`}>
              <div className={`h-3 w-3 rounded-full ${
                callStatus === 'connected' ? 'bg-green-600' : 
                callStatus === 'ringing' ? 'bg-blue-600 animate-pulse' : 'bg-yellow-600'
              }`} />
              <p className="text-sm font-medium">
                {callStatus === 'connected' ? `Connected - ${formatDuration(callDuration)}` :
                 callStatus === 'ringing' ? 'Ringing...' : 'Connecting...'}
              </p>
            </div>
          </div>

          {/* Avatar / Visual indicator */}
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Volume2 className={`h-12 w-12 text-primary ${callStatus === 'connected' ? 'animate-pulse' : ''}`} />
          </div>

          {/* Call Controls */}
          <div className="flex gap-4">
            <Button
              size="lg"
              variant={isMuted ? "destructive" : "outline"}
              className="h-14 w-14 rounded-full"
              onClick={toggleMute}
              disabled={callStatus !== 'connected'}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            <Button
              size="lg"
              variant="destructive"
              className="h-14 w-14 rounded-full"
              onClick={endCall}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground max-w-[280px]">
            {callStatus === 'ringing' ? 'Waiting for answer...' : 
             callStatus === 'connected' ? 'Call in progress' : 'Establishing connection...'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
