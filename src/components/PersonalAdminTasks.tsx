import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check, ChevronDown, ChevronUp, ArrowLeft, Calendar, Clock, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useConnectionAwareRefetch } from "@/hooks/useConnectionAwareRefetch";
import { useDebouncedCallback } from "@/hooks/useVisibilityAwareSubscription";
import { cn } from "@/lib/utils";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface PersonalTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done';
  created_at: string;
  due_date?: string;
  priority?: string;
  client_name?: string;
}

export const PersonalAdminTasks = () => {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchPersonalTasks = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('created_by', user.id)
        .eq('assigned_to', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data as PersonalTask[]);
    } catch (error) {
      console.error('Error fetching personal tasks:', error);
      toast.error('Failed to fetch personal tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchPersonalTasks = useDebouncedCallback(fetchPersonalTasks, 300);
  useConnectionAwareRefetch(fetchPersonalTasks, { pollingInterval: 30000, enablePolling: true });

  useEffect(() => {
    fetchPersonalTasks();

    const subscribe = () => {
      if (channelRef.current) return;
      const channel = supabase
        .channel('personal-admin-tasks-' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
          debouncedFetchPersonalTasks();
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
          }
        });
      channelRef.current = channel;
    };

    const unsubscribe = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) { unsubscribe(); } else { subscribe(); debouncedFetchPersonalTasks(); }
    };

    if (!document.hidden) subscribe();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => { document.removeEventListener('visibilitychange', handleVisibilityChange); unsubscribe(); };
  }, [fetchPersonalTasks, debouncedFetchPersonalTasks]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) { toast.error('Please enter a task title'); return; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('tasks').insert({
        title: newTaskTitle, description: newTaskDescription || null, status: 'todo',
        created_by: user.id, assigned_to: user.id, is_personal_admin_task: true, priority: 'medium', type: 'general'
      });
      if (error) throw error;
      toast.success('Personal task created');
      setNewTaskTitle(""); setNewTaskDescription(""); setShowAddForm(false);
      fetchPersonalTasks();
    } catch (error) { console.error('Error creating task:', error); toast.error('Failed to create task'); }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'todo' ? 'done' : 'todo';
      const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
      if (error) throw error;
      toast.success(newStatus === 'done' ? 'Task marked as done' : 'Task reopened');
      if (selectedTask?.id === taskId) setSelectedTask({ ...selectedTask, status: newStatus as 'todo' | 'done' });
      fetchPersonalTasks();
    } catch (error) { console.error('Error updating task:', error); toast.error('Failed to update task'); }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', taskId);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('task_audit_log').insert({
          task_id: taskId, action: 'soft_deleted', changed_by: user.id,
          old_values: null, new_values: { deleted_at: new Date().toISOString() }, role: 'user'
        });
      }
      toast.success('Task deleted');
      if (selectedTask?.id === taskId) setSelectedTask(null);
      fetchPersonalTasks();
    } catch (error) { console.error('Error deleting task:', error); toast.error('Failed to delete task'); }
  };

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const doneTasks = tasks.filter(t => t.status === 'done');

  // Detail view
  if (selectedTask) {
    const isDone = selectedTask.status === 'done';
    return (
      <div className="flex flex-col h-full">
        <button onClick={() => setSelectedTask(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 px-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to list
        </button>
        <div className="space-y-4">
          <div>
            <h3 className={cn("text-sm font-semibold leading-snug", isDone && "line-through text-muted-foreground")}>{selectedTask.title}</h3>
            <Badge variant={isDone ? "secondary" : "default"} className="mt-1.5 text-[10px]">{isDone ? "Done" : "To Do"}</Badge>
          </div>
          {selectedTask.description && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Description</p>
              <p className="text-xs text-foreground leading-relaxed">{selectedTask.description}</p>
            </div>
          )}
          {selectedTask.client_name && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Client</p>
              <p className="text-xs text-foreground">{selectedTask.client_name}</p>
            </div>
          )}
          <div className="flex gap-4">
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Created</p>
              <p className="text-xs text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {format(new Date(selectedTask.created_at), 'MMM d, yyyy')}
              </p>
            </div>
            {selectedTask.due_date && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Due</p>
                <p className="text-xs text-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {format(new Date(selectedTask.due_date), 'MMM d, yyyy')}
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button size="sm" variant={isDone ? "outline" : "default"} className="flex-1 h-8 text-xs" onClick={() => handleToggleStatus(selectedTask.id, selectedTask.status)}>
              <Check className="h-3.5 w-3.5 mr-1" /> {isDone ? "Reopen" : "Mark Done"}
            </Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => handleDeleteTask(selectedTask.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Add Task */}
      {showAddForm ? (
        <div className="mb-3 p-3 rounded-lg border border-primary/20 bg-muted/30 space-y-2">
          <Input placeholder="Task title *" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()} className="h-8 text-xs" autoFocus />
          <Textarea placeholder="Description (optional)" value={newTaskDescription} onChange={(e) => setNewTaskDescription(e.target.value)}
            rows={2} className="resize-none text-xs min-h-[48px]" />
          <div className="flex gap-2">
            <Button onClick={handleAddTask} size="sm" className="h-7 text-xs">Add</Button>
            <Button onClick={() => { setShowAddForm(false); setNewTaskTitle(""); setNewTaskDescription(""); }} variant="ghost" size="sm" className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm" className="mb-3 h-7 text-xs w-full gap-1.5 border-dashed">
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      )}

      {/* To Do section */}
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To Do</span>
          <Badge variant="secondary" className="h-4 min-w-[18px] text-[9px] px-1.5">{todoTasks.length}</Badge>
        </div>
        {todoTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No tasks to do</p>
        ) : (
          <div className="space-y-0.5">
            {todoTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors group"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleStatus(task.id, task.status); }}
                  className="flex-shrink-0 h-4 w-4 rounded-full border-2 border-muted-foreground/30 hover:border-primary transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{task.title}</p>
                  <p className="text-[10px] text-muted-foreground">{format(new Date(task.created_at), 'MMM d, yyyy')}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Done section - collapsible */}
      <div className="mt-auto pt-2 border-t border-border/50">
        <button
          onClick={() => setShowDone(!showDone)}
          className="flex items-center gap-2 w-full px-1 py-1.5 text-left"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Done</span>
          <Badge variant="secondary" className="h-4 min-w-[18px] text-[9px] px-1.5">{doneTasks.length}</Badge>
          <span className="ml-auto">
            {showDone ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
          </span>
        </button>
        {showDone && (
          <div className="space-y-0.5 mt-1">
            {doneTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No completed tasks</p>
            ) : (
              doneTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-accent/50 cursor-pointer transition-colors group opacity-60"
                >
                  <div className="flex-shrink-0 h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-2.5 w-2.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate line-through">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(task.created_at), 'MMM d, yyyy')}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
