import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  CheckCircle2, 
  LayoutGrid
} from "lucide-react";
import { toast } from "sonner";
import { OperationsTodayView } from "./operations/OperationsTodayView";
import { OperationsTaskList } from "./operations/OperationsTaskList";
import { OperationsTaskCard, OperationsTask } from "./operations/OperationsTaskCard";
import { OperationsTaskDetails } from "@/components/OperationsTaskDetails";
import { useConnectionAwareRefetch } from "@/hooks/useConnectionAwareRefetch";
import { useDebouncedCallback } from "@/hooks/useVisibilityAwareSubscription";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Search, Package } from "lucide-react";

interface OperationsDashboardProps {
  userId: string;
  userRole?: string;
}

export const OperationsDashboard = ({ userId, userRole }: OperationsDashboardProps) => {
  const [productionTasks, setProductionTasks] = useState<OperationsTask[]>([]);
  const [doneTasks, setDoneTasks] = useState<OperationsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<OperationsTask | null>(null);
  const [activeTab, setActiveTab] = useState("today");
  const [operationsUsers, setOperationsUsers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [doneSearchQuery, setDoneSearchQuery] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // Get operations user IDs
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');
      
      const operationsUserIds = roleData?.map(r => r.user_id) || [];

      if (operationsUserIds.length === 0) {
        setProductionTasks([]);
        setDoneTasks([]);
        setLoading(false);
        return;
      }

      // Fetch operations tasks (created by or assigned to operations team)
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          client_name,
          suppliers,
          delivery_address,
          delivery_instructions,
          due_date,
          status,
          priority,
          created_at,
          assigned_to,
          assigned_profile:profiles!tasks_assigned_to_fkey(
            id,
            full_name,
            email
          )
        `)
        .in('status', ['production', 'done'])
        .is('deleted_at', null)
        .or(`created_by.in.(${operationsUserIds.join(',')}),assigned_to.in.(${operationsUserIds.join(',')})`)
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true });

      if (error) throw error;

      const allTasks = (data || []) as OperationsTask[];
      setProductionTasks(allTasks.filter(t => t.status === 'production'));
      setDoneTasks(allTasks.filter(t => t.status === 'done'));
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetchTasks = useDebouncedCallback(fetchTasks, 300);

  // Connection-aware refetch for auto-sync
  useConnectionAwareRefetch(debouncedFetchTasks, {
    pollingInterval: 30000,
    enablePolling: true,
  });

  // Setup real-time subscription with visibility awareness
  useEffect(() => {
    fetchOperationsUsers();
    fetchTasks();

    const setupSubscription = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      channelRef.current = supabase
        .channel('operations-tasks-new')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tasks',
          },
          () => {
            debouncedFetchTasks();
          }
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Operations subscription error, will retry...');
            setTimeout(setupSubscription, 5000);
          }
        });
    };

    setupSubscription();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debouncedFetchTasks();
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
        setupSubscription();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchOperationsUsers, fetchTasks, debouncedFetchTasks]);

  const handleTaskClick = (task: OperationsTask) => {
    setSelectedTask(task);
  };

  const handleTaskUpdated = () => {
    fetchTasks();
    setSelectedTask(null);
  };

  // Filter done tasks based on search query
  const filteredDoneTasks = doneSearchQuery.trim()
    ? doneTasks.filter(task => 
        task.title.toLowerCase().includes(doneSearchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(doneSearchQuery.toLowerCase()) ||
        task.client_name?.toLowerCase().includes(doneSearchQuery.toLowerCase()) ||
        task.delivery_address?.toLowerCase().includes(doneSearchQuery.toLowerCase())
      )
    : doneTasks;

  return (
    <>
      <div className="h-full w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full grid grid-cols-3 h-14 sticky top-0 z-10 bg-background shadow-sm">
            <TabsTrigger 
              value="today" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
            >
              <Calendar className="h-5 w-5" />
              <span>Today</span>
            </TabsTrigger>
            <TabsTrigger 
              value="all" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
            >
              <LayoutGrid className="h-5 w-5" />
              <span className="flex items-center gap-1">
                All Tasks
                {productionTasks.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 hidden sm:flex">
                    {productionTasks.length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="done" 
              className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-sm py-2"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>Done</span>
            </TabsTrigger>
          </TabsList>

          {/* Today's Deliveries Tab */}
          <TabsContent value="today" className="flex-1 overflow-auto p-3 sm:p-4">
            <OperationsTodayView
              currentUserId={userId}
              operationsUsers={operationsUsers}
              onTaskClick={handleTaskClick}
            />
          </TabsContent>

          {/* All Tasks Tab */}
          <TabsContent value="all" className="flex-1 overflow-auto p-3 sm:p-4">
            <OperationsTaskList
              tasks={productionTasks}
              currentUserId={userId}
              operationsUsers={operationsUsers}
              onTaskClick={handleTaskClick}
              loading={loading}
            />
          </TabsContent>

          {/* Done Tasks Tab */}
          <TabsContent value="done" className="flex-1 overflow-auto p-3 sm:p-4 space-y-4">
            {/* Search Bar */}
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search completed tasks..."
                    value={doneSearchQuery}
                    onChange={(e) => setDoneSearchQuery(e.target.value)}
                    className="pl-10 h-11"
                  />
                </div>
              </CardContent>
            </Card>

            {loading ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
                  Loading...
                </CardContent>
              </Card>
            ) : filteredDoneTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  {doneSearchQuery ? (
                    <>
                      <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-muted-foreground">No completed tasks match your search</p>
                    </>
                  ) : (
                    <>
                      <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-muted-foreground">No completed tasks yet</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredDoneTasks.map(task => (
                  <OperationsTaskCard
                    key={task.id}
                    task={task}
                    currentUserId={userId}
                    onTaskClick={handleTaskClick}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Details Modal */}
      {selectedTask && (
        <OperationsTaskDetails
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          task={selectedTask}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </>
  );
};
