import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAlwaysOnLocation } from '@/hooks/useAlwaysOnLocation';
import { 
  Map, 
  Bell, 
  ClipboardList,
  MapPin,
  User,
  Radio,
  Loader2,
  Search,
  CheckCircle,
  Clock,
  AlertTriangle,
  LayoutList,
  RefreshCw,
  CalendarDays,
  Navigation
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { OperationsLocationMap } from './OperationsLocationMap';
import { OperationsMobileTaskCard, type OperationsTaskWithSteps, type WorkflowStep, type WorkflowStepProduct } from './OperationsMobileTaskCard';
import { OperationsMobileTaskSheet } from './OperationsMobileTaskSheet';
import { OperationsRouteCalendar } from './OperationsRouteCalendar';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface OperationsMobileShellProps {
  userId: string;
  userName: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
  isAdmin?: boolean;
}

type ViewMode = 'tasks' | 'calendar' | 'map';

export const OperationsMobileShell = ({ 
  userId, 
  userName,
  operationsUsers,
  isAdmin = false
}: OperationsMobileShellProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('tasks');
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [isMapLoading, setIsMapLoading] = useState(true);
  
  // Task state
  const [tasks, setTasks] = useState<OperationsTaskWithSteps[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<OperationsTaskWithSteps | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  // Always-on location tracking - starts automatically for operations team
  const { isTracking } = useAlwaysOnLocation({
    userId,
    enabled: true,
    updateInterval: 10000, // Update every 10 seconds
  });

  // Fetch tasks with workflow steps
  const fetchTasks = useCallback(async () => {
    try {
      // Fetch production tasks
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select(`
          id, title, description, client_name, suppliers, 
          delivery_address, delivery_instructions, due_date,
          status, priority, created_at, updated_at, assigned_to, last_updated_by,
          profiles:assigned_to (id, full_name, email),
          last_updated_profile:last_updated_by (id, full_name, email)
        `)
        .eq('status', 'production')
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false });

      if (taskError) throw taskError;

      // Fetch all workflow steps for these tasks
      if (taskData && taskData.length > 0) {
        const taskIds = taskData.map(t => t.id);
        
        // Fetch workflow steps
        const { data: stepsData, error: stepsError } = await supabase
          .from('task_workflow_steps')
          .select('*')
          .in('task_id', taskIds)
          .order('step_order', { ascending: true });

        if (stepsError) throw stepsError;

        // Fetch products for these tasks (with workflow_step_id)
        const { data: productsData } = await supabase
          .from('task_products')
          .select('id, task_id, workflow_step_id, product_name, quantity, unit, supplier_name')
          .in('task_id', taskIds);

        // Map products to steps
        const stepsWithProducts = (stepsData || []).map(step => ({
          ...step,
          products: (productsData || [])
            .filter(p => p.workflow_step_id === step.id || (p.task_id === step.task_id && !p.workflow_step_id))
            .map(p => ({
              id: p.id,
              product_name: p.product_name,
              quantity: p.quantity,
              unit: p.unit,
              supplier_name: p.supplier_name
            })) as WorkflowStepProduct[]
        }));

        // Map steps to tasks
        const tasksWithSteps = taskData.map(task => ({
          ...task,
          assigned_profile: task.profiles as any,
          last_updated_profile: task.last_updated_profile as any,
          workflow_steps: stepsWithProducts.filter(s => s.task_id === task.id) as WorkflowStep[]
        }));

        setTasks(tasksWithSteps);
        
        // Count tasks assigned to me with pending steps
        const myPendingTasks = tasksWithSteps.filter(t => 
          t.assigned_to === userId && 
          t.workflow_steps?.some(s => s.status !== 'completed')
        );
        setNotificationCount(myPendingTasks.length);
      } else {
        setTasks([]);
        setNotificationCount(0);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoadingTasks(false);
    }
  }, [userId]);

  // Fetch mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        setIsMapLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.access_token) {
          const response = await supabase.functions.invoke('get-mapbox-token', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          });
          
          if (response.data?.token) {
            setMapboxToken(response.data.token);
            setShowTokenInput(false);
            setIsMapLoading(false);
            return;
          }
        }
        
        const savedToken = localStorage.getItem('mapbox_token');
        if (savedToken) {
          setMapboxToken(savedToken);
          setShowTokenInput(false);
        } else {
          setShowTokenInput(true);
        }
      } catch (error) {
        console.error('Error fetching mapbox token:', error);
        const savedToken = localStorage.getItem('mapbox_token');
        if (savedToken) {
          setMapboxToken(savedToken);
          setShowTokenInput(false);
        } else {
          setShowTokenInput(true);
        }
      } finally {
        setIsMapLoading(false);
      }
    };

    fetchMapboxToken();
  }, []);

  // Fetch tasks on mount
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-time subscription for tasks
  useEffect(() => {
    const channel = supabase
      .channel('operations-tasks')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `status=eq.production`
      }, () => fetchTasks())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_workflow_steps'
      }, () => fetchTasks())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  const handleSaveToken = () => {
    if (tempToken.trim()) {
      localStorage.setItem('mapbox_token', tempToken.trim());
      setMapboxToken(tempToken.trim());
      setShowTokenInput(false);
      toast.success('Mapbox token saved');
    }
  };

  const handleTaskClick = (task: OperationsTaskWithSteps) => {
    setSelectedTask(task);
    setTaskSheetOpen(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);
      
      if (error) throw error;
      toast.success('Task deleted');
      setTaskSheetOpen(false);
      setSelectedTask(null);
      fetchTasks();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  // Filter tasks based on search
  const filteredTasks = tasks.filter(task => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.title.toLowerCase().includes(query) ||
      task.client_name?.toLowerCase().includes(query) ||
      task.delivery_address?.toLowerCase().includes(query)
    );
  });

  // Separate my tasks vs others
  const myTasks = filteredTasks.filter(t => t.assigned_to === userId);
  const otherTasks = filteredTasks.filter(t => t.assigned_to !== userId);
  const urgentTasks = filteredTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-background border-b px-4 py-3 safe-area-inset-top">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{userName}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                <span>Operations</span>
                {isTracking && (
                  <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] gap-0.5 border-green-500/50 text-green-600">
                    <Navigation className="h-2.5 w-2.5" />
                    Live
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative"
              onClick={fetchTasks}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
            
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notificationCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {notificationCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-3 overflow-x-auto">
        <Badge variant="default" className="shrink-0 gap-1.5 py-1.5">
          <ClipboardList className="h-3.5 w-3.5" />
          {tasks.length} Tasks
        </Badge>
        {myTasks.length > 0 && (
          <Badge variant="secondary" className="shrink-0 gap-1.5 py-1.5">
            <User className="h-3.5 w-3.5" />
            {myTasks.length} Mine
          </Badge>
        )}
        {urgentTasks.length > 0 && (
          <Badge variant="destructive" className="shrink-0 gap-1.5 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {urgentTasks.length} Urgent
          </Badge>
        )}
      </div>

      {/* View Toggle & Search */}
      <div className="px-4 py-3 border-b bg-background sticky top-[68px] z-40 space-y-3">
        {/* View Toggle */}
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'tasks' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setViewMode('tasks')}
          >
            <LayoutList className="h-4 w-4" />
            <span className="hidden sm:inline">Tasks</span>
          </Button>
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Routes</span>
          </Button>
          <Button
            variant={viewMode === 'map' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setViewMode('map')}
          >
            <Map className="h-4 w-4" />
            <span className="hidden sm:inline">Map</span>
          </Button>
        </div>

        {/* Search (only for tasks view) */}
        {viewMode === 'tasks' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tasks, clients, addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        )}
      </div>

      <main className="flex-1 overflow-hidden">
        {viewMode === 'tasks' ? (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4 pb-24">
              {isLoadingTasks ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground mt-2">Loading tasks...</p>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  {searchQuery ? (
                    <>
                      <Search className="h-12 w-12 text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">No tasks match your search</p>
                      <Button 
                        variant="link" 
                        onClick={() => setSearchQuery('')}
                        className="mt-2"
                      >
                        Clear search
                      </Button>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-12 w-12 text-green-500/50 mb-3" />
                      <p className="text-muted-foreground">No production tasks</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        All caught up!
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  {/* My Tasks Section */}
                  {myTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <User className="h-4 w-4 text-primary" />
                        <h2 className="font-semibold text-sm">My Tasks</h2>
                        <Badge variant="secondary" className="text-xs">
                          {myTasks.length}
                        </Badge>
                      </div>
                      {myTasks.map(task => (
                        <OperationsMobileTaskCard
                          key={task.id}
                          task={task}
                          currentUserId={userId}
                          onTaskClick={handleTaskClick}
                          onStepUpdated={fetchTasks}
                        />
                      ))}
                    </div>
                  )}

                  {/* Other Tasks Section */}
                  {otherTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-1">
                        <ClipboardList className="h-4 w-4 text-muted-foreground" />
                        <h2 className="font-semibold text-sm text-muted-foreground">Other Tasks</h2>
                        <Badge variant="outline" className="text-xs">
                          {otherTasks.length}
                        </Badge>
                      </div>
                      {otherTasks.map(task => (
                        <OperationsMobileTaskCard
                          key={task.id}
                          task={task}
                          currentUserId={userId}
                          onTaskClick={handleTaskClick}
                          onStepUpdated={fetchTasks}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        ) : viewMode === 'calendar' ? (
          // Calendar Route View
          <OperationsRouteCalendar 
            userId={userId}
            onStepClick={(step) => {
              // Find the task for this step and open it
              const task = tasks.find(t => t.id === step.task_id);
              if (task) {
                handleTaskClick(task);
              }
            }}
          />
        ) : (
          <div className="h-full w-full" style={{ minHeight: 'calc(100vh - 200px)' }}>
            {isMapLoading ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Loading map...</p>
              </div>
            ) : showTokenInput && !mapboxToken ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Enable Live Map</h2>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Enter your Mapbox public token to enable live location tracking
                </p>
                <div className="w-full max-w-xs space-y-3">
                  <Input
                    type="text"
                    placeholder="pk.eyJ1IjoieW91ci10b2tlbi4uLiI"
                    value={tempToken}
                    onChange={(e) => setTempToken(e.target.value)}
                    className="text-center h-12"
                  />
                  <Button className="w-full h-12" onClick={handleSaveToken}>
                    <Map className="h-4 w-4 mr-2" />
                    Enable Map
                  </Button>
                  <a 
                    href="https://mapbox.com" 
                    target="_blank" 
                    rel="noopener" 
                    className="text-xs text-primary underline block"
                  >
                    Get a free token from Mapbox.com →
                  </a>
                </div>
              </div>
            ) : mapboxToken ? (
              <OperationsLocationMap
                userId={userId}
                mapboxToken={mapboxToken}
                operationsUsers={operationsUsers}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <MapPin className="h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">Map token not available</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Task Detail Sheet */}
      <OperationsMobileTaskSheet
        open={taskSheetOpen}
        onOpenChange={setTaskSheetOpen}
        task={selectedTask}
        operationsUsers={operationsUsers}
        isAdmin={isAdmin}
        onDeleteTask={handleDeleteTask}
        onTaskUpdated={() => {
          fetchTasks();
          // Update selected task with fresh data
          if (selectedTask) {
            const updated = tasks.find(t => t.id === selectedTask.id);
            if (updated) setSelectedTask(updated);
          }
        }}
      />
    </div>
  );
};
