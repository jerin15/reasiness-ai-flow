import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListTodo, Plus } from "lucide-react";
import { AddTaskDialog } from "./AddTaskDialog";
import { AdminKanbanBoard } from "./AdminKanbanBoard";
import { PersonalAdminTasks } from "./PersonalAdminTasks";
import { format } from "date-fns";

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  client_name: string;
  supplier_name: string;
  due_date: string;
  created_at: string;
  assigned_to: string;
  created_by: string;
  assignee?: {
    full_name: string;
    email: string;
  };
  creator?: {
    full_name: string;
    email: string;
  };
}

interface Stats {
  tasksCreatedByMe: number;
  pendingApproval: number;
  productionTasks: number;
}

export const AdminDashboard = () => {
  const [myCreatedTasks, setMyCreatedTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({
    tasksCreatedByMe: 0,
    pendingApproval: 0,
    productionTasks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    fetchTasksAndStats();
    
    // Real-time subscription for all task changes
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          console.log('Admin dashboard received task change:', payload);
          // Immediate refetch on any task change
          fetchTasksAndStats();
        }
      )
      .subscribe((status) => {
        console.log('Admin dashboard subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchTasksAndStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch tasks created by this admin
      const { data: myTasks, error: myTasksError } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(full_name, email),
          creator:profiles!tasks_created_by_fkey(full_name, email)
        `)
        .eq('created_by', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (myTasksError) throw myTasksError;
      
      // Sort tasks: done tasks at the end, others at the top
      const sortedTasks = (myTasks || []).sort((a, b) => {
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;
        return 0; // Keep original order for tasks with same done/not-done status
      });
      
      setMyCreatedTasks(sortedTasks as any);

      // Calculate stats
      const { count: myTasksCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id)
        .is('deleted_at', null);

      const { count: pendingCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'admin_approval' as any)
        .is('deleted_at', null);

      // Get operations users to count only their production tasks
      const { data: operationsUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');

      const operationsUserIds = operationsUsers?.map(u => u.user_id) || [];

      const { count: productionCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'production')
        .in('created_by', operationsUserIds)
        .is('deleted_at', null);

      setStats({
        tasksCreatedByMe: myTasksCount || 0,
        pendingApproval: pendingCount || 0,
        productionTasks: productionCount || 0,
      });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  };


  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTypeLabel = (type: string) => {
    return type?.charAt(0).toUpperCase() + type?.slice(1) || 'General';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage tasks and approvals</p>
        </div>
        <Button onClick={() => setShowAddTask(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Task for Team Member
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Created by Me</CardTitle>
            <ListTodo className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.tasksCreatedByMe}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <ListTodo className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingApproval}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Production (Operations)</CardTitle>
            <ListTodo className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productionTasks}</div>
          </CardContent>
        </Card>
      </div>

      {/* Personal Admin Tasks */}
      <PersonalAdminTasks />

      {/* Admin Approval Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Admin Approval Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminKanbanBoard />
        </CardContent>
      </Card>

      {/* Tasks Created by Admin */}
      <Card>
        <CardHeader>
          <CardTitle>Tasks I Created for Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {myCreatedTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tasks created yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myCreatedTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {task.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getTypeLabel(task.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{task.status}</Badge>
                    </TableCell>
                    <TableCell>{task.client_name || '-'}</TableCell>
                    <TableCell>
                      {task.assignee?.full_name || 'Unassigned'}
                    </TableCell>
                    <TableCell>
                      {task.due_date ? format(new Date(task.due_date), 'MMM d, yyyy') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddTaskDialog
        open={showAddTask}
        onOpenChange={setShowAddTask}
        onTaskAdded={fetchTasksAndStats}
      />
    </div>
  );
};
