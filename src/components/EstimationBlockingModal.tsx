import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, AlertTriangle } from 'lucide-react';

interface StuckTask {
  id: string;
  title: string;
  status: string;
  hours_idle: number;
  time_limit: number;
}

export const EstimationBlockingModal = () => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [stuckTasks, setStuckTasks] = useState<StuckTask[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkBlockingStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkBlockingStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkBlockingStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (userRole?.role === 'admin' || userRole?.role === 'technical_head') {
        setIsAdmin(true);
        setIsBlocked(false);
        return;
      }

      // Only check for estimation users
      if (userRole?.role !== 'estimation') {
        setIsBlocked(false);
        return;
      }

      // Fetch stage limits separately to avoid broken inner join
      const { data: stageLimits } = await supabase
        .from('estimation_stage_limits')
        .select('stage_status, time_limit_hours');

      const limitsMap = new Map<string, number>();
      if (stageLimits) {
        stageLimits.forEach(limit => {
          limitsMap.set(limit.stage_status, limit.time_limit_hours);
        });
      }

      // Check for stuck quotation tasks
      const { data: tasks, error } = await supabase
        .from('tasks')
        .select('id, title, status, last_activity_at')
        .eq('assigned_to', user.id)
        .eq('type', 'quotation')
        .in('status', ['todo', 'supplier_quotes', 'client_approval', 'admin_approval'])
        .is('deleted_at', null);

      if (error) {
        console.error('Error fetching tasks:', error);
        setIsBlocked(false);
        return;
      }

      if (tasks && tasks.length > 0) {
        const stuck = tasks
          .map(task => {
            const hoursIdle = (Date.now() - new Date(task.last_activity_at).getTime()) / (1000 * 60 * 60);
            const timeLimit = limitsMap.get(task.status) || 2; // Default 2 hours if not found
            return {
              id: task.id,
              title: task.title,
              status: task.status,
              hours_idle: hoursIdle,
              time_limit: timeLimit
            };
          })
          .filter(task => task.hours_idle >= task.time_limit);

        if (stuck.length > 0) {
          setStuckTasks(stuck);
          setIsBlocked(true);
        } else {
          setIsBlocked(false);
        }
      } else {
        setIsBlocked(false);
      }
    } catch (error) {
      console.error('Error checking blocking status:', error);
    }
  };

  const handleViewTask = (taskId: string) => {
    // Navigate to dashboard with task focused
    window.location.href = `/dashboard?focus=${taskId}`;
  };

  if (!isBlocked || isAdmin) return null;

  return (
    <Dialog open={isBlocked} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl"  onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl text-destructive">
            <AlertTriangle className="h-6 w-6" />
            ⛔ ACTION REQUIRED - WORKFLOW BLOCKED
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <p className="font-semibold text-lg mb-2">
              You have {stuckTasks.length} quotation task{stuckTasks.length > 1 ? 's' : ''} stuck beyond the time limit.
            </p>
            <p className="text-muted-foreground">
              You must complete these tasks before accessing other features.
            </p>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {stuckTasks.map((task) => (
              <div key={task.id} className="border border-destructive/50 rounded-lg p-4 bg-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg mb-1">{task.title}</h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Idle: {task.hours_idle.toFixed(1)}h / {task.time_limit}h limit
                      </span>
                      <span className="px-2 py-1 bg-destructive/20 text-destructive rounded">
                        {task.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <Button 
                    onClick={() => handleViewTask(task.id)}
                    variant="destructive"
                    size="lg"
                  >
                    Work on This
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">🚫 Currently Blocked:</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Creating new tasks</li>
              <li>• Viewing other tasks</li>
              <li>• Accessing chat and other features</li>
            </ul>
            <p className="text-sm font-medium mt-3">✅ You Can:</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Move tasks to the next stage</li>
              <li>• Add updates or comments</li>
              <li>• Request help from admin</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
