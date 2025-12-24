import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Truck, 
  User, 
  Package,
  Clock,
  Navigation
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OperationsTaskCard, OperationsTask } from "./OperationsTaskCard";

interface OperationsTodayViewProps {
  currentUserId: string;
  operationsUsers: Array<{ id: string; full_name: string | null; email: string }>;
  onTaskClick: (task: OperationsTask) => void;
}

export const OperationsTodayView = ({ 
  currentUserId, 
  operationsUsers,
  onTaskClick 
}: OperationsTodayViewProps) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState<OperationsTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasksForDate = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

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
          assigned_to,
          priority,
          status,
          created_at,
          assigned_profile:profiles!tasks_assigned_to_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('status', 'production')
        .is('deleted_at', null)
        .gte('due_date', dayStart.toISOString())
        .lte('due_date', dayEnd.toISOString())
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true });

      if (error) throw error;
      setTasks((data || []) as OperationsTask[]);
    } catch (error) {
      console.error('Error fetching routing tasks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasksForDate(selectedDate);
  }, [selectedDate, fetchTasksForDate]);

  // Group tasks by assigned user
  const tasksByUser = useMemo(() => {
    return tasks.reduce((acc, task) => {
      const userId = task.assigned_to || 'unassigned';
      if (!acc[userId]) {
        acc[userId] = [];
      }
      acc[userId].push(task);
      return acc;
    }, {} as Record<string, OperationsTask[]>);
  }, [tasks]);

  // Group tasks by delivery area (extract city/area from address)
  const tasksByArea = useMemo(() => {
    return tasks.reduce((acc, task) => {
      let area = 'No Address';
      if (task.delivery_address) {
        // Try to extract area from address (simplified - could be enhanced)
        const parts = task.delivery_address.split(',');
        area = parts.length > 1 ? parts[parts.length - 2].trim() : parts[0].trim();
      }
      if (!acc[area]) {
        acc[area] = [];
      }
      acc[area].push(task);
      return acc;
    }, {} as Record<string, OperationsTask[]>);
  }, [tasks]);

  const goToPreviousDay = () => setSelectedDate(addDays(selectedDate, -1));
  const goToNextDay = () => setSelectedDate(addDays(selectedDate, 1));
  const goToToday = () => setSelectedDate(new Date());

  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  // My tasks for today (assigned to current user)
  const myTasks = tasks.filter(t => t.assigned_to === currentUserId);
  const otherTasks = tasks.filter(t => t.assigned_to !== currentUserId);

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              Today's Deliveries
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToPreviousDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant={isToday ? "default" : "outline"} 
                size="sm" 
                onClick={goToToday}
              >
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={goToNextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-center py-2">
            <div className="text-2xl font-bold">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {tasks.length} {tasks.length === 1 ? 'delivery' : 'deliveries'} scheduled
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Loading State */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            Loading deliveries...
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">No deliveries scheduled for this date</p>
            <Button variant="outline" size="sm" onClick={goToToday}>
              Go to Today
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* My Tasks Section */}
          {myTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <User className="h-5 w-5 text-primary" />
                <h2 className="font-semibold text-lg">My Deliveries</h2>
                <Badge variant="default">{myTasks.length}</Badge>
              </div>
              <div className="space-y-3">
                {myTasks.map((task) => (
                  <OperationsTaskCard
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    onTaskClick={onTaskClick}
                    showAssignment={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Other Team Members' Tasks */}
          {Object.entries(tasksByUser)
            .filter(([userId]) => userId !== currentUserId && userId !== 'unassigned')
            .map(([userId, userTasks]) => {
              const user = operationsUsers.find(u => u.id === userId);
              return (
                <div key={userId} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <h2 className="font-semibold text-lg text-muted-foreground">
                      {user?.full_name || user?.email || 'Team Member'}
                    </h2>
                    <Badge variant="secondary">{userTasks.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {userTasks.map((task) => (
                      <OperationsTaskCard
                        key={task.id}
                        task={task}
                        currentUserId={currentUserId}
                        onTaskClick={onTaskClick}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

          {/* Unassigned Tasks */}
          {tasksByUser['unassigned']?.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Clock className="h-5 w-5 text-amber-600" />
                <h2 className="font-semibold text-lg text-amber-700">Unassigned</h2>
                <Badge variant="outline" className="border-amber-500 text-amber-700">
                  {tasksByUser['unassigned'].length}
                </Badge>
              </div>
              <div className="space-y-3">
                {tasksByUser['unassigned'].map((task) => (
                  <OperationsTaskCard
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    onTaskClick={onTaskClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Route Summary by Area */}
          {Object.keys(tasksByArea).length > 1 && (
            <Card className="bg-muted/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Navigation className="h-4 w-4" />
                  Deliveries by Area
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tasksByArea).map(([area, areaTasks]) => (
                    <Badge 
                      key={area} 
                      variant="outline" 
                      className="text-sm py-1.5"
                    >
                      <MapPin className="h-3 w-3 mr-1" />
                      {area}: {areaTasks.length}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
