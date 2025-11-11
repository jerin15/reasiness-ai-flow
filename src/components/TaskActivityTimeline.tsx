import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { PlayCircle, PauseCircle, HelpCircle, CheckCircle, MessageSquare, Edit, Eye, UserPlus } from 'lucide-react';
import { getTaskActivityTimeline, TaskActivity, getQuickActionDisplay } from '@/lib/taskActivityHelpers';

interface TaskActivityTimelineProps {
  taskId: string;
}

export const TaskActivityTimeline = ({ taskId }: TaskActivityTimelineProps) => {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();

    // Real-time subscription
    const channel = supabase
      .channel(`task-activity-timeline-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log',
          filter: `task_id=eq.${taskId}`
        },
        () => {
          fetchActivities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const fetchActivities = async () => {
    setLoading(true);
    const data = await getTaskActivityTimeline(taskId);
    setActivities(data);
    setLoading(false);
  };

  const getActionIcon = (action: string, details: any) => {
    const quickAction = details?.quick_action;
    if (quickAction) {
      switch (quickAction) {
        case 'working_on_it':
          return <PlayCircle className="h-4 w-4 text-green-500" />;
        case 'waiting_for_client':
          return <PauseCircle className="h-4 w-4 text-yellow-500" />;
        case 'help_requested':
          return <HelpCircle className="h-4 w-4 text-red-500" />;
        case 'almost_done':
          return <CheckCircle className="h-4 w-4 text-blue-500" />;
      }
    }
    switch (action) {
      case 'commented':
        return <MessageSquare className="h-4 w-4 text-gray-500" />;
      case 'edited':
        return <Edit className="h-4 w-4 text-orange-500" />;
      case 'viewed':
        return <Eye className="h-4 w-4 text-gray-400" />;
      case 'assigned':
        return <UserPlus className="h-4 w-4 text-purple-500" />;
      default:
        return <Edit className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionText = (activity: TaskActivity) => {
    const quickAction = activity.details?.quick_action;
    if (quickAction) {
      const display = getQuickActionDisplay(quickAction);
      return display.label;
    }
    
    switch (activity.action) {
      case 'commented':
        return `added note: "${activity.details?.note || ''}"`;
      case 'status_changed':
        return `changed status from ${activity.details?.from || ''} to ${activity.details?.to || ''}`;
      case 'edited':
        return 'updated task';
      case 'viewed':
        return 'viewed task';
      case 'assigned':
        return 'was assigned';
      default:
        return activity.action;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No activity yet
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div key={activity.id} className="flex gap-3 relative">
            {/* Timeline connector */}
            {index < activities.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-border" />
            )}
            
            {/* Avatar */}
            <Avatar className="h-10 w-10 border-2 border-background">
              <AvatarImage src={activity.profiles?.avatar_url || undefined} />
              <AvatarFallback>
                {activity.profiles?.full_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {getActionIcon(activity.action, activity.details)}
                <span className="font-medium text-sm">
                  {activity.profiles?.full_name || 'Unknown User'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {getActionText(activity)}
                </span>
              </div>
              
              {activity.details?.quick_action && (
                <Badge className={getQuickActionDisplay(activity.details.quick_action).color}>
                  {getQuickActionDisplay(activity.details.quick_action).icon}{' '}
                  {getQuickActionDisplay(activity.details.quick_action).label}
                </Badge>
              )}
              
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
