import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ListTodo, Plus, MapPin, Loader2, ClipboardList } from "lucide-react";
import { AddTaskDialog } from "./AddTaskDialog";
import { AdminKanbanBoard } from "./AdminKanbanBoard";
import { PersonalAdminTasks } from "./PersonalAdminTasks";
import { EstimationPipelineAnalytics } from "./EstimationPipelineAnalytics";
import { AdminLiveMap } from "./operations/AdminLiveMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useConnectionAwareRefetch } from "@/hooks/useConnectionAwareRefetch";
import { useDebouncedCallback } from "@/hooks/useVisibilityAwareSubscription";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  const navigate = useNavigate();
  const [myCreatedTasks, setMyCreatedTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats>({
    tasksCreatedByMe: 0,
    pendingApproval: 0,
    productionTasks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [mapLoading, setMapLoading] = useState(false);
  const [operationsUsers, setOperationsUsers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  
  // Channel ref for managing subscription lifecycle
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Define fetchTasksAndStats with useCallback so it can be used in hooks
  const fetchTasksAndStats = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

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

      // Get only estimation role users (not admin)
      const { data: estimationUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'estimation');

      const estimationUserIds = estimationUsers?.map(u => u.user_id) || [];

      // Count production tasks visible to estimation users
      // Match the exact logic estimation users see in their panel
      let productionCount = 0;
      if (estimationUserIds.length > 0) {
        const { count } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'production')
          .or(`created_by.in.(${estimationUserIds.join(',')}),assigned_to.in.(${estimationUserIds.join(',')})`)
          .is('deleted_at', null);
        
        productionCount = count || 0;
      }

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
  }, []);

  // Debounced fetch to prevent rapid successive calls
  const debouncedFetchTasksAndStats = useDebouncedCallback(fetchTasksAndStats, 300);
  
  // Connection-aware refetch: auto-refetch on internet restore, tab focus, and fallback polling
  useConnectionAwareRefetch(fetchTasksAndStats, { pollingInterval: 30000, enablePolling: true });

  // Fetch operations users for the map
  const fetchOperationsUsers = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name, email)')
        .eq('role', 'operations');
      
      if (data) {
        const users = data
          .map(d => d.profiles)
          .filter(Boolean) as Array<{ id: string; full_name: string | null; email: string }>;
        setOperationsUsers(users);
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
    }
  }, []);

  // Fetch Mapbox token for admins
  const fetchMapboxToken = useCallback(async () => {
    try {
      setMapLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        const response = await supabase.functions.invoke('get-mapbox-token', {
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });
        
        if (response.data?.token) {
          setMapboxToken(response.data.token);
        }
      }
    } catch (error) {
      console.error('Error fetching mapbox token:', error);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('🚀 AdminDashboard: useEffect triggered');
    
    // Set a safety timeout
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ AdminDashboard: fetchTasksAndStats taking too long, forcing loading off');
      setLoading(false);
    }, 15000);
    
    fetchTasksAndStats().finally(() => {
      clearTimeout(safetyTimeout);
    });
    
    // Subscribe function for visibility-aware subscription
    const subscribe = () => {
      if (channelRef.current) return;
      
      const channel = supabase
        .channel('admin-dashboard-realtime-' + Date.now())
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks'
          },
          (payload) => {
            console.log('Admin dashboard received task change:', payload);
            // Debounced refetch on any task change
            debouncedFetchTasksAndStats();
          }
        )
        .subscribe((status) => {
          console.log('Admin dashboard subscription status:', status);
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('⚠️ Admin dashboard subscription error, will retry on visibility');
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
    
    // Visibility-aware subscription management
    const handleVisibilityChange = () => {
      if (document.hidden) {
        unsubscribe();
      } else {
        subscribe();
        debouncedFetchTasksAndStats();
      }
    };
    
    // Initial subscription if tab is visible
    if (!document.hidden) {
      subscribe();
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(safetyTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [fetchTasksAndStats, debouncedFetchTasksAndStats]);


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
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage tasks and approvals</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Pipeline Analytics</TabsTrigger>
          <TabsTrigger value="livemap" onClick={() => { fetchMapboxToken(); fetchOperationsUsers(); }}>
            <MapPin className="h-4 w-4 mr-1" />
            Live Map
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setShowAddTask(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Task
        </Button>

        <Button variant="outline" onClick={() => navigate('/operations-whiteboard')}>
          <ClipboardList className="h-4 w-4 mr-2" />
          Operations Whiteboard
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
            <CardTitle className="text-sm font-medium">Production (Estimation)</CardTitle>
            <ListTodo className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.productionTasks}</div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Approval Pipeline - PRIORITY #1 */}
      <Card className="border-2 border-yellow-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-yellow-500" />
            Admin Cost Approval Pipeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tasks requiring admin approval for cost estimation
          </p>
        </CardHeader>
        <CardContent>
          <AdminKanbanBoard />
        </CardContent>
      </Card>

      {/* Production Tasks - PRIORITY #2 */}
      <Card className="border-2 border-blue-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-blue-500" />
            Production Pipeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Personal admin tasks and production monitoring
          </p>
        </CardHeader>
        <CardContent>
          <PersonalAdminTasks />
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

        </TabsContent>

        <TabsContent value="analytics">
          <EstimationPipelineAnalytics />
        </TabsContent>

        <TabsContent value="livemap">
          {mapLoading ? (
            <div className="h-[600px] flex flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground mt-2">Loading map...</p>
            </div>
          ) : mapboxToken ? (
            <AdminLiveMap
              mapboxToken={mapboxToken}
              operationsUsers={operationsUsers}
            />
          ) : (
            <Card>
              <CardContent className="h-[600px] flex flex-col items-center justify-center text-center p-6">
                <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Map Not Available</h3>
                <p className="text-muted-foreground text-sm max-w-md">
                  Mapbox token is not configured. Please add MAPBOX_PUBLIC_TOKEN to your backend secrets.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
