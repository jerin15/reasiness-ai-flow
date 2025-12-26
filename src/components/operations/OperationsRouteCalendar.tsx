import { useState, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { 
  CalendarDays, 
  Package, 
  Truck, 
  MapPin, 
  ChevronLeft, 
  ChevronRight,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

interface WorkflowStepWithTask {
  id: string;
  task_id: string;
  step_type: string;
  supplier_name: string | null;
  location_address: string | null;
  due_date: string | null;
  status: string;
  step_order: number;
  task_title: string;
  task_client: string | null;
  task_priority: string;
}

interface DayRouteData {
  date: Date;
  collections: WorkflowStepWithTask[];
  deliveries: WorkflowStepWithTask[];
  totalSteps: number;
}

interface OperationsRouteCalendarProps {
  userId: string;
  onStepClick?: (step: WorkflowStepWithTask) => void;
}

const stepTypeConfig = {
  collect: {
    icon: Package,
    label: 'Collection',
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950'
  },
  deliver_to_supplier: {
    icon: Truck,
    label: 'To Supplier',
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950'
  },
  deliver_to_client: {
    icon: MapPin,
    label: 'To Client',
    color: 'bg-green-500',
    textColor: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950'
  }
};

export const OperationsRouteCalendar = ({ userId, onStepClick }: OperationsRouteCalendarProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [stepsData, setStepsData] = useState<WorkflowStepWithTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dayRoutes, setDayRoutes] = useState<Map<string, DayRouteData>>(new Map());

  // Fetch all workflow steps for the current month
  const fetchMonthData = useCallback(async () => {
    setIsLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      // Fetch workflow steps with their task info
      const { data: stepsRaw, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, task_id, step_type, supplier_name, location_address, 
          due_date, status, step_order,
          tasks!inner (
            id, title, client_name, priority, status, assigned_to, deleted_at
          )
        `)
        .gte('due_date', monthStart.toISOString())
        .lte('due_date', monthEnd.toISOString())
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production');

      if (error) throw error;

      // Transform data
      const steps: WorkflowStepWithTask[] = (stepsRaw || []).map((s: any) => ({
        id: s.id,
        task_id: s.task_id,
        step_type: s.step_type,
        supplier_name: s.supplier_name,
        location_address: s.location_address,
        due_date: s.due_date,
        status: s.status,
        step_order: s.step_order,
        task_title: s.tasks?.title || 'Unknown Task',
        task_client: s.tasks?.client_name,
        task_priority: s.tasks?.priority || 'medium'
      }));

      setStepsData(steps);

      // Group by date
      const routeMap = new Map<string, DayRouteData>();
      steps.forEach(step => {
        if (!step.due_date) return;
        const dateKey = format(new Date(step.due_date), 'yyyy-MM-dd');
        const stepDate = new Date(step.due_date);
        
        if (!routeMap.has(dateKey)) {
          routeMap.set(dateKey, {
            date: stepDate,
            collections: [],
            deliveries: [],
            totalSteps: 0
          });
        }

        const dayData = routeMap.get(dateKey)!;
        if (step.step_type === 'collect') {
          dayData.collections.push(step);
        } else {
          dayData.deliveries.push(step);
        }
        dayData.totalSteps++;
      });

      setDayRoutes(routeMap);
    } catch (error) {
      console.error('Error fetching route data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchMonthData();
  }, [fetchMonthData]);

  // Get route data for selected date
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedDayData = dayRoutes.get(selectedDateKey);

  // Get steps for selected day sorted by step_order
  const selectedDaySteps = stepsData
    .filter(s => s.due_date && isSameDay(new Date(s.due_date), selectedDate))
    .sort((a, b) => a.step_order - b.step_order);

  // Day content renderer for calendar
  const renderDayContent = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayData = dayRoutes.get(dateKey);
    
    if (!dayData || dayData.totalSteps === 0) return null;

    const hasCollections = dayData.collections.length > 0;
    const hasDeliveries = dayData.deliveries.length > 0;
    const hasPending = [...dayData.collections, ...dayData.deliveries].some(s => s.status !== 'completed');

    return (
      <div className="flex flex-col items-center gap-0.5 mt-0.5">
        <div className="flex gap-0.5">
          {hasCollections && (
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              dayData.collections.some(c => c.status !== 'completed') ? "bg-blue-500" : "bg-blue-300"
            )} />
          )}
          {hasDeliveries && (
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              dayData.deliveries.some(d => d.status !== 'completed') ? "bg-green-500" : "bg-green-300"
            )} />
          )}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground">
          {dayData.totalSteps}
        </span>
      </div>
    );
  };

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  return (
    <div className="flex flex-col h-full">
      {/* Calendar Header */}
      <div className="px-4 py-3 border-b bg-background flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-lg">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button variant="ghost" size="icon" onClick={handleNextMonth}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Calendar */}
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className="rounded-lg border bg-card shadow-sm mx-auto"
              classNames={{
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                day_today: "bg-accent text-accent-foreground font-bold"
              }}
              components={{
                DayContent: ({ date }) => (
                  <div className="flex flex-col items-center">
                    <span>{date.getDate()}</span>
                    {renderDayContent(date)}
                  </div>
                )
              }}
            />

            {/* Selected Day Summary */}
            <Card className="border-primary/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  {format(selectedDate, 'EEEE, MMMM d')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {selectedDayData && selectedDayData.totalSteps > 0 ? (
                  <>
                    {/* Summary Badges */}
                    <div className="flex flex-wrap gap-2">
                      {selectedDayData.collections.length > 0 && (
                        <Badge variant="secondary" className="gap-1.5 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          <Package className="h-3.5 w-3.5" />
                          {selectedDayData.collections.length} Collection{selectedDayData.collections.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {selectedDayData.deliveries.length > 0 && (
                        <Badge variant="secondary" className="gap-1.5 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                          <Truck className="h-3.5 w-3.5" />
                          {selectedDayData.deliveries.length} Deliver{selectedDayData.deliveries.length !== 1 ? 'ies' : 'y'}
                        </Badge>
                      )}
                    </div>

                    {/* Steps List */}
                    <div className="space-y-2">
                      {selectedDaySteps.map((step, index) => {
                        const config = stepTypeConfig[step.step_type as keyof typeof stepTypeConfig] || stepTypeConfig.collect;
                        const StepIcon = config.icon;
                        const isCompleted = step.status === 'completed';

                        return (
                          <button
                            key={step.id}
                            onClick={() => onStepClick?.(step)}
                            className={cn(
                              "w-full text-left p-3 rounded-lg border transition-all",
                              "hover:border-primary/50 hover:shadow-sm",
                              isCompleted ? "opacity-60" : "",
                              config.bgColor
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold",
                                config.color
                              )}>
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm truncate">
                                    {step.supplier_name || step.task_client || 'Unknown'}
                                  </span>
                                  <Badge 
                                    variant={isCompleted ? "secondary" : "outline"} 
                                    className="text-[10px] h-5"
                                  >
                                    {isCompleted ? (
                                      <><CheckCircle className="h-3 w-3 mr-1" /> Done</>
                                    ) : (
                                      <><Clock className="h-3 w-3 mr-1" /> Pending</>
                                    )}
                                  </Badge>
                                  {step.task_priority === 'urgent' && (
                                    <Badge variant="destructive" className="text-[10px] h-5">
                                      <AlertTriangle className="h-3 w-3 mr-1" /> Urgent
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                  <StepIcon className="h-3 w-3 shrink-0" />
                                  {config.label}
                                </p>
                                {step.location_address && (
                                  <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                                    <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                    <span className="line-clamp-1">{step.location_address}</span>
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  Task: {step.task_title}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No routes scheduled</p>
                    <p className="text-xs text-muted-foreground mt-1">Select a day with indicators to view routes</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Monthly Summary */}
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {format(currentMonth, 'MMMM')} Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                    <Package className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                      {Array.from(dayRoutes.values()).reduce((sum, d) => sum + d.collections.length, 0)}
                    </p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">Collections</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950">
                    <Truck className="h-5 w-5 mx-auto text-green-600 mb-1" />
                    <p className="text-xl font-bold text-green-700 dark:text-green-300">
                      {Array.from(dayRoutes.values()).reduce((sum, d) => sum + d.deliveries.length, 0)}
                    </p>
                    <p className="text-[10px] text-green-600 dark:text-green-400">Deliveries</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <CalendarDays className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xl font-bold">
                      {dayRoutes.size}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Active Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
