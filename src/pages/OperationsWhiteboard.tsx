import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ClipboardList, Loader2, User } from "lucide-react";
import { format } from "date-fns";

interface WhiteboardTask {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  assignee?: { full_name: string | null; email: string } | null;
  creator?: { full_name: string | null; email: string } | null;
  completer?: { full_name: string | null; email: string } | null;
}

interface OperationsUser {
  id: string;
  full_name: string | null;
  email: string;
}

const OperationsWhiteboard = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<WhiteboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('whiteboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operations_whiteboard'
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      
      setCurrentUserId(user.id);
      
      // Check user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      const role = roleData?.role || '';
      setUserRole(role);
      
      // Only admins and operations can access
      if (role !== 'admin' && role !== 'operations') {
        toast.error("Access denied - only admins and operations team can access this page");
        navigate('/');
        return;
      }

      await Promise.all([fetchTasks(), fetchOperationsUsers()]);
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async () => {
    try {
      // Fetch tasks first
      const { data: tasksData, error } = await supabase
        .from('operations_whiteboard' as any)
        .select('*')
        .order('is_completed', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch profile data for each task
      const tasksList = (tasksData || []) as any[];
      const enrichedTasks = await Promise.all(
        tasksList.map(async (task) => {
          let assignee = null;
          let creator = null;
          let completer = null;

          if (task.assigned_to) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.assigned_to)
              .single();
            assignee = data;
          }

          if (task.created_by) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.created_by)
              .single();
            creator = data;
          }

          if (task.completed_by) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.completed_by)
              .single();
            completer = data;
          }

          return { ...task, assignee, creator, completer };
        })
      );

      setTasks(enrichedTasks as WhiteboardTask[]);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchOperationsUsers = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name, email)')
        .eq('role', 'operations');
      
      if (data) {
        const users = data
          .map(d => d.profiles)
          .filter(Boolean) as OperationsUser[];
        setOperationsUsers(users);
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .insert({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          assigned_to: selectedAssignee || null,
          created_by: currentUserId
        });

      if (error) throw error;
      
      toast.success("Task added to whiteboard");
      setNewTitle("");
      setNewDescription("");
      setSelectedAssignee("");
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error("Failed to add task");
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .update({
          is_completed: !currentStatus,
          completed_at: !currentStatus ? new Date().toISOString() : null,
          completed_by: !currentStatus ? currentUserId : null
        })
        .eq('id', taskId);

      if (error) throw error;
      toast.success(currentStatus ? "Task unmarked" : "Task completed!");
      fetchTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error("Failed to update task");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success("Task deleted");
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error("Failed to delete task");
    }
  };

  const isAdmin = userRole === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-primary" />
                Operations Whiteboard
              </h1>
              <p className="text-sm text-muted-foreground">
                {pendingTasks.length} pending • {completedTasks.length} completed
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-6">
        {/* Add Task Card - Only for Admins */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Task
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Task title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addTask()}
              />
              <Textarea
                placeholder="Description (optional)..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap gap-3 items-center">
                <select
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                >
                  <option value="">Assign to (optional)</option>
                  {operationsUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </select>
                <Button onClick={addTask} disabled={adding || !newTitle.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Task
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pending Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingTasks.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No pending tasks</p>
            ) : (
              <div className="space-y-3">
                {pendingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg border"
                  >
                    <Checkbox
                      checked={task.is_completed}
                      onCheckedChange={() => toggleTask(task.id, task.is_completed)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {task.assignee && (
                          <Badge variant="outline" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            {task.assignee.full_name || task.assignee.email}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Created {format(new Date(task.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <Card className="opacity-75">
            <CardHeader>
              <CardTitle className="text-lg text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-4 bg-muted/20 rounded-lg border opacity-60"
                  >
                    <Checkbox
                      checked={task.is_completed}
                      onCheckedChange={() => toggleTask(task.id, task.is_completed)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-through">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-through">{task.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {task.completer && (
                          <span className="text-xs text-green-600">
                            Completed by {task.completer.full_name || task.completer.email}
                          </span>
                        )}
                        {task.completed_at && (
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(task.completed_at), 'MMM d, h:mm a')}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteTask(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default OperationsWhiteboard;
