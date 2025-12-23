import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export const DailyTaskReviewDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkDailyReview();
    const interval = setInterval(checkDailyReview, 15 * 60 * 1000); // Check every 15 minutes (reduced from 5)
    return () => clearInterval(interval);
  }, []);

  const checkDailyReview = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      // Check if user is in estimation team
      const { data: userRoleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      // Only show for estimation team
      if (!userRoleData || userRoleData.role !== 'estimation') {
        setIsOpen(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      
      // Check if review is completed today
      const { data: review } = await supabase
        .from('user_daily_reviews')
        .select('*')
        .eq('user_id', user.id)
        .eq('review_date', today)
        .eq('completed', true)
        .single();

      if (review) {
        setIsOpen(false);
        return;
      }

      // Get all estimation team members
      const { data: estimationMembers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'estimation');

      if (!estimationMembers || estimationMembers.length === 0) return;

      const estimationUserIds = estimationMembers.map(m => m.user_id);

      // Get all tasks from estimation team that are not done
      const { data: userTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .in('created_by', estimationUserIds)
        .is('deleted_at', null)
        .neq('status', 'done')
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true });

      if (error) throw error;

      if (userTasks && userTasks.length > 0) {
        setTasks(userTasks);
        
        // Show dialog at 9 AM and 6 PM
        const hour = new Date().getHours();
        if (hour === 9 || hour === 18) {
          setIsOpen(true);
        }
      }
    } catch (error) {
      console.error('Error checking daily review:', error);
    }
  };

  const markTaskReviewed = (taskId: string) => {
    setReviewedCount(prev => prev + 1);
    toast.success('Task marked as reviewed');
  };

  const completeReview = async () => {
    if (reviewedCount === 0) {
      toast.error('Please review at least one task before completing');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      
      await supabase
        .from('user_daily_reviews')
        .upsert({
          user_id: userId!,
          review_date: today,
          completed: true,
          tasks_reviewed: reviewedCount,
          completed_at: new Date().toISOString()
        }, { onConflict: 'user_id,review_date' });

      toast.success('Daily review completed! 🎉');
      setIsOpen(false);
      setReviewedCount(0);
    } catch (error) {
      console.error('Error completing review:', error);
      toast.error('Failed to complete review');
    }
  };

  const getTaskAgeHours = (lastActivity: string) => {
    return Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60));
  };

  const getAgeBadge = (hours: number) => {
    if (hours >= 72) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        {hours}h old
      </Badge>;
    } else if (hours >= 48) {
      return <Badge variant="secondary" className="bg-orange-500 text-white flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {hours}h old
      </Badge>;
    } else if (hours >= 24) {
      return <Badge variant="secondary" className="bg-yellow-500 text-white flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {hours}h old
      </Badge>;
    }
    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {
      toast.error('Please complete your daily review before closing');
    }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            {new Date().getHours() < 12 ? '☀️' : '🌙'} Daily Task Review
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-primary/10 p-4 rounded-lg">
            <p className="text-sm font-medium">
              You have {tasks.length} active tasks. Review each one and mark it as checked.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ✅ Reviewed: {reviewedCount} / {tasks.length}
            </p>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const ageHours = getTaskAgeHours(task.last_activity_at);
              return (
                <div
                  key={task.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">{task.title}</h4>
                        <Badge variant={task.priority === 'urgent' ? 'destructive' : 'secondary'}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline">{task.status}</Badge>
                        {getAgeBadge(ageHours)}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      {task.due_date && (
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markTaskReviewed(task.id)}
                      className="shrink-0"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Reviewed
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              onClick={completeReview}
              disabled={reviewedCount === 0}
              size="lg"
              className="w-full sm:w-auto"
            >
              Complete Review ({reviewedCount} tasks reviewed)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};