import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { getRecentTeamActivities, TaskActivity, getQuickActionDisplay } from '@/lib/taskActivityHelpers';
import { PlayCircle, PauseCircle, HelpCircle, CheckCircle, MessageSquare, RefreshCw } from 'lucide-react';

interface TeamActivityStreamProps {
  limit?: number;
  compact?: boolean;
}

export const TeamActivityStream = ({ limit = 20, compact = false }: TeamActivityStreamProps) => {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();

    // Real-time subscription for all activity
    const channel = supabase
      .channel('team-activities-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log'
        },
        async (payload) => {
          console.log('📥 New team activity:', payload);
          
          // Check if it has a quick_action
          if (payload.new && (payload.new as any).details?.quick_action) {
            fetchActivities();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  const fetchActivities = async () => {
    const data = await getRecentTeamActivities(limit);
    setActivities(data);
    setLoading(false);
  };

  const getActionIcon = (quickAction: string) => {
    switch (quickAction) {
      case 'working_on_it':
        return <PlayCircle className="h-4 w-4 text-green-500" />;
      case 'waiting_for_client':
        return <PauseCircle className="h-4 w-4 text-yellow-500" />;
      case 'help_requested':
        return <HelpCircle className="h-4 w-4 text-red-500 animate-pulse" />;
      case 'almost_done':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionText = (activity: TaskActivity) => {
    const quickAction = activity.details?.quick_action;
    if (!quickAction) return '';
    
    const display = getQuickActionDisplay(quickAction);
    return `marked as "${display.label}"`;
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
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Team Activity</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchActivities}
          className="h-7 px-2"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className={compact ? "h-[300px]" : "h-[500px]"}>
        <div className="space-y-2">
          {activities.map((activity) => {
            const quickAction = activity.details?.quick_action;
            const display = quickAction ? getQuickActionDisplay(quickAction) : null;

            return (
              <Card 
                key={activity.id} 
                className={`transition-all hover:shadow-md cursor-pointer ${
                  quickAction === 'help_requested' ? 'border-red-500 border-2' : ''
                }`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={activity.profiles?.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">
                        {activity.profiles?.full_name?.charAt(0) || 'U'}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {quickAction && getActionIcon(quickAction)}
                        <span className="font-medium text-sm truncate">
                          {activity.profiles?.full_name || 'Unknown User'}
                        </span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-1">
                        {getActionText(activity)}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium truncate">
                          {activity.tasks?.title || 'Unknown Task'}
                        </span>
                        {display && (
                          <Badge className={`${display.color} text-xs`}>
                            {display.icon} {display.label}
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
