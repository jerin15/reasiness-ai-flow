import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  autoStart?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ 
  onTranscript, 
  onRecordingChange,
  autoStart = false 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setIsSupported(false);
      toast.error('Speech recognition not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Voice recognition started');
      setIsRecording(true);
      onRecordingChange?.(true);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart + ' ';
        } else {
          interimTranscript += transcriptPart;
        }
      }

      const currentTranscript = (finalTranscript + interimTranscript).trim();
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        toast.info('No speech detected. Please try again.');
      } else if (event.error === 'not-allowed') {
        toast.error('Microphone access denied. Please allow microphone access.');
      } else {
        toast.error(`Speech recognition error: ${event.error}`);
      }
      stopRecording();
    };

    recognition.onend = () => {
      console.log('Voice recognition ended');
      if (isRecording) {
        // If we were recording, send the final transcript
        if (transcript.trim()) {
          onTranscript(transcript.trim());
        }
        setIsRecording(false);
        onRecordingChange?.(false);
      }
    };

    recognitionRef.current = recognition;

    if (autoStart) {
      startRecording();
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = () => {
    if (!isSupported) {
      toast.error('Speech recognition not supported');
      return;
    }

    setTranscript('');
    try {
      recognitionRef.current?.start();
      toast.info('🎤 Listening... Speak your task details');
    } catch (error) {
      console.error('Error starting recognition:', error);
      toast.error('Failed to start recording');
    }
  };

  const stopRecording = () => {
    try {
      recognitionRef.current?.stop();
      if (transcript.trim()) {
        onTranscript(transcript.trim());
        toast.success('Voice input captured!');
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (!isSupported) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        <p className="text-sm">Voice input not supported in this browser.</p>
        <p className="text-xs mt-1">Please use Chrome, Edge, or Safari.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        type="button"
        onClick={toggleRecording}
        size="lg"
        variant={isRecording ? "destructive" : "default"}
        className={`rounded-full w-20 h-20 transition-all ${
          isRecording ? 'animate-pulse shadow-lg' : ''
        }`}
      >
        {isRecording ? (
          <MicOff className="h-8 w-8" />
        ) : (
          <Mic className="h-8 w-8" />
        )}
      </Button>

      <div className="text-center">
        <p className="text-sm font-medium">
          {isRecording ? 'Recording... Click to stop' : 'Click to start voice input'}
        </p>
        {transcript && (
          <div className="mt-4 p-4 bg-muted rounded-lg max-w-md">
            <p className="text-sm text-muted-foreground mb-1">Transcript:</p>
            <p className="text-sm">{transcript}</p>
          </div>
        )}
      </div>
    </div>
  );
};