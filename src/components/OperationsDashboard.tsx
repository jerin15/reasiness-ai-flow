import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OperationsDailyRouting } from "@/components/OperationsDailyRouting";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Package, 
  Truck,
  LayoutGrid
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { OperationsTaskDetails } from "@/components/OperationsTaskDetails";

type Task = {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  suppliers: string[] | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  due_date: string | null;
  status: string;
  created_at: string;
};

interface OperationsDashboardProps {
  userId: string;
}

export const OperationsDashboard = ({ userId }: OperationsDashboardProps) => {
  const [productionTasks, setProductionTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState("today");

  useEffect(() => {
    fetchTasks();

    // Subscribe to task changes
    const channel = supabase
      .channel('operations-tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .or(`assigned_to.eq.${userId},assigned_to.is.null`)
        .in('status', ['production', 'done'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setProductionTasks((data || []).filter(t => t.status === 'production'));
      setDoneTasks((data || []).filter(t => t.status === 'done'));
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const TaskCard = ({ task, showActions }: { task: Task; showActions: boolean }) => {
    const hasDeliveryInfo = task.delivery_address || task.suppliers?.length;
    
    return (
      <Card 
        className={cn(
          "cursor-pointer transition-all hover:shadow-lg border-2",
          !hasDeliveryInfo && "border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/20"
        )}
        onClick={() => setSelectedTask(task)}
      >
        <CardContent className="p-4 space-y-3">
          {/* Title and Status */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-base leading-tight flex-1">
                {task.title}
              </h3>
              {!hasDeliveryInfo && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 shrink-0">
                  Info Needed
                </Badge>
              )}
            </div>
            
            {task.client_name && (
              <p className="text-sm text-muted-foreground">
                Client: {task.client_name}
              </p>
            )}
          </div>

          {/* Due Date */}
          {task.due_date && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {format(new Date(task.due_date), 'MMM d, yyyy • h:mm a')}
              </span>
            </div>
          )}

          {/* Quick Info Preview */}
          <div className="space-y-2">
            {task.suppliers && task.suppliers.length > 0 && (
              <div className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">
                  {task.suppliers.length} supplier{task.suppliers.length > 1 ? 's' : ''}: {task.suppliers.join(' → ')}
                </span>
              </div>
            )}
            
            {task.delivery_address && (
              <div className="flex items-start gap-2 text-sm p-2 bg-blue-50 dark:bg-blue-950/30 rounded">
                <MapPin className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <span className="line-clamp-2 text-blue-700 dark:text-blue-300">
                  {task.delivery_address}
                </span>
              </div>
            )}

            {task.delivery_instructions && (
              <div className="flex items-start gap-2 text-sm p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                <Package className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="line-clamp-2 text-amber-700 dark:text-amber-300">
                  {task.delivery_instructions}
                </span>
              </div>
            )}
          </div>

          {/* Action Hint */}
          <div className="pt-2 border-t text-xs text-muted-foreground text-center">
            Tap to view full details
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <div className="h-full w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full grid grid-cols-3 h-14 sticky top-0 z-10 bg-background">
            <TabsTrigger value="today" className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              <span className="hidden sm:inline">Today's Route</span>
              <span className="sm:hidden">Today</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="flex items-center gap-2 text-base">
              <LayoutGrid className="h-5 w-5" />
              <span className="hidden sm:inline">In Progress</span>
              <span className="sm:hidden">Active</span>
              {productionTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {productionTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="done" className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5" />
              <span className="hidden sm:inline">Completed</span>
              <span className="sm:hidden">Done</span>
            </TabsTrigger>
          </TabsList>

          {/* Today's Route Tab */}
          <TabsContent value="today" className="flex-1 overflow-auto p-4">
            <OperationsDailyRouting />
          </TabsContent>

          {/* Production Tasks Tab */}
          <TabsContent value="production" className="flex-1 overflow-auto p-4">
            {loading ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Loading tasks...
                </CardContent>
              </Card>
            ) : productionTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">No active tasks</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    In Progress Tasks
                  </h2>
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    {productionTasks.length}
                  </Badge>
                </div>
                <div className="grid gap-4">
                  {productionTasks.map(task => (
                    <TaskCard key={task.id} task={task} showActions={true} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Done Tasks Tab */}
          <TabsContent value="done" className="flex-1 overflow-auto p-4">
            {loading ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Loading tasks...
                </CardContent>
              </Card>
            ) : doneTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">No completed tasks</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">
                    Completed Tasks
                  </h2>
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    {doneTasks.length}
                  </Badge>
                </div>
                <div className="grid gap-4">
                  {doneTasks.map(task => (
                    <TaskCard key={task.id} task={task} showActions={false} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Task Details Dialog */}
      {selectedTask && (
        <OperationsTaskDetails
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          task={selectedTask}
          onTaskUpdated={fetchTasks}
        />
      )}
    </>
  );
};
