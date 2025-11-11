import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getLatestQuickAction, QuickActionData, getQuickActionDisplay } from '@/lib/taskActivityHelpers';
import { supabase } from '@/integrations/supabase/client';
import { PlayCircle, PauseCircle, HelpCircle, CheckCircle, MessageSquare } from 'lucide-react';

interface QuickActionBadgeProps {
  taskId: string;
}

export const QuickActionBadge = ({ taskId }: QuickActionBadgeProps) => {
  const [quickAction, setQuickAction] = useState<QuickActionData | null>(null);

  useEffect(() => {
    fetchQuickAction();

    // Real-time subscription for this task's activities
    const channel = supabase
      .channel(`quick-action-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          if ((payload.new as any).details?.quick_action) {
            fetchQuickAction();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const fetchQuickAction = async () => {
    const data = await getLatestQuickAction(taskId);
    setQuickAction(data);
  };

  if (!quickAction?.details?.quick_action) return null;

  const display = getQuickActionDisplay(quickAction.details.quick_action);

  const getIcon = () => {
    switch (quickAction.details.quick_action) {
      case 'working_on_it':
        return <PlayCircle className="h-3 w-3" />;
      case 'waiting_for_client':
        return <PauseCircle className="h-3 w-3" />;
      case 'help_requested':
        return <HelpCircle className="h-3 w-3" />;
      case 'almost_done':
        return <CheckCircle className="h-3 w-3" />;
      default:
        return <MessageSquare className="h-3 w-3" />;
    }
  };

  return (
    <Badge 
      className={`${display.color} text-white text-xs flex items-center gap-1`}
    >
      {getIcon()}
      {display.label}
    </Badge>
  );
};
