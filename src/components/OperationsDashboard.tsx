import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationsDailyRouting } from "@/components/OperationsDailyRouting";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Package, 
  Truck,
  LayoutGrid,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { OperationsTaskDetails } from "@/components/OperationsTaskDetails";
import { toast } from "sonner";

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
  priority: string;
  created_at: string;
  assigned_to: string | null;
  assigned_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  };
};

interface OperationsDashboardProps {
  userId: string;
  userRole?: string;
}

export const OperationsDashboard = ({ userId, userRole }: OperationsDashboardProps) => {
  const [productionTasks, setProductionTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState("today");
  const [operationsUsers, setOperationsUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchOperationsUsers();
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
  }, []);

  const fetchOperationsUsers = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name, email)')
        .eq('role', 'operations');
      
      if (data) {
        setOperationsUsers(data.map(d => d.profiles).filter(Boolean));
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      // Get operations user IDs
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');
      
      const operationsUserIds = roleData?.map(r => r.user_id) || [];

      // Fetch operations tasks (created by or assigned to operations team)
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
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

      setProductionTasks((data || []).filter(t => t.status === 'production'));
      setDoneTasks((data || []).filter(t => t.status === 'done'));
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      toast.success('Task deleted successfully');
      fetchTasks();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error(error.message || 'Failed to delete task');
    }
  };

  const priorityConfig = {
    urgent: {
      color: "bg-red-100 dark:bg-red-950 border-red-500 text-red-700 dark:text-red-300",
      label: "🚨 URGENT",
      icon: "🔴"
    },
    high: {
      color: "bg-orange-100 dark:bg-orange-950 border-orange-500 text-orange-700 dark:text-orange-300",
      label: "⚠️ HIGH",
      icon: "🟠"
    },
    medium: {
      color: "bg-blue-100 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300",
      label: "📋 MEDIUM",
      icon: "🔵"
    },
    low: {
      color: "bg-gray-100 dark:bg-gray-950 border-gray-500 text-gray-700 dark:text-gray-300",
      label: "📝 LOW",
      icon: "⚪"
    }
  };

  const TaskCard = ({ task, showActions }: { task: Task; showActions: boolean }) => {
    const hasDeliveryInfo = task.delivery_address || task.suppliers?.length;
    const isAssignedToMe = task.assigned_to === userId;
    const assignedUserName = task.assigned_profile?.full_name || task.assigned_profile?.email || 'Unassigned';
    const isAdmin = userRole === 'admin';
    const priority = priorityConfig[task.priority as keyof typeof priorityConfig];
    const isUrgent = task.priority === 'urgent' || task.priority === 'high';
    
    return (
      <Card 
        className={cn(
          "cursor-pointer transition-all active:scale-[0.98]",
          "border-l-4",
          !hasDeliveryInfo && "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
          isAssignedToMe && "border-l-primary bg-primary/5",
          isUrgent && "shadow-lg shadow-red-500/20"
        )}
        onClick={() => setSelectedTask(task)}
      >
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Header Row */}
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm sm:text-base leading-tight line-clamp-2">
                {task.title}
              </h3>
              {task.client_name && (
                <p className="text-xs text-muted-foreground mt-1">
                  📋 {task.client_name}
                </p>
              )}
            </div>
            
            {/* Priority Badge */}
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] sm:text-xs font-bold border-2 whitespace-nowrap",
                priority.color
              )}
            >
              {priority.label}
            </Badge>
          </div>

          {/* Assignment & Status Row */}
          <div className="flex flex-wrap gap-1.5">
            {task.assigned_to ? (
              <Badge 
                variant={isAssignedToMe ? "default" : "secondary"} 
                className="text-xs"
              >
                {isAssignedToMe ? '👤 You' : `👤 ${assignedUserName.split(' ')[0]}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-dashed">
                ⚠️ Unassigned
              </Badge>
            )}
            
            {!hasDeliveryInfo && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400">
                📝 Info Needed
              </Badge>
            )}
          </div>

          {/* Delivery Date - Prominent */}
          {task.due_date && (
            <div className={cn(
              "flex items-center gap-2 text-xs sm:text-sm p-2.5 rounded-lg font-semibold",
              isUrgent 
                ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 border-2 border-red-500 animate-pulse" 
                : "bg-muted border border-border"
            )}>
              <Calendar className={cn(
                "h-4 w-4 shrink-0",
                isUrgent ? "text-red-600" : "text-primary"
              )} />
              <div className="flex-1">
                <div className={cn(
                  "text-xs opacity-70",
                  isUrgent && "text-red-700 dark:text-red-300"
                )}>
                  Delivery Date
                </div>
                <div className={cn(
                  isUrgent && "text-red-700 dark:text-red-300"
                )}>
                  {format(new Date(task.due_date), 'MMM d, yyyy')}
                </div>
              </div>
              {isUrgent && <span className="text-xl">⏰</span>}
            </div>
          )}

          {/* Compact Info Section */}
          <div className="space-y-1.5">
            {task.suppliers && task.suppliers.length > 0 && (
              <div className="flex items-center gap-2 text-xs p-2 bg-background border border-border rounded">
                <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">
                  {task.suppliers.join(' → ')}
                </span>
              </div>
            )}
            
            {task.delivery_address && (
              <div className="flex items-center gap-2 text-xs p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded">
                <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="truncate text-blue-700 dark:text-blue-300">
                  {task.delivery_address}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-2 border-t flex items-center justify-between">
            <span className="text-[10px] sm:text-xs text-muted-foreground">
              Tap for details
            </span>
            {isAdmin && showActions && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteTask(task.id);
                }}
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                🗑️ Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Filter tasks based on search query
  const filterTasks = (tasks: Task[]) => {
    if (!searchQuery.trim()) return tasks;
    
    const query = searchQuery.toLowerCase();
    return tasks.filter(task => 
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.client_name?.toLowerCase().includes(query) ||
      task.suppliers?.some(s => s.toLowerCase().includes(query)) ||
      task.delivery_address?.toLowerCase().includes(query)
    );
  };

  const filteredProductionTasks = filterTasks(productionTasks);
  const filteredDoneTasks = filterTasks(doneTasks);

  return (
    <>
      <div className="h-full w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="w-full grid grid-cols-3 h-12 sm:h-14 sticky top-0 z-10 bg-background shadow-sm">
            <TabsTrigger value="today" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-base py-2">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Today</span>
            </TabsTrigger>
            <TabsTrigger value="production" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-base py-2">
              <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="flex items-center gap-1">
                Active
                {productionTasks.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {productionTasks.length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="done" className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 text-xs sm:text-base py-2">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>Done</span>
            </TabsTrigger>
          </TabsList>

          {/* Today's Route Tab */}
          <TabsContent value="today" className="flex-1 overflow-auto p-3 sm:p-4">
            <OperationsDailyRouting />
          </TabsContent>

          {/* Production Tasks Tab */}
          <TabsContent value="production" className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search tasks by title, client, supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {loading ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Loading tasks...
                </CardContent>
              </Card>
            ) : filteredProductionTasks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center space-y-2">
                  {searchQuery ? (
                    <>
                      <Search className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-muted-foreground">No tasks match your search</p>
                    </>
                  ) : (
                    <>
                      <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-muted-foreground">No active tasks</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {/* Compact Task Distribution */}
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30">
                  <CardContent className="p-3 sm:p-4">
                    <h3 className="text-xs sm:text-sm font-semibold mb-2 flex items-center gap-2">
                      <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Team Workload
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {operationsUsers.map(user => {
                        const userTaskCount = filteredProductionTasks.filter(t => t.assigned_to === user.id).length;
                        return (
                          <div key={user.id} className="flex items-center justify-between p-2 bg-background/90 rounded text-xs sm:text-sm">
                            <span className="font-medium truncate">{user.full_name?.split(' ')[0] || user.email}</span>
                            <Badge variant="secondary" className="text-xs">{userTaskCount}</Badge>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between p-2 bg-background/90 rounded text-xs sm:text-sm">
                        <span className="font-medium">Unassigned</span>
                        <Badge variant="outline" className="text-xs">{filteredProductionTasks.filter(t => !t.assigned_to).length}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Task List */}
                <div className="space-y-2 sm:space-y-3">
                  {filteredProductionTasks.map(task => (
                    <TaskCard key={task.id} task={task} showActions={true} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Done Tasks Tab */}
          <TabsContent value="done" className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search completed tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {loading ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center text-sm text-muted-foreground">
                  Loading...
                </CardContent>
              </Card>
            ) : filteredDoneTasks.length === 0 ? (
              <Card>
                <CardContent className="py-8 sm:py-12 text-center space-y-2">
                  {searchQuery ? (
                    <>
                      <Search className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No completed tasks match your search</p>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No completed tasks yet</p>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {filteredDoneTasks.map(task => (
                  <TaskCard key={task.id} task={task} showActions={true} />
                ))}
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
