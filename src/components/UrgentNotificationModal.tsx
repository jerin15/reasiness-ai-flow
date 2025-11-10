import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { AlertTriangle, Bell } from 'lucide-react';

interface UrgentNotification {
  id: string;
  sender_id: string;
  title: string;
  message: string;
  priority: string;
  is_acknowledged: boolean;
  is_broadcast: boolean;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

export const UrgentNotificationModal = () => {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [notification, setNotification] = useState<UrgentNotification | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    initUser();

    // Initialize audio context for alert sound
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    setAudioContext(ctx);

    // Request notification permission immediately for urgent notifications
    const requestNotificationPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        console.log('🔔 Requesting notification permission for urgent alerts...');
        const permission = await Notification.requestPermission();
        console.log('🔔 Notification permission:', permission);
        
        if (permission === 'granted') {
          console.log('✅ Urgent notifications enabled!');
        } else {
          console.warn('⚠️ Notification permission denied. Urgent alerts will only show when app is active.');
        }
      } else if (Notification.permission === 'granted') {
        console.log('✅ Notification permission already granted');
      }
    };
    
    requestNotificationPermission();

    return () => {
      ctx.close();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    // Subscribe to urgent notifications
    const channel = supabase
      .channel('urgent-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'urgent_notifications',
          filter: `recipient_id=eq.${currentUserId}`
        },
        async (payload) => {
          console.log('🚨 Urgent notification received:', payload);
          await handleNewNotification(payload.new.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'urgent_notifications',
          filter: `is_broadcast=eq.true`
        },
        async (payload) => {
          console.log('🚨 Broadcast urgent notification:', payload);
          await handleNewNotification(payload.new.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleNewNotification = async (notificationId: string) => {
    // Fetch full notification data
    const { data: notification, error } = await supabase
      .from('urgent_notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (!notification || error) return;

    // Fetch sender profile separately
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', notification.sender_id)
      .single();

    const data = { ...notification, profiles: profile };

    if (data && !error) {
      setNotification(data as any);
      playAlertSound();
      
      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
      }

      // Show browser notification ALWAYS (works even when tab is in background)
      if (Notification.permission === 'granted') {
        console.log('🚨 Showing urgent browser notification:', data.title);
        const notification = new Notification('🚨 URGENT: ' + data.title, {
          body: data.message,
          tag: 'urgent-notification-' + notificationId,
          requireInteraction: true,
          icon: '/rea-logo-icon.png',
          badge: '/rea-logo-icon.png',
          silent: false,
        });

        // When user clicks notification, focus the window
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } else if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Fallback: Try to show via service worker
        console.log('🚨 Attempting notification via service worker');
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification('🚨 URGENT: ' + data.title, {
            body: data.message,
            tag: 'urgent-notification-' + notificationId,
            requireInteraction: true,
            icon: '/rea-logo-icon.png',
            badge: '/rea-logo-icon.png',
            silent: false,
          });
        });
      } else {
        console.warn('⚠️ Cannot show browser notification - permission not granted or service worker not available');
      }
    }
  };

  const playAlertSound = () => {
    if (!audioContext) return;

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      // Play multiple beeps
      setTimeout(() => playAlertSound(), 600);
      setTimeout(() => playAlertSound(), 1200);
    } catch (error) {
      console.error('Error playing alert sound:', error);
    }
  };

  const acknowledgeNotification = async () => {
    if (!notification) return;

    await supabase
      .from('urgent_notifications')
      .update({
        is_acknowledged: true,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', notification.id);

    setNotification(null);
  };

  if (!notification) return null;

  return (
    <AlertDialog open={!!notification}>
      <AlertDialogContent className="max-w-md border-4 border-destructive shadow-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-xl flex items-center gap-2">
                <Bell className="h-5 w-5 animate-bounce" />
                {notification.title}
              </AlertDialogTitle>
              <p className="text-xs text-muted-foreground mt-1">
                From: {notification.profiles?.full_name}
              </p>
            </div>
          </div>
          <AlertDialogDescription className="text-base text-foreground">
            {notification.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={acknowledgeNotification}
            className="w-full bg-primary hover:bg-primary/90 text-lg py-6"
          >
            ✓ Got It!
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};