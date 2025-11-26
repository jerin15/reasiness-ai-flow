import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, MapPin, Truck, User, Package, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type RoutingTask = {
  id: string;
  title: string;
  client_name: string | null;
  suppliers: string[] | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  due_date: string | null;
  assigned_to: string | null;
  status: string;
  assigned_profile?: {
    full_name: string | null;
    email: string;
  };
};

export const OperationsDailyRouting = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<RoutingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationsUsers, setOperationsUsers] = useState<any[]>([]);

  useEffect(() => {
    fetchOperationsUsers();
    fetchTasksForDate(selectedDate);
  }, [selectedDate]);

  const fetchOperationsUsers = async () => {
    const { data } = await supabase
      .from('user_roles')
      .select('user_id, profiles(id, full_name, email)')
      .eq('role', 'operations');
    
    if (data) {
      setOperationsUsers(data.map(d => d.profiles).filter(Boolean));
    }
  };

  const fetchTasksForDate = async (date: Date) => {
    setLoading(true);
    try {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          client_name,
          suppliers,
          delivery_address,
          delivery_instructions,
          due_date,
          assigned_to,
          status,
          assigned_profile:profiles!tasks_assigned_to_fkey(
            full_name,
            email
          )
        `)
        .eq('status', 'production')
        .is('deleted_at', null)
        .gte('due_date', dayStart.toISOString())
        .lte('due_date', dayEnd.toISOString())
        .order('due_date', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching routing tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousDay = () => {
    setSelectedDate(addDays(selectedDate, -1));
  };

  const goToNextDay = () => {
    setSelectedDate(addDays(selectedDate, 1));
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const tasksByUser = tasks.reduce((acc, task) => {
    const userId = task.assigned_to || 'unassigned';
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(task);
    return acc;
  }, {} as Record<string, RoutingTask[]>);

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Daily Routing Schedule
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousDay}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={isToday ? "default" : "outline"}
                size="sm"
                onClick={goToToday}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextDay}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-2xl font-bold text-center py-2">
            {format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </div>
        </CardHeader>
      </Card>

      {/* Tasks by User */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Loading routes...
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No deliveries scheduled for this date
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(tasksByUser).map(([userId, userTasks]) => {
            const user = userId === 'unassigned' 
              ? null 
              : operationsUsers.find(u => u.id === userId);
            
            return (
              <Card key={userId} className="border-2">
                <CardHeader className="pb-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">
                        {user ? user.full_name || user.email : 'Unassigned Tasks'}
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-sm font-semibold">
                      {userTasks.length} {userTasks.length === 1 ? 'delivery' : 'deliveries'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {userTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={cn(
                        "p-4 rounded-lg border-2 bg-muted/30 space-y-3",
                        "hover:shadow-md transition-shadow"
                      )}
                    >
                      {/* Task Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-primary">
                              Stop #{index + 1}
                            </span>
                            {task.due_date && (
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {format(new Date(task.due_date), 'h:mm a')}
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium">{task.title}</h4>
                          {task.client_name && (
                            <p className="text-sm text-muted-foreground">
                              Client: {task.client_name}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Supplier Workflow */}
                      {task.suppliers && task.suppliers.length > 0 && (
                        <div className="space-y-2 p-3 bg-background/50 rounded border">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Truck className="h-4 w-4 text-primary" />
                            Supplier Route:
                          </div>
                          <div className="space-y-1 pl-6">
                            {task.suppliers.map((supplier, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                                  {idx + 1}
                                </div>
                                <span>{supplier}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Delivery Address */}
                      {task.delivery_address && (
                        <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                          <MapPin className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Final Delivery:
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              {task.delivery_address}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Special Instructions */}
                      {task.delivery_instructions && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded border border-amber-200 dark:border-amber-800">
                          <div className="flex items-start gap-2">
                            <Package className="h-4 w-4 text-amber-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                                Special Instructions:
                              </p>
                              <p className="text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                                {task.delivery_instructions}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
