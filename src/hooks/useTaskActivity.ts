import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useTaskActivity = () => {
  const logActivity = useCallback(async (
    taskId: string,
    action: 'viewed' | 'edited' | 'status_changed' | 'commented' | 'assigned',
    details?: any
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if task exists and is not deleted before logging activity
      const { data: task } = await supabase
        .from('tasks')
        .select('id, deleted_at')
        .eq('id', taskId)
        .maybeSingle();

      if (!task || task.deleted_at) {
        console.log(`⏭️ Skipping activity log for deleted/non-existent task ${taskId}`);
        return;
      }

      await supabase
        .from('task_activity_log')
        .insert({
          task_id: taskId,
          user_id: user.id,
          action,
          details
        });

      console.log(`📝 Logged activity: ${action} on task ${taskId}`);
    } catch (error) {
      console.error('Error logging task activity:', error);
    }
  }, []);

  return { logActivity };
};

export const useTaskActivitySubscription = (taskId: string, onActivity: (activity: any) => void) => {
  useEffect(() => {
    const channel = supabase
      .channel(`task-activity-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log',
          filter: `task_id=eq.${taskId}`
        },
        (payload) => {
          console.log('📥 New activity:', payload);
          onActivity(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, onActivity]);
};