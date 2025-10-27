import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string;
  email: string;
};

export const ChatNotification = () => {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    // Initialize notification sound
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZUQ8PVqzn77BdGAg+ltryym4lBSh+y/HVkEILFl+16+6oVhQLR6Hh8r9vIgU0idLz1YU1Bx9xwvDil1QQD1es5/CxXxgJPpba8sp9JgYngszx15FDDRZZ');
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Track shown notifications to avoid duplicates
    const shownNotifications = new Set<string>();

    // Subscribe to ALL new messages where current user is the recipient
    const channel = supabase
      .channel('global-chat-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUserId}`
        },
        async (payload) => {
          console.log('🔔 New message received:', payload);
          const newMsg = payload.new as Message;

          // Prevent duplicate notifications
          if (shownNotifications.has(newMsg.id)) {
            console.log('Duplicate notification prevented for message:', newMsg.id);
            return;
          }
          shownNotifications.add(newMsg.id);

          // Small delay to check if message was immediately read (user has chat open)
          setTimeout(async () => {
            const { data: messageCheck } = await supabase
              .from('messages')
              .select('is_read')
              .eq('id', newMsg.id)
              .single();

            // Don't notify if message was already read (chat was open)
            if (messageCheck?.is_read) {
              console.log('Message already read, skipping notification');
              return;
            }

            // Fetch sender's name
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', newMsg.sender_id)
              .single();

            const senderName = profile?.full_name || profile?.email || 'Someone';

            // Play alarm sound
            if (audioRef.current) {
              audioRef.current.volume = 0.8;
              audioRef.current.play().catch(e => console.log('Audio play failed:', e));
            }

            // Show toast notification
            toast.success(`💬 New message from ${senderName}`, {
              description: newMsg.message.length > 50 
                ? newMsg.message.substring(0, 50) + '...' 
                : newMsg.message,
              duration: 5000,
              action: {
                label: 'Open',
                onClick: () => {
                  // Mark as read
                  supabase
                    .from('messages')
                    .update({ is_read: true })
                    .eq('id', newMsg.id)
                    .then(() => console.log('Message marked as read'));
                }
              }
            });

            // Show browser notification
            if (Notification.permission === 'granted') {
              new Notification(`💬 ${senderName} sent you a message`, {
                body: newMsg.message,
                icon: '/favicon.ico',
                tag: newMsg.id,
                requireInteraction: false
              });
            } else if (Notification.permission === 'default') {
              Notification.requestPermission();
            }
          }, 500); // 500ms delay to allow chat dialog to mark as read
        }
      )
      .subscribe();

    // Request notification permission on mount
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return null; // This component doesn't render anything
};
