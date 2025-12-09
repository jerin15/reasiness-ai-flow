import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SupplierQuotesCheckInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onComplete: () => void;
}

export const SupplierQuotesCheckInDialog = ({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  onComplete,
}: SupplierQuotesCheckInDialogProps) => {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeEstimate, setTimeEstimate] = useState<string>('');

  const handleSubmit = async () => {
    if (!timeEstimate) {
      toast.error('Please select a time estimate');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Log the check-in
      await supabase.from('estimation_check_ins').insert({
        task_id: taskId,
        user_id: user.id,
        action_taken: `Moved to Supplier Quotes - Est: ${timeEstimate}`,
        notes: notes || null,
      });

      // Update task's last_activity_at
      await supabase
        .from('tasks')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', taskId);

      toast.success('Check-in recorded - Timer started');
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving check-in:', error);
      toast.error('Failed to save check-in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Supplier Quotes Timer
          </DialogTitle>
          <DialogDescription>
            You're moving "<strong>{taskTitle}</strong>" to Supplier Quotes. 
            Set your time estimate to start the tracking timer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              This task will be timed. Complete within the estimate to maintain efficiency score.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Estimated completion time *</Label>
            <div className="grid grid-cols-3 gap-2">
              {['30 min', '1 hour', '2 hours'].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={timeEstimate === time ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeEstimate(time)}
                >
                  {time}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {['4 hours', '1 day', '2 days'].map((time) => (
                <Button
                  key={time}
                  type="button"
                  variant={timeEstimate === time ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeEstimate(time)}
                >
                  {time}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes about this task..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !timeEstimate}>
            {isSubmitting ? 'Starting...' : 'Start Timer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};