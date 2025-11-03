import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mic, Radio } from 'lucide-react';

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
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (open && currentUserId && recipientId) {
      setupAudioReceiver();
    }

    return () => {
      cleanup();
    };
  }, [open, currentUserId, recipientId]);

  const setupAudioReceiver = () => {
    // Set up audio context for playback
    audioContextRef.current = new AudioContext();

    // Listen for incoming audio chunks
    const channel = supabase
      .channel(`walkie-audio-${currentUserId}`)
      .on(
        'broadcast',
        { event: 'audio-chunk' },
        async (payload) => {
          if (payload.payload.senderId === recipientId) {
            await playAudioChunk(payload.payload.audioData);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    console.log('🎧 Audio receiver ready');
  };

  const playAudioChunk = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) return;

      // Decode base64 to audio buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
    } catch (error) {
      console.error('Error playing audio chunk:', error);
    }
  };

  const startTalking = async () => {
    try {
      setIsTalking(true);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } 
      });

      // Create media recorder to capture audio chunks
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Send audio chunks as they're available
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Audio = (reader.result as string).split(',')[1];
            
            // Broadcast audio chunk immediately via Supabase Realtime
            await channelRef.current?.send({
              type: 'broadcast',
              event: 'audio-chunk',
              payload: {
                senderId: currentUserId,
                recipientId: recipientId,
                audioData: base64Audio
              }
            });
          };
          reader.readAsDataURL(event.data);
        }
      };

      // Start recording and send chunks every 100ms for real-time streaming
      mediaRecorder.start(100);
      
      console.log('🎤 Started talking');
    } catch (error: any) {
      console.error('Error starting to talk:', error);
      toast.error('Microphone access denied');
      setIsTalking(false);
    }
  };

  const stopTalking = () => {
    setIsTalking(false);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      
      // Stop all tracks
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    
    console.log('🔇 Stopped talking');
  };

  const endCall = () => {
    cleanup();
    onOpenChange(false);
  };

  const cleanup = async () => {
    // Stop talking if active
    if (isTalking) {
      stopTalking();
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Unsubscribe from channel
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

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

        <div className="flex flex-col items-center gap-6 py-8">
          {/* Ready indicator */}
          <div className="text-center">
            <div className="flex items-center gap-2 text-green-600">
              <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
              <p className="text-sm font-medium">Ready to talk</p>
            </div>
          </div>

          {/* Push-to-Talk Button */}
          <div className="relative">
            <Button
              size="lg"
              variant={isTalking ? "default" : "outline"}
              className={`h-32 w-32 rounded-full transition-all ${
                isTalking ? 'scale-110 shadow-lg bg-primary animate-pulse' : ''
              }`}
              onMouseDown={startTalking}
              onMouseUp={stopTalking}
              onMouseLeave={stopTalking}
              onTouchStart={startTalking}
              onTouchEnd={stopTalking}
            >
              <Mic className={`h-12 w-12 ${isTalking ? 'animate-pulse' : ''}`} />
            </Button>
          </div>

          <p className="text-sm text-center text-muted-foreground max-w-[280px]">
            Hold the button to talk. Release to listen.
            <br />
            <span className="text-xs">Your voice streams instantly to {recipientName}</span>
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
