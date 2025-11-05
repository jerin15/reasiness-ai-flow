import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PersonalTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'done';
  created_at: string;
}

export const PersonalAdminTasks = () => {
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetchPersonalTasks();

    const channel = supabase
      .channel('personal-admin-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'is_personal_admin_task=eq.true'
        },
        () => {
          fetchPersonalTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPersonalTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('created_by', user.id)
        .eq('assigned_to', user.id)
        .eq('is_personal_admin_task', true)
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
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('tasks').insert({
        title: newTaskTitle,
        description: newTaskDescription || null,
        status: 'todo',
        created_by: user.id,
        assigned_to: user.id,
        is_personal_admin_task: true,
        priority: 'medium',
        type: 'general'
      });

      if (error) throw error;

      toast.success('Personal task created');
      setNewTaskTitle("");
      setNewTaskDescription("");
      setShowAddForm(false);
      fetchPersonalTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'todo' ? 'done' : 'todo';
      
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (error) throw error;

      toast.success(newStatus === 'done' ? 'Task marked as done' : 'Task reopened');
      fetchPersonalTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;

      toast.success('Task deleted');
      fetchPersonalTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const doneTasks = tasks.filter(t => t.status === 'done');

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>My Personal Tasks</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Private tasks only you can see</p>
          </div>
          <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Task
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4 space-y-3">
              <Input
                placeholder="Task title *"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
              />
              <Textarea
                placeholder="Description (optional)"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
              <div className="flex gap-2">
                <Button onClick={handleAddTask} size="sm">Add Task</Button>
                <Button onClick={() => {
                  setShowAddForm(false);
                  setNewTaskTitle("");
                  setNewTaskDescription("");
                }} variant="outline" size="sm">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* To Do Column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">To Do</h3>
              <Badge variant="secondary">{todoTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {todoTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                  No tasks to do
                </div>
              ) : (
                todoTasks.map((task) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <h4 className="font-medium">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(task.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(task.id, task.status)}
                            className="h-8 w-8 p-0"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteTask(task.id)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Done Column */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Done</h3>
              <Badge variant="secondary">{doneTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {doneTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                  No completed tasks
                </div>
              ) : (
                doneTasks.map((task) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow opacity-75">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <h4 className="font-medium line-through">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-through">{task.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(task.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTask(task.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
