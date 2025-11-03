import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface VoiceMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  audio_url: string;
  duration_seconds: number | null;
  is_played: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

export const VoiceMessageNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };

    initUser();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Create audio element for notification sound
    const audio = new Audio('/notification.mp3');

    // Set to track already notified messages
    const notifiedMessages = new Set<string>();

    const channel = supabase
      .channel('voice-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_messages',
          filter: `recipient_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const newMessage = payload.new as VoiceMessage;
          
          // Prevent duplicate notifications
          if (notifiedMessages.has(newMessage.id)) return;
          notifiedMessages.add(newMessage.id);

          // Fetch sender info
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', newMessage.sender_id)
            .single();

          const senderName = senderProfile?.full_name || senderProfile?.email || 'Someone';

          // Play notification sound
          audio.play().catch(console.error);

          // Show toast notification
          toast.info(`🎤 Voice message from ${senderName}`, {
            description: `Duration: ${newMessage.duration_seconds || 0}s`,
            duration: 5000,
            action: {
              label: 'Listen',
              onClick: () => {
                // Trigger event to open chat with voice message
                console.log('Voice message clicked:', newMessage.id);
                window.dispatchEvent(new CustomEvent('play-voice-message', { 
                  detail: { messageId: newMessage.id, audioUrl: newMessage.audio_url } 
                }));
              },
            },
          });

          // Browser notification if permission granted
          if (Notification.permission === 'granted') {
            new Notification(`Voice message from ${senderName}`, {
              body: `Duration: ${newMessage.duration_seconds || 0} seconds`,
              icon: '/rea-advertising-logo.jpg',
              tag: newMessage.id,
            });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [currentUserId]);

  return null;
};
