import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { Button } from "./ui/button";

type StatusChange = {
  id: string;
  taskTitle: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
};

export const StatusChangeNotification = () => {
  const [notifications, setNotifications] = useState<StatusChange[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUser(user);
      
      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setIsAdmin(roleData?.role === 'admin');
    };

    initUser();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Subscribe to task audit log for status changes
    const channel = supabase
      .channel('status-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_audit_log',
          filter: `action=eq.status_changed`
        },
        async (payload) => {
          const auditLog = payload.new;
          
          // Skip if the change was made by the current user
          if (auditLog.changed_by === currentUser.id) return;

          // Get task details
          const { data: taskData } = await supabase
            .from('tasks')
            .select('title, created_by, assigned_to')
            .eq('id', auditLog.task_id)
            .single();

          if (!taskData) return;

          // Show notification if:
          // 1. User is admin, OR
          // 2. User is the task creator, OR
          // 3. User is assigned to the task
          const shouldNotify = isAdmin || 
                              taskData.created_by === currentUser.id || 
                              taskData.assigned_to === currentUser.id;

          if (!shouldNotify) return;

          // Get the person who made the change
          const { data: changedByProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', auditLog.changed_by)
            .single();

          const oldStatus = auditLog.old_values?.status || 'unknown';
          const newStatus = auditLog.new_values?.status || 'unknown';

          const notification: StatusChange = {
            id: auditLog.id,
            taskTitle: taskData.title,
            oldStatus: formatStatus(oldStatus),
            newStatus: formatStatus(newStatus),
            changedBy: auditLog.changed_by,
            changedByName: changedByProfile?.full_name || 'Someone',
            timestamp: new Date().toISOString(),
          };

          // Play notification sound
          playNotificationSound();

          // Add to notifications list
          setNotifications(prev => [notification, ...prev]);

          // Show toast
          toast.info(
            `${notification.changedByName} moved "${taskData.title}" from ${notification.oldStatus} to ${notification.newStatus}`,
            {
              duration: 8000,
              icon: <Bell className="h-5 w-5 text-accent" />,
            }
          );

          // Auto-remove after 10 seconds
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
          }, 10000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, isAdmin]);

  const playNotificationSound = () => {
    // Create an audio context and play a notification beep
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Frequency in Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const formatStatus = (status: string): string => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-card border-2 border-accent rounded-lg shadow-lg p-4 animate-in slide-in-from-right-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-1">
              <Bell className="h-5 w-5 text-accent animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground mb-1">
                Pipeline Change Alert
              </p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{notification.changedByName}</span>
                {' '}moved{' '}
                <span className="font-medium text-foreground">"{notification.taskTitle}"</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-destructive">{notification.oldStatus}</span>
                {' → '}
                <span className="text-success">{notification.newStatus}</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => dismissNotification(notification.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
