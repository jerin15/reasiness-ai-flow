import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, X, UserPlus, ArrowRightLeft, BellOff } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ScrollArea } from "./ui/scroll-area";

type TaskNotification = {
  id: string;
  taskTitle: string;
  type: 'status_change' | 'assignment_change' | 'task_created' | 'task_updated';
  oldStatus?: string;
  newStatus?: string;
  oldAssignee?: string;
  newAssignee?: string;
  changedBy: string;
  changedByName: string;
  timestamp: string;
  assignedUserName?: string;
  assignedUserRole?: string;
  clientName?: string;
};

export const StatusChangeNotification = () => {
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    // Load mute state from localStorage
    return localStorage.getItem('notifications_muted') === 'true';
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Track processed notification IDs to prevent duplicates
  const processedNotificationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUser(user);
      
      // Initialize notification sound
      audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZUQ8PVqzn77BdGAg+ltryym4lBSh+y/HVkEILFl+16+6oVhQLR6Hh8r9vIgU0idLz1YU1Bx9xwvDil1QQD1es5/CxXxgJPpba8sp9JgYngszx15FDDRZZ');
      
      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const userIsAdmin = roleData?.role === 'admin' || (roleData?.role as string) === 'technical_head';
      setIsAdmin(userIsAdmin);

      // Request notification permission immediately for mobile devices
      if ('Notification' in window) {
        if (Notification.permission === 'default') {
          console.log('📱 Requesting notification permission for mobile...');
          const permission = await Notification.requestPermission();
          console.log('📱 Notification permission:', permission);
          
          if (permission === 'granted') {
            toast.success('✅ Notifications enabled! You will receive alerts for task updates.', {
              duration: 3000
            });
          }
        } else if (Notification.permission === 'granted') {
          console.log('✅ Notifications already enabled');
        }
      }

      // Load historical notifications
      await loadHistoricalNotifications(user.id, userIsAdmin);
    };

    initUser();
  }, []);

  const loadHistoricalNotifications = async (userId: string, userIsAdmin: boolean) => {
    try {
      console.log('🔍 Loading historical notifications for admin:', userIsAdmin);
      
      // Get last 50 audit logs (status changes, assignments, creations, and updates)
      const { data: auditLogs } = await supabase
        .from('task_audit_log')
        .select('id, task_id, action, old_values, new_values, changed_by, created_at')
        .in('action', ['status_changed', 'assigned', 'created', 'updated'])
        .order('created_at', { ascending: false })
        .limit(50);

      console.log('📋 Found audit logs:', auditLogs?.length);
      if (!auditLogs) return;

      const historicalNotifications: TaskNotification[] = [];

      for (const auditLog of auditLogs) {
        // Get task details
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title, created_by, assigned_to')
          .eq('id', auditLog.task_id)
          .single();

        if (!taskData) continue;

        // CRITICAL: Proper notification filtering
        // Admins get ALL notifications
        // Team members ONLY get notifications for their CURRENT tasks
        const shouldNotify = userIsAdmin || 
                            taskData.assigned_to === userId ||
                            (taskData.created_by === userId && (!taskData.assigned_to || taskData.assigned_to === userId));

        console.log('📌 Task:', taskData.title, 'Should notify:', shouldNotify, 'Is admin:', userIsAdmin, 'Assigned to user:', taskData.assigned_to === userId);
        if (!shouldNotify) {
          console.log('⏭️ User not currently involved - skipping historical notification');
          continue;
        }

        // Get the person who made the change
        const { data: changedByProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', auditLog.changed_by)
          .single();

        if (auditLog.action === 'status_changed') {
          const oldStatus = (auditLog.old_values as any)?.status || 'unknown';
          const newStatus = (auditLog.new_values as any)?.status || 'unknown';

          historicalNotifications.push({
            id: auditLog.id,
            taskTitle: taskData.title,
            type: 'status_change',
            oldStatus: formatStatus(oldStatus),
            newStatus: formatStatus(newStatus),
            changedBy: auditLog.changed_by,
            changedByName: changedByProfile?.full_name || 'Someone',
            timestamp: auditLog.created_at,
          });
        } else if (auditLog.action === 'assigned') {
          const oldAssigneeId = (auditLog.old_values as any)?.assigned_to;
          const newAssigneeId = (auditLog.new_values as any)?.assigned_to;

          // Get assignee names
          let oldAssigneeName = 'Unassigned';
          let newAssigneeName = 'Unassigned';

          if (oldAssigneeId) {
            const { data: oldProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', oldAssigneeId)
              .single();
            oldAssigneeName = oldProfile?.full_name || 'Someone';
          }

          if (newAssigneeId) {
            const { data: newProfile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', newAssigneeId)
              .single();
            newAssigneeName = newProfile?.full_name || 'Someone';
          }

          historicalNotifications.push({
            id: auditLog.id,
            taskTitle: taskData.title,
            type: 'assignment_change',
            oldAssignee: oldAssigneeName,
            newAssignee: newAssigneeName,
            changedBy: auditLog.changed_by,
            changedByName: changedByProfile?.full_name || 'Someone',
            timestamp: auditLog.created_at,
          });
        } else if (auditLog.action === 'created') {
          // Task creation notification with detailed info
          const taskStatus = (auditLog.new_values as any)?.status || 'todo';
          const taskClientName = (auditLog.new_values as any)?.client_name;
          const assignedToId = taskData.assigned_to;
          
          let assignedUserName = 'Unassigned';
          let assignedUserRole = '';
          
          if (assignedToId) {
            const { data: assignedProfile } = await supabase
              .from('profiles')
              .select('full_name, user_roles(role)')
              .eq('id', assignedToId)
              .single();
            
            assignedUserName = assignedProfile?.full_name || 'Someone';
            assignedUserRole = (assignedProfile?.user_roles as any)?.[0]?.role || '';
          }
          
          historicalNotifications.push({
            id: auditLog.id,
            taskTitle: taskData.title,
            type: 'task_created',
            changedBy: auditLog.changed_by,
            changedByName: changedByProfile?.full_name || 'Someone',
            timestamp: auditLog.created_at,
            newStatus: formatStatus(taskStatus),
            assignedUserName,
            assignedUserRole,
            clientName: taskClientName,
          });
        } else if (auditLog.action === 'updated') {
          // Task update notification
          historicalNotifications.push({
            id: auditLog.id,
            taskTitle: taskData.title,
            type: 'task_updated',
            changedBy: auditLog.changed_by,
            changedByName: changedByProfile?.full_name || 'Someone',
            timestamp: auditLog.created_at,
          });
        }
      }

      console.log('✅ Loaded', historicalNotifications.length, 'notifications for admin:', userIsAdmin);
      setNotifications(historicalNotifications);
    } catch (error) {
      console.error('Error loading historical notifications:', error);
    }
  };

  useEffect(() => {
    if (!currentUser) return;

    // Subscribe to task audit log for status changes AND assignment changes
    const channel = supabase
      .channel(`task-changes-${currentUser.id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: currentUser.id }
        }
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_audit_log',
        },
        async (payload) => {
          console.log('📢 Task change detected:', payload);
          const auditLog = payload.new;
          
          // Deduplication check - prevent processing the same notification twice
          if (processedNotificationsRef.current.has(auditLog.id)) {
            console.log('⏭️ Duplicate notification prevented:', auditLog.id);
            return;
          }
          processedNotificationsRef.current.add(auditLog.id);
          
          // Clear old entries periodically (keep last 100)
          if (processedNotificationsRef.current.size > 100) {
            const entries = Array.from(processedNotificationsRef.current);
            processedNotificationsRef.current = new Set(entries.slice(-100));
          }
          
          // Only handle status_changed, assigned, created, and updated actions
          if (!['status_changed', 'assigned', 'created', 'updated'].includes(auditLog.action)) return;

          // Get task details first
          const { data: taskData } = await supabase
            .from('tasks')
            .select('title, created_by, assigned_to')
            .eq('id', auditLog.task_id)
            .single();

          if (!taskData) return;

          // Skip if the change was made by the current user (don't notify yourself)
          if (auditLog.changed_by === currentUser.id) {
            console.log('⏭️ Skipping self-notification');
            return;
          }

          // CRITICAL NOTIFICATION FILTERING:
          // Admins: Get ALL notifications
          // Team members: ONLY get notifications for:
          //   - Tasks they CURRENTLY have assigned to them
          //   - Tasks they created (only if still involved)
          
          let shouldNotify = false;
          const isTaskCreator = taskData.created_by === currentUser.id;
          const isCurrentAssignee = taskData.assigned_to === currentUser.id;

          console.log('🔍 Checking notification eligibility:', {
            task: taskData.title,
            action: auditLog.action,
            currentUserIsAdmin: isAdmin,
            isTaskCreator,
            isCurrentAssignee,
            currentUserId: currentUser.id,
            changedBy: auditLog.changed_by
          });

          // Rule 1: Admins get notified of EVERYTHING
          if (isAdmin) {
            shouldNotify = true;
            console.log('✅ Notifying: User is admin');
          }
          // Rule 2: Current assignee gets notified (not past assignees)
          else if (isCurrentAssignee) {
            shouldNotify = true;
            console.log('✅ Notifying: User is currently assigned to task');
          }
          // Rule 3: Task creator ONLY if they're still involved (assigned or no assignee)
          else if (isTaskCreator && (isCurrentAssignee || !taskData.assigned_to)) {
            shouldNotify = true;
            console.log('✅ Notifying: User created task and still involved');
          }

          if (!shouldNotify) {
            console.log('❌ Skipping notification - user not currently involved in this task');
            return;
          }
          
          console.log('🔔 Creating notification for user:', currentUser.id);

          // Get the person who made the change
          const { data: changedByProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', auditLog.changed_by)
            .single();

          const changedByName = changedByProfile?.full_name || 'Someone';

          let notification: TaskNotification;
          let toastMessage: string;
          let browserNotificationBody: string;

          if (auditLog.action === 'status_changed') {
            const oldStatus = (auditLog.old_values as any)?.status || 'unknown';
            const newStatus = (auditLog.new_values as any)?.status || 'unknown';

            notification = {
              id: auditLog.id,
              taskTitle: taskData.title,
              type: 'status_change',
              oldStatus: formatStatus(oldStatus),
              newStatus: formatStatus(newStatus),
              changedBy: auditLog.changed_by,
              changedByName,
              timestamp: new Date().toISOString(),
            };

            toastMessage = `${changedByName} moved "${taskData.title}" from ${notification.oldStatus} to ${notification.newStatus}`;
            browserNotificationBody = `Pipeline: ${notification.oldStatus} → ${notification.newStatus}`;
          } else if (auditLog.action === 'assigned') {
            // assignment_change
            const oldAssigneeId = (auditLog.old_values as any)?.assigned_to;
            const newAssigneeId = (auditLog.new_values as any)?.assigned_to;

            let oldAssigneeName = 'Unassigned';
            let newAssigneeName = 'Unassigned';

            if (oldAssigneeId) {
              const { data: oldProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', oldAssigneeId)
                .single();
              oldAssigneeName = oldProfile?.full_name || 'Someone';
            }

            if (newAssigneeId) {
              const { data: newProfile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', newAssigneeId)
                .single();
              newAssigneeName = newProfile?.full_name || 'Someone';
            }

            notification = {
              id: auditLog.id,
              taskTitle: taskData.title,
              type: 'assignment_change',
              oldAssignee: oldAssigneeName,
              newAssignee: newAssigneeName,
              changedBy: auditLog.changed_by,
              changedByName,
              timestamp: new Date().toISOString(),
            };

            toastMessage = `${changedByName} reassigned "${taskData.title}" from ${oldAssigneeName} to ${newAssigneeName}`;
            browserNotificationBody = `Assigned: ${oldAssigneeName} → ${newAssigneeName}`;
          } else if (auditLog.action === 'created') {
            // task_created - Get more details about where and for whom
            const taskStatus = (auditLog.new_values as any)?.status || 'todo';
            const taskClientName = (auditLog.new_values as any)?.client_name;
            const assignedToId = (auditLog.new_values as any)?.assigned_to;
            
            // Get assigned user's name and role if assigned
            let assignedUserName = 'Unassigned';
            let assignedUserRole = '';
            
            if (assignedToId) {
              const { data: assignedProfile } = await supabase
                .from('profiles')
                .select('full_name, user_roles(role)')
                .eq('id', assignedToId)
                .single();
              
              assignedUserName = assignedProfile?.full_name || 'Someone';
              assignedUserRole = (assignedProfile?.user_roles as any)?.[0]?.role || '';
            }
            
            notification = {
              id: auditLog.id,
              taskTitle: taskData.title,
              type: 'task_created',
              changedBy: auditLog.changed_by,
              changedByName,
              timestamp: new Date().toISOString(),
              newStatus: formatStatus(taskStatus),
            };

            // Build detailed message
            let detailParts = [];
            if (assignedUserName !== 'Unassigned') {
              detailParts.push(`for ${assignedUserName}${assignedUserRole ? ` (${assignedUserRole})` : ''}`);
            }
            detailParts.push(`in ${formatStatus(taskStatus)} pipeline`);
            if (taskClientName) {
              detailParts.push(`[Client: ${taskClientName}]`);
            }
            
            toastMessage = `${changedByName} created "${taskData.title}" ${detailParts.join(' ')}`;
            browserNotificationBody = taskData.assigned_to === currentUser.id 
              ? `Assigned to you in ${formatStatus(taskStatus)} pipeline` 
              : `Created in ${formatStatus(taskStatus)} pipeline`;
          } else if (auditLog.action === 'updated') {
            // task_updated
            notification = {
              id: auditLog.id,
              taskTitle: taskData.title,
              type: 'task_updated',
              changedBy: auditLog.changed_by,
              changedByName,
              timestamp: new Date().toISOString(),
            };

            toastMessage = `${changedByName} updated "${taskData.title}"`;
            browserNotificationBody = 'Task details updated';
          } else {
            return; // Unknown action type
          }

          // Add to notifications list (avoid duplicates) - ALWAYS add to history
          setNotifications(prev => {
            if (prev.some(n => n.id === notification.id)) return prev;
            return [notification, ...prev];
          });

          // Only show toast and play sound if NOT muted
          if (!isMuted) {
            // Play alarm sound - louder and repeat for urgent/high priority tasks
            if (audioRef.current) {
              audioRef.current.volume = 1.0; // Full volume
              
              // For task creation with urgent/high priority, play sound twice
              const priority = (auditLog.new_values as any)?.priority;
              if (auditLog.action === 'created' && ['urgent', 'high'].includes(priority)) {
                audioRef.current.play().catch(e => console.log('Audio play failed:', e));
                setTimeout(() => audioRef.current?.play().catch(e => console.log('Audio play failed:', e)), 1000);
              } else {
                audioRef.current.play().catch(e => console.log('Audio play failed:', e));
              }
            }

            // Show toast
          const toastIcon = notification.type === 'status_change' 
            ? <ArrowRightLeft className="h-5 w-5 text-accent" />
            : notification.type === 'assignment_change'
            ? <UserPlus className="h-5 w-5 text-accent" />
            : <Bell className="h-5 w-5 text-accent" />;

          toast.info(toastMessage, {
            duration: 10000, // Longer duration (10 seconds)
            icon: toastIcon,
            action: {
              label: 'View',
              onClick: () => {
                window.focus();
                // Navigate to task or open task details if needed
              }
            }
          });

            // Show browser notification (WhatsApp Web style) - only if not muted
            if ('Notification' in window && Notification.permission === 'granted') {
            const notificationOptions = {
              body: `${changedByName} - ${browserNotificationBody}`,
              icon: '/rea-logo-icon.png',
              badge: '/rea-logo-icon.png',
              tag: notification.id,
              requireInteraction: true, // Keep visible until clicked (WhatsApp style)
              vibrate: [300, 100, 300, 100, 300], // Stronger vibration pattern
              silent: false,
              renotify: true,
              actions: [ // Add action buttons (if supported by browser)
                { action: 'view', title: 'View Task' },
                { action: 'dismiss', title: 'Dismiss' }
              ]
            };
            
            try {
              // For service worker notifications (better mobile support)
              if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification(`🔔 Task Update: ${taskData.title}`, notificationOptions);
                });
              } else {
                // Fallback to regular notification
                new Notification(`🔔 Task Update: ${taskData.title}`, notificationOptions);
              }
            } catch (error) {
              console.error('❌ Error showing notification:', error);
              // Fallback to basic notification if supported
              try {
                new Notification(`🔔 Task Update: ${taskData.title}`, {
                  body: `${changedByName} - ${browserNotificationBody}`,
                  icon: '/rea-logo-icon.png'
                });
              } catch (fallbackError) {
                console.error('❌ Browser notifications not supported:', fallbackError);
              }
            }
            } else if ('Notification' in window && Notification.permission === 'default') {
              // Request permission if not yet asked
              Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                  toast.info('✅ Notifications enabled! You will now receive alerts.', { duration: 3000 });
                }
              }).catch(err => console.error('Notification permission error:', err));
            }
          } else {
            console.log('🔇 Notifications muted - added to history only');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, isAdmin, isMuted]);

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    localStorage.setItem('notifications_muted', String(newMutedState));
    toast.success(newMutedState ? '🔇 Notifications muted' : '🔔 Notifications unmuted', {
      duration: 2000
    });
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

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
          <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'animate-pulse' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-white text-xs flex items-center justify-center font-semibold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            <h3 className="font-semibold">Task Updates</h3>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                title={isMuted ? "Unmute notifications" : "Mute notifications"}
              >
                {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllNotifications}>
                Clear All
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No recent task updates</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="bg-muted/50 border rounded-lg p-3 hover:bg-muted transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {notification.type === 'status_change' ? (
                        <ArrowRightLeft className="h-4 w-4 text-accent" />
                      ) : notification.type === 'assignment_change' ? (
                        <UserPlus className="h-4 w-4 text-accent" />
                      ) : (
                        <Bell className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground mb-1">
                        {notification.type === 'status_change' 
                          ? 'Pipeline Change' 
                          : notification.type === 'assignment_change'
                          ? 'Assignment Change'
                          : notification.type === 'task_created'
                          ? 'New Task Created'
                          : 'Task Updated'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{notification.changedByName}</span>
                        {notification.type === 'status_change' 
                          ? ' moved ' 
                          : notification.type === 'assignment_change'
                          ? ' reassigned '
                          : notification.type === 'task_created'
                          ? ' created '
                          : ' updated '}
                        <span className="font-medium text-foreground">"{notification.taskTitle}"</span>
                      </p>
                      {notification.type === 'status_change' ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="text-destructive font-medium">{notification.oldStatus}</span>
                          {' → '}
                          <span className="text-success font-medium">{notification.newStatus}</span>
                        </p>
                      ) : notification.type === 'assignment_change' ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          <span className="text-destructive font-medium">{notification.oldAssignee}</span>
                          {' → '}
                          <span className="text-success font-medium">{notification.newAssignee}</span>
                        </p>
                      ) : notification.type === 'task_created' ? (
                        <div className="text-xs mt-1 space-y-0.5">
                          {notification.newStatus && (
                            <p className="text-muted-foreground">
                              Pipeline: <span className="text-accent font-medium">{notification.newStatus}</span>
                            </p>
                          )}
                          {notification.assignedUserName && notification.assignedUserName !== 'Unassigned' && (
                            <p className="text-muted-foreground">
                              Assigned to: <span className="text-foreground font-medium">{notification.assignedUserName}</span>
                              {notification.assignedUserRole && (
                                <span className="text-muted-foreground"> ({notification.assignedUserRole})</span>
                              )}
                            </p>
                          )}
                          {notification.clientName && (
                            <p className="text-muted-foreground">
                              Client: <span className="text-primary font-medium">{notification.clientName}</span>
                            </p>
                          )}
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {new Date(notification.timestamp).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })} • {new Date(notification.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0"
                      onClick={() => dismissNotification(notification.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};
