import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";

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
    
    // Request notification permission immediately on load
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Track shown notifications to avoid duplicates
    const shownNotifications = new Set<string>();

    // Subscribe to ALL new messages where current user is the recipient - INSTANT notifications
    const channel = supabase
      .channel('global-chat-notifications', {
        config: {
          broadcast: { self: false } // Don't notify about own messages
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `recipient_id=eq.${currentUserId}`
        },
        async (payload) => {
          console.log('🔔 Instant message notification received:', payload);
          const newMsg = payload.new as Message;

          // Prevent duplicate notifications
          if (shownNotifications.has(newMsg.id)) {
            console.log('Duplicate notification prevented for message:', newMsg.id);
            return;
          }
          shownNotifications.add(newMsg.id);

          // Reduced delay for instant feel - just enough to prevent race condition
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

            // Play alarm sound INSTANTLY
            if (audioRef.current) {
              audioRef.current.volume = 0.8;
              audioRef.current.play().catch(e => console.log('Audio play failed:', e));
            }

            // Show toast notification with Reply button (WhatsApp Web style)
            toast.success(`💬 ${senderName}`, {
              description: newMsg.message.length > 50 
                ? newMsg.message.substring(0, 50) + '...' 
                : newMsg.message,
              duration: 8000,
              action: {
                label: 'Reply',
                onClick: async () => {
                  const reply = prompt(`Reply to ${senderName}:`);
                  if (reply && reply.trim()) {
                    try {
                      await supabase
                        .from('messages')
                        .insert({
                          sender_id: currentUserId,
                          recipient_id: newMsg.sender_id,
                          message: reply.trim(),
                          is_read: false
                        });
                      toast.success('Reply sent!');
                    } catch (err) {
                      console.error('Error sending reply:', err);
                      toast.error('Failed to send reply');
                    }
                  }
                }
              }
            });

            // CRITICAL: Always show browser notification when tab is not focused (WhatsApp Web behavior)
            if ('Notification' in window && Notification.permission === 'granted') {
              const notificationOptions = {
                body: newMsg.message.length > 100 ? newMsg.message.substring(0, 100) + '...' : newMsg.message,
                icon: '/rea-logo-icon.png',
                badge: '/rea-logo-icon.png',
                tag: `chat-${newMsg.id}`,
                requireInteraction: true,
                vibrate: [200, 100, 200],
                silent: false,
                data: { 
                  messageId: newMsg.id, 
                  senderId: newMsg.sender_id,
                  senderName: senderName,
                  recipientId: currentUserId
                }
              };
              
              try {
                // Use service worker for persistent notifications (works when tab is inactive)
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                  navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(`💬 ${senderName}`, notificationOptions);
                  });
                } else {
                  // Fallback to regular notification
                  const notification = new Notification(`💬 ${senderName}`, notificationOptions);
                  
                  notification.onclick = () => {
                    window.focus();
                    supabase
                      .from('messages')
                      .update({ 
                        is_read: true,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', newMsg.id);
                    notification.close();
                  };
                }
              } catch (error) {
                console.error('Error showing notification:', error);
              }
            } else if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then(permission => {
                console.log('Notification permission:', permission);
              });
            }
          }, 50); // Minimal delay to prevent race condition
        }
      )
      .subscribe((status) => {
        console.log('📡 Global chat notifications subscription:', status);
      });

    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return null; // This component doesn't render anything
};
