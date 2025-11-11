import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { PlayCircle, PauseCircle, HelpCircle, CheckCircle, MessageSquare, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTaskActivity } from '@/hooks/useTaskActivity';
import { getLatestQuickAction } from '@/lib/taskActivityHelpers';

interface TaskQuickActionsProps {
  taskId: string;
  currentStatus: string;
  onActionComplete: () => void;
}

export const TaskQuickActions = ({ taskId, currentStatus, onActionComplete }: TaskQuickActionsProps) => {
  const [noteText, setNoteText] = useState('');
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const { logActivity } = useTaskActivity();

  useEffect(() => {
    fetchLatestAction();

    // Real-time subscription
    const channel = supabase
      .channel(`quick-actions-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity_log',
          filter: `task_id=eq.${taskId}`
        },
        () => {
          fetchLatestAction();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  const fetchLatestAction = async () => {
    const data = await getLatestQuickAction(taskId);
    if (data?.details?.quick_action) {
      setActiveAction(data.details.quick_action);
    }
  };

  const handleQuickAction = async (action: string) => {
    try {
      switch (action) {
        case 'working':
          await supabase
            .from('tasks')
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', taskId);
          
          await logActivity(taskId, 'edited', { quick_action: 'working_on_it' });
          toast.success('✅ Marked as: Working on it');
          break;

        case 'waiting':
          await supabase
            .from('tasks')
            .update({ 
              status: 'with_client',
              last_activity_at: new Date().toISOString()
            })
            .eq('id', taskId);
          
          await logActivity(taskId, 'status_changed', { quick_action: 'waiting_for_client', from: currentStatus, to: 'with_client' });
          toast.success('⏸️ Moved to: Waiting for Client');
          break;

        case 'help':
          const { data: { user } } = await supabase.auth.getUser();
          const { data: task } = await supabase
            .from('tasks')
            .select('title, description')
            .eq('id', taskId)
            .single();

          // Get all admins
          const { data: admins } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'admin');

          if (admins && admins.length > 0) {
            const notifications = admins.map(admin => ({
              recipient_id: admin.user_id,
              sender_id: user?.id,
              title: '🆘 Help Requested',
              message: `Task: ${task?.title}\n\n${task?.description || 'No description'}\n\n⚠️ Team member needs assistance with this task.`,
              priority: 'high',
              is_broadcast: false,
              is_acknowledged: false
            }));

            await supabase
              .from('urgent_notifications')
              .insert(notifications);

            await logActivity(taskId, 'edited', { quick_action: 'help_requested' });
            toast.success('🆘 Help request sent to admins');
          }
          break;

        case 'almost':
          await supabase
            .from('tasks')
            .update({ 
              last_activity_at: new Date().toISOString()
            })
            .eq('id', taskId);
          
          // Set a reminder for end of day
          const eod = new Date();
          eod.setHours(18, 0, 0, 0);
          
          await supabase
            .from('task_reminders')
            .insert({
              task_id: taskId,
              user_id: user?.id,
              reminder_time: eod.toISOString()
            });

          await logActivity(taskId, 'edited', { quick_action: 'almost_done' });
          toast.success('✅ Marked as almost done, reminder set for 6 PM');
          break;
      }

      onActionComplete();
    } catch (error) {
      console.error('Error performing quick action:', error);
      toast.error('Failed to perform action');
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) {
      toast.error('Please enter a note');
      return;
    }

    try {
      await supabase
        .from('tasks')
        .update({ 
          admin_remarks: noteText,
          last_activity_at: new Date().toISOString()
        })
        .eq('id', taskId);

      await logActivity(taskId, 'commented', { note: noteText });
      
      toast.success('📝 Note added');
      setNoteText('');
      setIsNoteOpen(false);
      onActionComplete();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    }
  };

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <Button
        size="sm"
        variant={activeAction === 'working_on_it' ? 'default' : 'outline'}
        onClick={() => handleQuickAction('working')}
        className={`h-7 text-xs ${
          activeAction === 'working_on_it' 
            ? 'bg-green-500 hover:bg-green-600 text-white border-green-500' 
            : ''
        }`}
      >
        <PlayCircle className="h-3 w-3 mr-1" />
        Working On It
      </Button>

      <Button
        size="sm"
        variant={activeAction === 'waiting_for_client' ? 'default' : 'outline'}
        onClick={() => handleQuickAction('waiting')}
        className={`h-7 text-xs ${
          activeAction === 'waiting_for_client' 
            ? 'bg-yellow-500 hover:bg-yellow-600 text-white border-yellow-500' 
            : ''
        }`}
      >
        <PauseCircle className="h-3 w-3 mr-1" />
        Waiting
      </Button>

      <Button
        size="sm"
        variant={activeAction === 'help_requested' ? 'default' : 'outline'}
        onClick={() => handleQuickAction('help')}
        className={`h-7 text-xs ${
          activeAction === 'help_requested' 
            ? 'bg-red-500 hover:bg-red-600 text-white border-red-500 animate-pulse' 
            : ''
        }`}
      >
        <HelpCircle className="h-3 w-3 mr-1" />
        Need Help
      </Button>

      <Button
        size="sm"
        variant={activeAction === 'almost_done' ? 'default' : 'outline'}
        onClick={() => handleQuickAction('almost')}
        className={`h-7 text-xs ${
          activeAction === 'almost_done' 
            ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500' 
            : ''
        }`}
      >
        <CheckCircle className="h-3 w-3 mr-1" />
        Almost Done
      </Button>

      <Popover open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Add Note
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Quick Note</h4>
            <Textarea
              placeholder="Add a quick update or note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[80px]"
            />
            <Button onClick={handleAddNote} size="sm" className="w-full">
              <Zap className="h-3 w-3 mr-1" />
              Add Note
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};