import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Volume2, VolumeX, Play, Pause } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';

interface VoiceAnnouncement {
  id: string;
  sender_id: string;
  audio_url: string;
  duration: number;
  message_text: string | null;
  is_played: boolean;
  is_broadcast: boolean;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

export const VoiceAnnouncementPlayer = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<VoiceAnnouncement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayFailed, setAutoplayFailed] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Subscribe to new voice announcements
    const channel = supabase
      .channel('voice-announcements')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_announcements',
          filter: `recipient_id=eq.${currentUserId}`
        },
        async (payload) => {
          console.log('📢 New voice announcement received:', payload);
          
          // Fetch full announcement data with sender info
          const { data: announcement, error } = await supabase
            .from('voice_announcements')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (!announcement || error) return;

          // Fetch sender profile separately
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', announcement.sender_id)
            .single();

          const data = { ...announcement, profiles: profile };

          if (data && !error) {
            setAnnouncement(data as any);
            playAnnouncement(data.audio_url);
            
            toast({
              title: '📢 Voice Announcement',
              description: `From ${data.profiles.full_name}`,
              duration: 5000,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_announcements',
          filter: `is_broadcast=eq.true`
        },
        async (payload) => {
          console.log('📢 New broadcast announcement:', payload);
          
          const { data: announcement, error } = await supabase
            .from('voice_announcements')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (!announcement || error) return;

          // Fetch sender profile separately
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', announcement.sender_id)
            .single();

          const data = { ...announcement, profiles: profile };

          if (data && !error) {
            setAnnouncement(data as any);
            playAnnouncement(data.audio_url);
            
            toast({
              title: '📢 Team Announcement',
              description: `From ${data.profiles.full_name}`,
              duration: 5000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, toast]);

  const playAnnouncement = async (audioUrl: string, isManual = false) => {
    try {
      console.log('🔊 Attempting to play announcement:', audioUrl);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.volume = 1.0;
      setIsPlaying(true);
      setAutoplayFailed(false);
      
      audio.onended = async () => {
        console.log('✅ Audio playback ended');
        setIsPlaying(false);
        if (announcement) {
          await supabase
            .from('voice_announcements')
            .update({ is_played: true })
            .eq('id', announcement.id);
        }
        setTimeout(() => setAnnouncement(null), 2000);
      };

      audio.onerror = (e) => {
        console.error('❌ Audio error:', e);
        setIsPlaying(false);
        setAutoplayFailed(true);
      };

      await audio.play();
      console.log('✅ Audio playing successfully');
    } catch (error) {
      console.error('❌ Error playing announcement:', error);
      setIsPlaying(false);
      
      // Only set autoplay failed if this wasn't a manual attempt
      if (!isManual) {
        setAutoplayFailed(true);
        toast({
          title: '🔊 Click to Play',
          description: 'Click the play button to hear the announcement',
        });
      } else {
        toast({
          title: 'Playback Error',
          description: 'Could not play voice announcement. Check audio file.',
          variant: 'destructive',
        });
      }
    }
  };

  const handleManualPlay = () => {
    if (announcement && announcement.audio_url) {
      playAnnouncement(announcement.audio_url, true);
    }
  };

  const stopAnnouncement = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      setAutoplayFailed(false);
      setAnnouncement(null);
    }
  };

  if (!announcement) return null;

  return (
    <Card className="fixed top-20 right-4 z-50 p-4 w-80 shadow-2xl border-2 border-primary animate-in slide-in-from-right">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {isPlaying ? (
            <Volume2 className="h-6 w-6 text-primary animate-pulse" />
          ) : (
            <VolumeX className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {announcement.is_broadcast ? '📢 Team Announcement' : '📢 Voice Message'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            From: {announcement.profiles?.full_name}
          </p>
          {announcement.message_text && (
            <p className="text-sm mt-2 text-foreground">
              {announcement.message_text}
            </p>
          )}
          
          {/* Play/Pause button */}
          <div className="flex items-center gap-2 mt-3">
            {(autoplayFailed || !isPlaying) && (
              <Button
                onClick={handleManualPlay}
                size="sm"
                className="gap-2"
                disabled={isPlaying}
              >
                <Play className="h-4 w-4" />
                Play Audio
              </Button>
            )}
            {isPlaying && (
              <div className="flex items-center gap-2 flex-1">
                <Pause className="h-4 w-4 text-primary" />
                <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
                </div>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={stopAnnouncement}
          className="flex-shrink-0"
        >
          ✕
        </Button>
      </div>
    </Card>
  );
};