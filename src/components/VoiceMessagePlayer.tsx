import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  autoPlay?: boolean;
  onPlaybackComplete?: () => void;
}

export const VoiceMessagePlayer = ({ 
  audioUrl, 
  duration, 
  autoPlay = false,
  onPlaybackComplete 
}: VoiceMessagePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [signedUrl, setSignedUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(null);

  // Get signed URL for private storage
  useEffect(() => {
    const getSignedUrl = async () => {
      if (!audioUrl) return;
      
      // Check if it's already a full URL or signed URL
      if (audioUrl.startsWith('http')) {
        setSignedUrl(audioUrl);
        return;
      }

      // Import supabase dynamically to avoid circular dependencies
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase.storage
        .from('voice-messages')
        .createSignedUrl(audioUrl, 3600);
      
      if (data?.signedUrl) {
        setSignedUrl(data.signedUrl);
      }
    };

    getSignedUrl();
  }, [audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setAudioDuration(Math.floor(audio.duration));
    };

    const handleTimeUpdate = () => {
      setCurrentTime(Math.floor(audio.currentTime));
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (onPlaybackComplete) {
        onPlaybackComplete();
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    if (autoPlay) {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [autoPlay, onPlaybackComplete]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!signedUrl) {
    return (
      <div className="flex items-center gap-3 bg-accent/50 rounded-lg p-3 min-w-[250px]">
        <span className="text-xs text-muted-foreground">Loading audio...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-accent/50 rounded-lg p-3 min-w-[250px]">
      <audio ref={audioRef} src={signedUrl} preload="metadata" />
      
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        className="h-8 w-8 shrink-0"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <div className="flex items-center gap-2 flex-1">
        <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <Slider
          value={[currentTime]}
          max={audioDuration || 100}
          step={1}
          onValueChange={handleSeek}
          className="flex-1"
        />
      </div>

      <span className="text-xs text-muted-foreground shrink-0 min-w-[40px] text-right">
        {formatTime(currentTime)} / {formatTime(audioDuration)}
      </span>
    </div>
  );
};
