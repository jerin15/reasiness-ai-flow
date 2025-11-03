import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Mic, Radio } from 'lucide-react';

// Audio utilities for real-time streaming
const encodeAudioToPCM16 = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
};

const decodePCM16ToFloat32 = (base64Audio: string): Float32Array => {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  
  return float32Array;
};

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
  const [isConnected, setIsConnected] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (open && currentUserId && recipientId) {
      setupConnection();
    }

    return () => {
      cleanup();
    };
  }, [open, currentUserId, recipientId]);

  const setupConnection = async () => {
    try {
      // Set up audio context for playback
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      // Listen for incoming audio chunks on OUR channel (so others can send to us)
      const channel = supabase
        .channel(`walkie-audio-${currentUserId}`, {
          config: {
            broadcast: { self: false, ack: false }
          }
        })
        .on(
          'broadcast',
          { event: 'audio-chunk' },
          async (payload) => {
            if (payload.payload.senderId === recipientId) {
              console.log('🎧 Received audio chunk from:', recipientId);
              await playAudioChunk(payload.payload.audioData);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true);
            console.log('🎧 Audio receiver ready');
          }
        });

      channelRef.current = channel;
    } catch (error) {
      console.error('Error setting up connection:', error);
      toast.error('Failed to connect audio');
    }
  };

  const playAudioChunk = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) return;

      const float32Data = decodePCM16ToFloat32(base64Audio);
      
      // Add to queue
      audioQueueRef.current.push(float32Data);
      
      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (error) {
      console.error('Error queuing audio chunk:', error);
    }
  };

  const playNextChunk = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }

    isPlayingRef.current = true;
    const audioData = audioQueueRef.current.shift()!;

    try {
      if (!audioContextRef.current) return;

      const audioBuffer = audioContextRef.current.createBuffer(
        1,
        audioData.length,
        audioContextRef.current.sampleRate
      );
      
      audioBuffer.getChannelData(0).set(audioData);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => {
        playNextChunk();
      };
      
      source.start(0);
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      playNextChunk();
    }
  };

  const startTalking = async () => {
    try {
      if (!isConnected) {
        toast.error('Audio not connected yet, please wait');
        return;
      }

      setIsTalking(true);
      
      // Request microphone access with specific settings for real-time
      streamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
          channelCount: 1
        } 
      });

      // Create audio context for processing
      const audioContext = new AudioContext({ sampleRate: 24000 });
      
      sourceRef.current = audioContext.createMediaStreamSource(streamRef.current);
      processorRef.current = audioContext.createScriptProcessor(4096, 1, 1);
      
      processorRef.current.onaudioprocess = async (e) => {
        if (!isTalking) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16Audio = encodeAudioToPCM16(new Float32Array(inputData));
        
        // Broadcast to recipient's channel (not our own!)
        const recipientChannel = supabase.channel(`walkie-audio-${recipientId}`);
        
        await recipientChannel.send({
          type: 'broadcast',
          event: 'audio-chunk',
          payload: {
            senderId: currentUserId,
            recipientId: recipientId,
            audioData: pcm16Audio
          }
        });
        
        console.log('🎤 Sent audio chunk to:', recipientId);
      };
      
      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContext.destination);
      
      console.log('🎤 Started talking');
    } catch (error: any) {
      console.error('Error starting to talk:', error);
      toast.error('Microphone access denied');
      setIsTalking(false);
    }
  };

  const stopTalking = () => {
    setIsTalking(false);
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
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
          {/* Connection indicator */}
          <div className="text-center">
            <div className={`flex items-center gap-2 ${isConnected ? 'text-green-600' : 'text-yellow-600'}`}>
              <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-600' : 'bg-yellow-600'} animate-pulse`} />
              <p className="text-sm font-medium">
                {isConnected ? 'Connected - Ready to talk' : 'Connecting...'}
              </p>
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
