import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Clock, AlertCircle } from 'lucide-react';

interface TaskNeedingCheckIn {
  id: string;
  title: string;
  status: string;
  hours_idle: number;
  last_check_in?: Date;
}

export const EstimationForcedCheckIn = () => {
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [currentTask, setCurrentTask] = useState<TaskNeedingCheckIn | null>(null);
  const [action, setAction] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    checkForCheckIns();
    
    // Check every 2 hours
    const interval = setInterval(checkForCheckIns, 2 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkForCheckIns = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is estimation
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (userRole?.role !== 'estimation') return;

      // Get quotation tasks that need check-in (>2 hours since last activity or check-in)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      const { data: tasks } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          status,
          last_activity_at,
          estimation_check_ins(check_in_time)
        `)
        .eq('assigned_to', user.id)
        .eq('type', 'quotation')
        .in('status', ['todo', 'supplier_quotes', 'client_approval', 'admin_approval'])
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: true })
        .limit(1);

      if (tasks && tasks.length > 0) {
        const task = tasks[0];
        const lastActivity = new Date(task.last_activity_at);
        const lastCheckIn = (task as any).estimation_check_ins?.[0]?.check_in_time;
        const lastCheckInDate = lastCheckIn ? new Date(lastCheckIn) : null;

        // Determine if check-in is needed
        const needsCheckIn = lastActivity < twoHoursAgo && 
          (!lastCheckInDate || lastCheckInDate < twoHoursAgo);

        if (needsCheckIn) {
          const hoursIdle = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
          setCurrentTask({
            id: task.id,
            title: task.title,
            status: task.status,
            hours_idle: hoursIdle,
            last_check_in: lastCheckInDate || undefined
          });
          setShowCheckIn(true);
        }
      }
    } catch (error) {
      console.error('Error checking for forced check-ins:', error);
    }
  };

  const handleSubmit = async () => {
    if (!action || !currentTask) {
      toast.error('Please select an action');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Record check-in
      const { error: checkInError } = await supabase
        .from('estimation_check_ins' as any)
        .insert({
          task_id: currentTask.id,
          user_id: user.id,
          action_taken: action,
          notes: notes
        });

      if (checkInError) throw checkInError;

      // Update task's last_activity_at
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', currentTask.id);

      if (updateError) throw updateError;

      // If action is to move forward, handle status change
      if (action === 'moved_forward') {
        const nextStatus = getNextStatus(currentTask.status);
        if (nextStatus) {
          await supabase
            .from('tasks')
            .update({ 
              status: nextStatus,
              status_changed_at: new Date().toISOString()
            })
            .eq('id', currentTask.id);
        }
      }

      toast.success('Check-in recorded successfully');
      setShowCheckIn(false);
      setAction('');
      setNotes('');
      setCurrentTask(null);
    } catch (error: any) {
      console.error('Error submitting check-in:', error);
      toast.error(error.message || 'Failed to record check-in');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getNextStatus = (currentStatus: string) => {
    const statusFlow: Record<string, 'supplier_quotes' | 'client_approval' | 'admin_approval' | 'quotation_bill'> = {
      'todo': 'supplier_quotes',
      'supplier_quotes': 'client_approval',
      'client_approval': 'admin_approval',
      'admin_approval': 'quotation_bill'
    };
    return statusFlow[currentStatus] || null;
  };

  if (!showCheckIn || !currentTask) return null;

  return (
    <Dialog open={showCheckIn} onOpenChange={() => {}}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            🚨 TASK CHECK-IN REQUIRED
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pb-4">
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <h3 className="font-semibold mb-1">{currentTask.title}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Idle for: {currentTask.hours_idle.toFixed(1)} hours</span>
              <span className="px-2 py-0.5 bg-muted rounded text-xs">
                {currentTask.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">What's the status?</Label>
            <RadioGroup value={action} onValueChange={setAction}>
              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="moved_forward" id="moved" />
                <Label htmlFor="moved" className="cursor-pointer flex-1">
                  <div className="font-medium">✅ Moved to next stage</div>
                  <div className="text-sm text-muted-foreground">Task is progressing</div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="waiting_client" id="waiting" />
                <Label htmlFor="waiting" className="cursor-pointer flex-1">
                  <div className="font-medium">⏳ Waiting for client response</div>
                  <div className="text-sm text-muted-foreground">External dependency</div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="waiting_supplier" id="supplier" />
                <Label htmlFor="supplier" className="cursor-pointer flex-1">
                  <div className="font-medium">📞 Waiting for supplier quote</div>
                  <div className="text-sm text-muted-foreground">Supplier hasn't replied yet</div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="need_help" id="help" />
                <Label htmlFor="help" className="cursor-pointer flex-1">
                  <div className="font-medium">🆘 Stuck - need help</div>
                  <div className="text-sm text-muted-foreground">Will notify admin</div>
                </Label>
              </div>

              <div className="flex items-start space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                <RadioGroupItem value="working_on_it" id="working" />
                <Label htmlFor="working" className="cursor-pointer flex-1">
                  <div className="font-medium">⚙️ Actively working on it</div>
                  <div className="text-sm text-muted-foreground">Making progress</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any relevant details..."
              rows={3}
            />
          </div>

          <div className="bg-muted rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">⚠️ You must respond to continue</p>
            <p className="text-muted-foreground">
              This check-in is required to ensure tasks don't get stuck. Your response helps the team stay coordinated.
            </p>
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={!action || isSubmitting}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Check-In'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
