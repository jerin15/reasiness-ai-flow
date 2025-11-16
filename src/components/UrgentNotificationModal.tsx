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
  const [notificationQueue, setNotificationQueue] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [lastAlertTime, setLastAlertTime] = useState(0);

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
      if ('Notification' in window) {
        if (Notification.permission === 'default') {
          console.log('🔔 Requesting notification permission for urgent alerts...');
          try {
            const permission = await Notification.requestPermission();
            console.log('🔔 Notification permission:', permission);
            
            if (permission === 'granted') {
              console.log('✅ Urgent notifications enabled!');
            } else {
              console.warn('⚠️ Notification permission denied. Urgent alerts will only show when app is active.');
            }
          } catch (error) {
            console.warn('⚠️ Notification API not supported on this device:', error);
          }
        } else if (Notification.permission === 'granted') {
          console.log('✅ Notification permission already granted');
        }
      } else {
        console.log('ℹ️ Notification API not available on this device');
      }
    };
    
    requestNotificationPermission();

    return () => {
      ctx.close();
    };
  }, []);

  // Process notification queue
  useEffect(() => {
    if (notificationQueue.length === 0 || isProcessing || notification) return;

    const processNext = async () => {
      setIsProcessing(true);
      const nextId = notificationQueue[0];
      
      try {
        await handleNewNotification(nextId);
      } catch (error) {
        console.error('Error processing notification:', error);
      } finally {
        setNotificationQueue(prev => prev.slice(1));
        setIsProcessing(false);
      }
    };

    processNext();
  }, [notificationQueue, isProcessing, notification]);

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
        (payload) => {
          console.log('🚨 Urgent notification received:', payload);
          setNotificationQueue(prev => [...prev, payload.new.id]);
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
        (payload) => {
          console.log('🚨 Broadcast urgent notification:', payload);
          setNotificationQueue(prev => [...prev, payload.new.id]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleNewNotification = async (notificationId: string) => {
    try {
      // Fetch full notification data
      const { data: notification, error } = await supabase
        .from('urgent_notifications')
        .select('*')
        .eq('id', notificationId)
        .single();

      if (error) {
        console.error('Error fetching notification:', error);
        return;
      }

      if (!notification) return;

      // Check if this is an estimation-specific broadcast
      const isEstimationBroadcast = notification.is_broadcast && 
        (notification.title?.includes('ESTIMATION') || 
         notification.title?.includes('PROGRESS UPDATE') ||
         notification.title?.includes('GOOD MORNING') ||
         notification.message?.includes('quotations'));

      // If it's an estimation broadcast, check if user has estimation role
      if (isEstimationBroadcast && currentUserId) {
        const { data: userRole } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', currentUserId)
          .eq('role', 'estimation')
          .maybeSingle();

        // Skip this notification if user doesn't have estimation role
        if (!userRole) {
          console.log('⏭️ Skipping estimation broadcast for non-estimation user');
          return;
        }
      }

      // Fetch sender profile separately with error handling
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', notification.sender_id)
        .single();

      const data = { 
        ...notification, 
        profiles: profile || { full_name: 'System' }
      };

      setNotification(data as any);
      playAlertSound();
      
      // Vibrate if supported
      if (navigator.vibrate) {
        try {
          navigator.vibrate([200, 100, 200, 100, 200]);
        } catch (e) {
          console.warn('Vibration not supported:', e);
        }
      }

      // Show browser notification with error handling
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          console.log('🚨 Showing urgent browser notification:', data.title);
          const browserNotification = new Notification('🚨 URGENT: ' + data.title, {
            body: data.message,
            tag: 'urgent-notification-' + notificationId,
            requireInteraction: true,
            icon: '/rea-logo-icon.png',
            badge: '/rea-logo-icon.png',
            silent: false,
          });

          browserNotification.onclick = () => {
            window.focus();
            browserNotification.close();
          };
        }
      } catch (notifError) {
        console.warn('Browser notification error:', notifError);
      }
    } catch (error) {
      console.error('Critical error in handleNewNotification:', error);
    }
  };

  const playAlertSound = () => {
    if (!audioContext) return;

    // Throttle alerts to prevent audio glitches
    const now = Date.now();
    if (now - lastAlertTime < 1000) {
      console.log('Alert throttled');
      return;
    }
    setLastAlertTime(now);

    try {
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);

      // Clean up oscillator after it stops
      setTimeout(() => {
        try {
          oscillator.disconnect();
          gainNode.disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
      }, 300);
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
          <AlertDialogDescription className="text-base text-foreground whitespace-pre-wrap">
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