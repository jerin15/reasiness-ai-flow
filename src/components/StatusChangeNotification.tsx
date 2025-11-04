import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, X, UserPlus, ArrowRightLeft } from "lucide-react";
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const initUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUser(user);
      
      // Initialize alarm sound
      audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZUQ8PVqzn77BdGAg+ltryym4lBSh+y/HVkEILFl+16+6oVhQLR6Hh8r9vIgU0idLz1YU1Bx9xwvDil1QQD1es5/CxXxgJPpba8sp9JgYngszx15FDDRZZ');
      
      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const userIsAdmin = roleData?.role === 'admin' || (roleData?.role as string) === 'technical_head';
      setIsAdmin(userIsAdmin);

      // Request notification permission
      if (Notification.permission === 'default') {
        Notification.requestPermission();
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

        // Show notification if user is admin, task creator, or assigned
        const shouldNotify = userIsAdmin || 
                            taskData.created_by === userId || 
                            taskData.assigned_to === userId ||
                            (auditLog.old_values as any)?.assigned_to === userId;

        console.log('📌 Task:', taskData.title, 'Should notify:', shouldNotify, 'Is admin:', userIsAdmin);
        if (!shouldNotify) continue;

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

          // SIMPLIFIED NOTIFICATION LOGIC:
          // 1. ALL admins get notified of ALL task activities (except their own)
          // 2. Task creator gets notified of ALL changes to their task (except their own)
          // 3. Current assignee gets notified of ALL changes to their task (except their own)
          // 4. Previous assignee gets notified if they're removed from a task
          
          let shouldNotify = false;
          const isTaskCreator = taskData.created_by === currentUser.id;
          const isCurrentAssignee = taskData.assigned_to === currentUser.id;
          const wasPreviouslyAssigned = (auditLog.old_values as any)?.assigned_to === currentUser.id;

          console.log('🔍 Checking notification eligibility:', {
            task: taskData.title,
            action: auditLog.action,
            currentUserIsAdmin: isAdmin,
            isTaskCreator,
            isCurrentAssignee,
            wasPreviouslyAssigned,
            currentUserId: currentUser.id,
            changedBy: auditLog.changed_by
          });

          // Rule 1: Admins get notified of everything
          if (isAdmin) {
            shouldNotify = true;
            console.log('✅ Notifying: User is admin');
          }
          
          // Rule 2: Task creator gets notified of all changes to their task
          if (isTaskCreator) {
            shouldNotify = true;
            console.log('✅ Notifying: User is task creator');
          }
          
          // Rule 3: Current assignee gets notified
          if (isCurrentAssignee) {
            shouldNotify = true;
            console.log('✅ Notifying: User is current assignee');
          }
          
          // Rule 4: Previous assignee gets notified if they were removed
          if (wasPreviouslyAssigned && auditLog.action === 'assigned') {
            shouldNotify = true;
            console.log('✅ Notifying: User was previously assigned');
          }

          if (!shouldNotify) {
            console.log('❌ Skipping notification - user not involved in this task');
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

          // Play alarm sound
          if (audioRef.current) {
            audioRef.current.volume = 0.8;
            audioRef.current.play().catch(e => console.log('Audio play failed:', e));
          }

          // Add to notifications list (avoid duplicates)
          setNotifications(prev => {
            if (prev.some(n => n.id === notification.id)) return prev;
            return [notification, ...prev];
          });

          // Show toast
          const toastIcon = notification.type === 'status_change' 
            ? <ArrowRightLeft className="h-5 w-5 text-accent" />
            : notification.type === 'assignment_change'
            ? <UserPlus className="h-5 w-5 text-accent" />
            : <Bell className="h-5 w-5 text-accent" />;

          toast.info(toastMessage, {
            duration: 8000,
            icon: toastIcon,
          });

          // Show browser notification
          if (Notification.permission === 'granted') {
            new Notification(`🔔 Task Update: ${taskData.title}`, {
              body: `${changedByName} - ${browserNotificationBody}`,
              icon: '/rea-logo-icon.png',
              tag: notification.id,
              requireInteraction: false
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, isAdmin]);


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
        <Button variant="outline" size="sm" className="relative">
          <Bell className={`h-4 w-4 ${unreadCount > 0 ? 'animate-pulse text-accent' : ''}`} />
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
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAllNotifications}>
              Clear All
            </Button>
          )}
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
                        {new Date(notification.timestamp).toLocaleTimeString()}
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
