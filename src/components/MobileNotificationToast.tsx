import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, Bell, MessageCircle, AlertTriangle, Phone, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: 'urgent' | 'message' | 'call' | 'announcement' | 'task' | 'reminder';
  title: string;
  body: string;
  priority?: 'high' | 'normal';
  timestamp: Date;
  data?: any;
}

// Global notification queue
let notificationListeners: ((notification: NotificationItem) => void)[] = [];

export const pushNotification = (notification: Omit<NotificationItem, 'id' | 'timestamp'>) => {
  const fullNotification: NotificationItem = {
    ...notification,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };
  notificationListeners.forEach(listener => listener(fullNotification));
};

export const MobileNotificationToast = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSoundTime = useRef<number>(0);

  // Initialize audio context on first user interaction
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  // Play notification sound
  const playSound = useCallback((type: NotificationItem['type']) => {
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const now = Date.now();
    if (now - lastSoundTime.current < 500) return;
    lastSoundTime.current = now;

    try {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Different sounds for different types
      const freq = type === 'urgent' ? 880 : type === 'call' ? 660 : 520;
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);

      // Vibrate if supported
      if (navigator.vibrate) {
        navigator.vibrate(type === 'urgent' ? [200, 100, 200] : [100, 50, 100]);
      }
    } catch (e) {
      console.warn('Sound playback failed:', e);
    }
  }, [initAudio]);

  // Add notification
  const addNotification = useCallback((notification: NotificationItem) => {
    setNotifications(prev => {
      // Prevent duplicates
      if (prev.some(n => n.id === notification.id)) return prev;
      
      // Keep max 5 notifications
      const updated = [notification, ...prev].slice(0, 5);
      return updated;
    });

    playSound(notification.type);

    // Auto-dismiss after 8 seconds for non-urgent
    if (notification.priority !== 'high' && notification.type !== 'urgent') {
      setTimeout(() => {
        dismissNotification(notification.id);
      }, 8000);
    }
  }, [playSound]);

  // Dismiss notification
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Register as listener
  useEffect(() => {
    notificationListeners.push(addNotification);
    return () => {
      notificationListeners = notificationListeners.filter(l => l !== addNotification);
    };
  }, [addNotification]);

  // Initialize user and role
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        
        setUserRole(roleData?.role || null);
      }
    };
    init();

    // Enable audio on first touch (mobile requirement)
    const enableAudio = () => {
      initAudio();
      document.removeEventListener('touchstart', enableAudio);
      document.removeEventListener('click', enableAudio);
    };
    document.addEventListener('touchstart', enableAudio);
    document.addEventListener('click', enableAudio);

    return () => {
      document.removeEventListener('touchstart', enableAudio);
      document.removeEventListener('click', enableAudio);
    };
  }, [initAudio]);

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!currentUserId) return;

    console.log('📡 Setting up real-time notifications for user:', currentUserId);

    // Urgent notifications channel
    const urgentChannel = supabase
      .channel('mobile-urgent-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'urgent_notifications',
        },
        async (payload) => {
          const notif = payload.new as any;
          
          // Check if notification is for this user
          if (notif.recipient_id && notif.recipient_id !== currentUserId && !notif.is_broadcast) {
            return;
          }

          // Get sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', notif.sender_id)
            .single();

          addNotification({
            id: notif.id,
            type: 'urgent',
            title: notif.title,
            body: notif.message,
            priority: 'high',
            timestamp: new Date(notif.created_at),
            data: { senderId: notif.sender_id, senderName: sender?.full_name },
          });
        }
      )
      .subscribe();

    // Messages channel
    const messagesChannel = supabase
      .channel('mobile-messages-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const msg = payload.new as any;
          
          // Only show notifications for messages sent to this user
          if (msg.recipient_id !== currentUserId || msg.sender_id === currentUserId) {
            return;
          }

          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', msg.sender_id)
            .single();

          addNotification({
            id: msg.id,
            type: 'message',
            title: `Message from ${sender?.full_name || 'Someone'}`,
            body: msg.message?.substring(0, 100) || 'New message',
            priority: 'normal',
            timestamp: new Date(msg.created_at),
          });
        }
      )
      .subscribe();

    // Voice announcements channel
    const voiceChannel = supabase
      .channel('mobile-voice-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_announcements',
        },
        async (payload) => {
          const announcement = payload.new as any;
          
          if (announcement.recipient_id && announcement.recipient_id !== currentUserId && !announcement.is_broadcast) {
            return;
          }

          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', announcement.sender_id)
            .single();

          addNotification({
            id: announcement.id,
            type: 'announcement',
            title: 'Voice Message',
            body: `${sender?.full_name || 'Someone'} sent a voice message`,
            priority: 'normal',
            timestamp: new Date(announcement.created_at),
          });
        }
      )
      .subscribe();

    // Task updates channel (for assigned tasks)
    const taskChannel = supabase
      .channel('mobile-task-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
        },
        async (payload) => {
          const task = payload.new as any;
          const oldTask = payload.old as any;
          
          // Only notify if assigned to this user and status changed
          if (task.assigned_to !== currentUserId) return;
          if (oldTask.status === task.status) return;

          addNotification({
            id: `task-${task.id}-${Date.now()}`,
            type: 'task',
            title: 'Task Updated',
            body: `\"${task.title}\" moved to ${task.status.replace(/_/g, ' ')}`,
            priority: 'normal',
            timestamp: new Date(),
          });
        }
      )
      .subscribe();

    // Walkie-talkie calls channel
    const walkieChannel = supabase
      .channel('mobile-walkie-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'active_walkie_calls',
          filter: `callee_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const call = payload.new as any;

          const { data: caller } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', call.caller_id)
            .single();

          addNotification({
            id: call.id,
            type: 'call',
            title: 'Incoming Call',
            body: `${caller?.full_name || 'Someone'} is calling`,
            priority: 'high',
            timestamp: new Date(),
          });
        }
      )
      .subscribe();

    console.log('✅ Real-time notification channels active');

    return () => {
      supabase.removeChannel(urgentChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(voiceChannel);
      supabase.removeChannel(taskChannel);
      supabase.removeChannel(walkieChannel);
    };
  }, [currentUserId, addNotification]);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'urgent': return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'message': return <MessageCircle className="h-5 w-5 text-primary" />;
      case 'call': return <Phone className="h-5 w-5 text-green-500" />;
      case 'announcement': return <Volume2 className="h-5 w-5 text-blue-500" />;
      case 'task': return <Bell className="h-5 w-5 text-amber-500" />;
      case 'reminder': return <Bell className="h-5 w-5 text-purple-500" />;
      default: return <Bell className="h-5 w-5" />;
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] p-2 pointer-events-none flex flex-col gap-2 max-h-[50vh] overflow-hidden">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className={cn(
            "pointer-events-auto mx-auto w-full max-w-md rounded-xl shadow-2xl border animate-in slide-in-from-top-2 duration-300",
            notification.type === 'urgent' 
              ? "bg-destructive/10 border-destructive" 
              : "bg-background border-border",
            notification.priority === 'high' && "ring-2 ring-destructive ring-offset-2"
          )}
          style={{ 
            animationDelay: `${index * 50}ms`,
            zIndex: 9999 - index 
          }}
        >
          <div className="flex items-start gap-3 p-4">
            <div className={cn(
              "flex-shrink-0 p-2 rounded-full",
              notification.type === 'urgent' ? "bg-destructive/20 animate-pulse" : "bg-muted"
            )}>
              {getIcon(notification.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className={cn(
                  "font-semibold text-sm truncate",
                  notification.type === 'urgent' && "text-destructive"
                )}>
                  {notification.title}
                </h4>
                <button
                  onClick={() => dismissNotification(notification.id)}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-muted/50 transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                {notification.body}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {notification.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

