import { useState, useEffect, useCallback } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
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
  Loader2,
  Plus,
  Trash2,
  StickyNote,
  X,
  ArrowRightLeft
} from 'lucide-react';
import { format, isSameDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StepProduct {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
}

interface WorkflowStepWithTask {
  id: string;
  task_id: string;
  step_type: string;
  supplier_name: string | null;
  location_address: string | null;
  location_notes: string | null; // FROM supplier info for S→S
  due_date: string | null;
  status: string;
  step_order: number;
  task_title: string;
  task_client: string | null;
  task_priority: string;
  task_delivery_address: string | null;
  products: StepProduct[];
}

interface PersonalReminder {
  id: string;
  title: string;
  notes: string | null;
  reminder_date: string;
  is_completed: boolean;
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
    shortLabel: 'Collect',
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    isCollection: true
  },
  supplier_to_supplier: {
    icon: Truck,
    label: 'S→S Transfer',
    shortLabel: 'S→S',
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950',
    isCollection: true // S→S includes collection
  },
  deliver_to_supplier: {
    icon: Truck,
    label: 'To Supplier',
    shortLabel: 'To Supplier',
    color: 'bg-amber-500',
    textColor: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    isCollection: false
  },
  deliver_to_client: {
    icon: MapPin,
    label: 'To Client',
    shortLabel: 'Delivery',
    color: 'bg-green-500',
    textColor: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950',
    isCollection: false
  }
};

export const OperationsRouteCalendar = ({ userId, onStepClick }: OperationsRouteCalendarProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [stepsData, setStepsData] = useState<WorkflowStepWithTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dayRoutes, setDayRoutes] = useState<Map<string, DayRouteData>>(new Map());
  
  // Personal reminders state
  const [reminders, setReminders] = useState<PersonalReminder[]>([]);
  const [isLoadingReminders, setIsLoadingReminders] = useState(true);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderNotes, setNewReminderNotes] = useState('');
  const [newReminderDate, setNewReminderDate] = useState<Date>(new Date());

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
          id, task_id, step_type, supplier_name, location_address, location_notes,
          due_date, status, step_order,
          tasks!inner (
            id, title, client_name, priority, status, assigned_to, deleted_at, delivery_address
          )
        `)
        .gte('due_date', monthStart.toISOString())
        .lte('due_date', monthEnd.toISOString())
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production');

      if (error) throw error;

      // Fetch products for these steps
      const stepIds = (stepsRaw || []).map((s: any) => s.id);
      let productsMap: Record<string, StepProduct[]> = {};
      
      if (stepIds.length > 0) {
        const { data: productsData } = await supabase
          .from('task_products')
          .select('id, workflow_step_id, product_name, quantity, unit, supplier_name')
          .in('workflow_step_id', stepIds);
        
        (productsData || []).forEach(p => {
          if (!p.workflow_step_id) return;
          if (!productsMap[p.workflow_step_id]) {
            productsMap[p.workflow_step_id] = [];
          }
          productsMap[p.workflow_step_id].push({
            id: p.id,
            product_name: p.product_name,
            quantity: p.quantity,
            unit: p.unit,
            supplier_name: p.supplier_name
          });
        });
      }

      // Transform data
      const steps: WorkflowStepWithTask[] = (stepsRaw || []).map((s: any) => ({
        id: s.id,
        task_id: s.task_id,
        step_type: s.step_type,
        supplier_name: s.supplier_name,
        location_address: s.location_address,
        location_notes: s.location_notes,
        due_date: s.due_date,
        status: s.status,
        step_order: s.step_order,
        task_title: s.tasks?.title || 'Unknown Task',
        task_client: s.tasks?.client_name,
        task_priority: s.tasks?.priority || 'medium',
        task_delivery_address: s.tasks?.delivery_address,
        products: productsMap[s.id] || []
      }));

      setStepsData(steps);

      // Group by date - use stepTypeConfig.isCollection to determine category
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
        const config = stepTypeConfig[step.step_type as keyof typeof stepTypeConfig];
        if (config?.isCollection) {
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

  // Fetch personal reminders
  const fetchReminders = useCallback(async () => {
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const { data, error } = await supabase
        .from('operations_personal_reminders')
        .select('*')
        .eq('user_id', userId)
        .gte('reminder_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('reminder_date', format(monthEnd, 'yyyy-MM-dd'))
        .order('reminder_date', { ascending: true });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      console.error('Error fetching reminders:', error);
    } finally {
      setIsLoadingReminders(false);
    }
  }, [userId, currentMonth]);

  useEffect(() => {
    fetchMonthData();
    fetchReminders();
  }, [fetchMonthData, fetchReminders]);

  // Get route data for selected date
  const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');
  const selectedDayData = dayRoutes.get(selectedDateKey);

  // Get steps for selected day sorted by step_order
  const selectedDaySteps = stepsData
    .filter(s => s.due_date && isSameDay(new Date(s.due_date), selectedDate))
    .sort((a, b) => a.step_order - b.step_order);

  // Get reminders for selected date
  const selectedDayReminders = reminders.filter(r => 
    r.reminder_date === format(selectedDate, 'yyyy-MM-dd')
  );

  // Add reminder
  const handleAddReminder = async () => {
    if (!newReminderTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .insert({
          user_id: userId,
          title: newReminderTitle.trim(),
          notes: newReminderNotes.trim() || null,
          reminder_date: format(newReminderDate, 'yyyy-MM-dd')
        });

      if (error) throw error;
      
      toast.success('Reminder added');
      setNewReminderTitle('');
      setNewReminderNotes('');
      setShowAddReminder(false);
      fetchReminders();
    } catch (error: any) {
      console.error('Error adding reminder:', error);
      toast.error(error.message || 'Failed to add reminder');
    }
  };

  // Toggle reminder completion
  const handleToggleReminder = async (reminder: PersonalReminder) => {
    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .update({
          is_completed: !reminder.is_completed,
          completed_at: !reminder.is_completed ? new Date().toISOString() : null
        })
        .eq('id', reminder.id);

      if (error) throw error;
      fetchReminders();
    } catch (error) {
      console.error('Error updating reminder:', error);
      toast.error('Failed to update reminder');
    }
  };

  // Delete reminder
  const handleDeleteReminder = async (id: string) => {
    try {
      const { error } = await supabase
        .from('operations_personal_reminders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Reminder deleted');
      fetchReminders();
    } catch (error) {
      console.error('Error deleting reminder:', error);
      toast.error('Failed to delete reminder');
    }
  };

  // Day content renderer for calendar
  const renderDayContent = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const dayData = dayRoutes.get(dateKey);
    const dayReminders = reminders.filter(r => r.reminder_date === dateKey);
    
    // Separate collections by type: regular collections vs S→S transfers
    const regularCollections = dayData?.collections.filter(c => c.step_type === 'collect') || [];
    const s2sTransfers = dayData?.collections.filter(c => c.step_type === 'supplier_to_supplier') || [];
    
    const hasCollections = regularCollections.length > 0;
    const hasS2S = s2sTransfers.length > 0;
    const hasDeliveries = dayData && dayData.deliveries.length > 0;
    const hasReminders = dayReminders.length > 0;

    if (!hasCollections && !hasS2S && !hasDeliveries && !hasReminders) return null;

    return (
      <div className="flex gap-0.5 mt-0.5 justify-center flex-wrap">
        {hasCollections && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            regularCollections.some(c => c.status !== 'completed') ? "bg-blue-500" : "bg-blue-300"
          )} />
        )}
        {hasS2S && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            s2sTransfers.some(c => c.status !== 'completed') ? "bg-purple-500" : "bg-purple-300"
          )} />
        )}
        {hasDeliveries && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            dayData!.deliveries.some(d => d.status !== 'completed') ? "bg-green-500" : "bg-green-300"
          )} />
        )}
        {hasReminders && (
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            dayReminders.some(r => !r.is_completed) ? "bg-orange-500" : "bg-orange-300"
          )} />
        )}
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
            <div className="grid gap-4 lg:grid-cols-2 items-start">
              {/* Left: Calendar */}
              <div className="space-y-3">
                {/* Calendar with improved styling */}
                <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setNewReminderDate(date);
                      }
                    }}
                    month={currentMonth}
                    onMonthChange={setCurrentMonth}
                    className="p-0 pointer-events-auto"
                    classNames={{
                      months: "w-full",
                      month: "w-full space-y-2",
                      caption: "hidden",
                      caption_label: "hidden",
                      nav: "hidden",
                      table: "w-full border-collapse",
                      head_row: "flex w-full",
                      head_cell: "flex-1 text-center text-xs font-medium text-muted-foreground py-2",
                      row: "flex w-full",
                      cell: "flex-1 text-center p-0.5 relative",
                      day: cn(
                        "w-full h-12 sm:h-14 rounded-lg text-sm font-normal flex flex-col items-center justify-start pt-1.5",
                        "hover:bg-accent/50 transition-colors cursor-pointer",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                      ),
                      day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      day_today: "bg-accent font-bold ring-1 ring-primary/30",
                      day_outside: "text-muted-foreground/40",
                      day_disabled: "text-muted-foreground/40",
                    }}
                    components={{
                      DayContent: ({ date }) => (
                        <div className="flex flex-col items-center">
                          <span className="text-sm">{date.getDate()}</span>
                          {renderDayContent(date)}
                        </div>
                      )
                    }}
                  />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 justify-center text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-muted-foreground">Collections</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span className="text-muted-foreground">S→S Transfers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-muted-foreground">Deliveries</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-muted-foreground">Reminders</span>
                  </div>
                </div>
              </div>

              {/* Right: Personal Reminders */}
              <Card className="border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StickyNote className="h-5 w-5 text-orange-600" />
                      <span>My Reminders</span>
                      {reminders.filter(r => !r.is_completed).length > 0 && (
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                          {reminders.filter(r => !r.is_completed).length}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/50"
                      onClick={() => {
                        setNewReminderDate(selectedDate);
                        setShowAddReminder(true);
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Add Reminder Form */}
                  {showAddReminder && (
                    <div className="p-3 bg-background rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Add reminder for {format(newReminderDate, 'MMM d')}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setShowAddReminder(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Reminder title..."
                        value={newReminderTitle}
                        onChange={(e) => setNewReminderTitle(e.target.value)}
                        className="h-10"
                      />
                      <Input
                        placeholder="Notes (optional)"
                        value={newReminderNotes}
                        onChange={(e) => setNewReminderNotes(e.target.value)}
                        className="h-10"
                      />
                      <Button 
                        className="w-full" 
                        size="sm"
                        onClick={handleAddReminder}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Reminder
                      </Button>
                    </div>
                  )}

                  {/* Selected Day Reminders */}
                  {selectedDayReminders.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {format(selectedDate, 'EEEE, MMM d')}
                      </p>
                      {selectedDayReminders.map(reminder => (
                        <div 
                          key={reminder.id}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg bg-background border transition-all",
                            reminder.is_completed && "opacity-60"
                          )}
                        >
                          <Checkbox
                            checked={reminder.is_completed}
                            onCheckedChange={() => handleToggleReminder(reminder)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "font-medium text-sm",
                              reminder.is_completed && "line-through"
                            )}>
                              {reminder.title}
                            </p>
                            {reminder.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {reminder.notes}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteReminder(reminder.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : !showAddReminder ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        No reminders for {format(selectedDate, 'MMM d')}
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="text-orange-600"
                        onClick={() => {
                          setNewReminderDate(selectedDate);
                          setShowAddReminder(true);
                        }}
                      >
                        Add one
                      </Button>
                    </div>
                  ) : null}

                  {/* Upcoming Reminders (if not on selected date) */}
                  {reminders.filter(r => !r.is_completed && r.reminder_date !== selectedDateKey).length > 0 && (
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">Upcoming this month</p>
                      {reminders
                        .filter(r => !r.is_completed && r.reminder_date !== selectedDateKey)
                        .slice(0, 3)
                        .map(reminder => (
                          <button
                            key={reminder.id}
                            onClick={() => setSelectedDate(new Date(reminder.reminder_date))}
                            className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-background/80 transition-colors"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            <span className="text-xs flex-1 truncate">{reminder.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(reminder.reminder_date), 'MMM d')}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Selected Day Routes */}
            <Card className="border-primary/20">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  Routes for {format(selectedDate, 'EEEE, MMMM d')}
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
                    <div className="space-y-3">
                      {selectedDaySteps.map((step, index) => {
                        const config = stepTypeConfig[step.step_type as keyof typeof stepTypeConfig] || stepTypeConfig.collect;
                        const StepIcon = config.icon;
                        const isCompleted = step.status === 'completed';
                        const isS2S = step.step_type === 'supplier_to_supplier';

                        // Parse FROM info from location_notes for S→S
                        let fromSupplier = '';
                        let fromAddress = '';
                        if (isS2S && step.location_notes) {
                          try {
                            const parsed = JSON.parse(step.location_notes);
                            fromSupplier = parsed.from_supplier_name || '';
                            fromAddress = parsed.from_supplier_address || '';
                          } catch {
                            fromSupplier = step.location_notes;
                          }
                        }

                        return (
                          <button
                            key={step.id}
                            onClick={() => onStepClick?.(step)}
                            className={cn(
                              "w-full text-left p-4 rounded-lg border-2 transition-all",
                              "hover:border-primary/50 hover:shadow-md",
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
                              <div className="flex-1 min-w-0 space-y-2">
                                {/* Header with status badges */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge 
                                    variant="outline" 
                                    className={cn("text-[10px] h-5 font-semibold", config.textColor)}
                                  >
                                    <StepIcon className="h-3 w-3 mr-1" />
                                    {config.label}
                                  </Badge>
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

                                {/* S→S Transfer: Show FROM → TO */}
                                {isS2S ? (
                                  <div className="space-y-1.5 p-2 bg-background/50 rounded border">
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-bold text-purple-600 bg-purple-100 dark:bg-purple-900 px-1.5 py-0.5 rounded">FROM</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm">{fromSupplier || 'Not specified'}</p>
                                        {fromAddress && (
                                          <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                            <span className="line-clamp-1">{fromAddress}</span>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-bold text-purple-600 bg-purple-100 dark:bg-purple-900 px-1.5 py-0.5 rounded">TO</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm">{step.supplier_name || 'Not specified'}</p>
                                        {step.location_address && (
                                          <p className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                            <span className="line-clamp-1">{step.location_address}</span>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Regular step: Supplier/Location name */}
                                    <p className="font-semibold text-sm">
                                      {step.step_type === 'deliver_to_client' 
                                        ? step.task_client || 'Client'
                                        : step.supplier_name || 'Unknown'}
                                    </p>
                                    {/* Address */}
                                    {(step.location_address || (step.step_type === 'deliver_to_client' && step.task_delivery_address)) && (
                                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                                        <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                                        <span className="line-clamp-2">
                                          {step.location_address || step.task_delivery_address}
                                        </span>
                                      </p>
                                    )}
                                  </>
                                )}

                                {/* Products */}
                                {step.products.length > 0 && (
                                  <div className="pt-1.5 border-t">
                                    <p className="text-[10px] font-medium text-muted-foreground mb-1">
                                      Products ({step.products.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {step.products.slice(0, 3).map((product, i) => (
                                        <Badge key={product.id} variant="secondary" className="text-[10px] h-5">
                                          {product.product_name}
                                          {product.quantity && ` ×${product.quantity}`}
                                          {product.unit && ` ${product.unit}`}
                                        </Badge>
                                      ))}
                                      {step.products.length > 3 && (
                                        <Badge variant="secondary" className="text-[10px] h-5">
                                          +{step.products.length - 3} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Task reference */}
                                <p className="text-[10px] text-muted-foreground pt-1 border-t truncate">
                                  📋 {step.task_title}
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
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                    <Package className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                      {Array.from(dayRoutes.values()).reduce((sum, d) => 
                        sum + d.collections.filter(c => c.step_type === 'collect').length, 0)}
                    </p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">Collect</p>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950">
                    <ArrowRightLeft className="h-4 w-4 mx-auto text-purple-600 mb-1" />
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                      {Array.from(dayRoutes.values()).reduce((sum, d) => 
                        sum + d.collections.filter(c => c.step_type === 'supplier_to_supplier').length, 0)}
                    </p>
                    <p className="text-[10px] text-purple-600 dark:text-purple-400">S→S</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950">
                    <Truck className="h-4 w-4 mx-auto text-green-600 mb-1" />
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      {Array.from(dayRoutes.values()).reduce((sum, d) => sum + d.deliveries.length, 0)}
                    </p>
                    <p className="text-[10px] text-green-600 dark:text-green-400">Deliver</p>
                  </div>
                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950">
                    <StickyNote className="h-4 w-4 mx-auto text-orange-600 mb-1" />
                    <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
                      {reminders.filter(r => !r.is_completed).length}
                    </p>
                    <p className="text-[10px] text-orange-600 dark:text-orange-400">Reminders</p>
                  </div>
                  <div className="p-2 rounded-lg bg-muted">
                    <CalendarDays className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-lg font-bold">
                      {dayRoutes.size}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Days</p>
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
