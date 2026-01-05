import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  Truck, 
  MapPin, 
  Check, 
  Clock,
  User,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Factory,
  ArrowRightLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, isPast } from 'date-fns';

interface WorkflowStep {
  id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  location_address: string | null;
  location_notes: string | null;
  due_date: string | null;
  task_id: string;
  task_title?: string;
  task_client?: string | null;
  task_priority?: string;
}

interface SimpleOperationsViewProps {
  userId: string;
  userName: string;
  isAdmin?: boolean;
  onRefresh?: () => void;
}

// Color configurations for each step type
const stepTypeColors = {
  collect: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-300',
    icon: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700 border-blue-300',
    iconBg: 'bg-blue-100'
  },
  deliver_to_client: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-300',
    icon: 'text-green-600',
    badge: 'bg-green-100 text-green-700 border-green-300',
    iconBg: 'bg-green-100'
  },
  deliver_to_supplier: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    iconBg: 'bg-amber-100'
  },
  supplier_to_supplier: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-300',
    icon: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-700 border-purple-300',
    iconBg: 'bg-purple-100'
  }
};

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh
}: SimpleOperationsViewProps) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'at-production' | 'done'>('pending');

  const fetchAllSteps = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all workflow steps with their task info
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_order, step_type, supplier_name, status,
          location_address, location_notes, due_date, task_id,
          tasks!inner (
            id, title, client_name, priority, status, deleted_at
          )
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('step_order', { ascending: true });

      if (error) throw error;

      const enrichedSteps = (stepsData || []).map((step: any) => ({
        ...step,
        task_title: step.tasks?.title,
        task_client: step.tasks?.client_name,
        task_priority: step.tasks?.priority
      }));

      setSteps(enrichedSteps);
    } catch (error) {
      console.error('Error fetching steps:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllSteps();
  }, [fetchAllSteps]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('simple-ops-steps')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_workflow_steps'
      }, () => fetchAllSteps())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAllSteps]);

  // One-tap action: Mark as Collected/Delivered/Done
  const handleQuickComplete = async (step: WorkflowStep) => {
    setUpdatingStep(step.id);
    
    try {
      const nowIso = new Date().toISOString();
      
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ 
          status: 'completed',
          completed_at: nowIso,
          completed_by: userId
        })
        .eq('id', step.id);

      if (error) throw error;

      // Get action label
      const actionLabel = step.step_type === 'collect' ? 'Collected' : 
                         step.step_type === 'deliver_to_client' ? 'Delivered' : 
                         step.step_type === 'supplier_to_supplier' ? 'Sent to Production' : 'Completed';

      toast.success(`✓ ${actionLabel}!`);
      fetchAllSteps();
      onRefresh?.();
    } catch (error: any) {
      console.error('Error completing step:', error);
      toast.error('Failed to update');
    } finally {
      setUpdatingStep(null);
    }
  };

  // Categorize steps
  // Pending: Collections (collect + S→S pending)
  const pendingCollections = steps.filter(s => 
    (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && 
    s.status === 'pending'
  );
  
  // Pending: Deliveries to client
  const pendingDeliveries = steps.filter(s => 
    s.step_type === 'deliver_to_client' && 
    (s.status === 'pending' || s.status === 'in_progress')
  );

  // At Production: S→S completed (sent from one supplier to another for production)
  // OR deliver_to_supplier in_progress/completed
  // OR collect in_progress (items picked up, being processed)
  const atProduction = steps.filter(s => 
    (s.step_type === 'supplier_to_supplier' && s.status === 'completed') ||
    (s.step_type === 'deliver_to_supplier' && (s.status === 'in_progress' || s.status === 'completed')) ||
    (s.step_type === 'collect' && s.status === 'in_progress')
  );
  
  // Completed deliveries to client
  const completedDeliveries = steps.filter(s => 
    s.step_type === 'deliver_to_client' && s.status === 'completed'
  );

  // All pending items sorted by due date
  const allPending = [...pendingCollections, ...pendingDeliveries].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const getStepIcon = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return <Package className={cn("h-5 w-5", stepTypeColors.collect.icon)} />;
      case 'deliver_to_client': return <Truck className={cn("h-5 w-5", stepTypeColors.deliver_to_client.icon)} />;
      case 'supplier_to_supplier': return <ArrowRightLeft className={cn("h-5 w-5", stepTypeColors.supplier_to_supplier.icon)} />;
      default: return <MapPin className={cn("h-5 w-5", stepTypeColors.deliver_to_supplier.icon)} />;
    }
  };

  const getActionLabel = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return 'Collected';
      case 'deliver_to_client': return 'Delivered';
      case 'supplier_to_supplier': return 'Sent to Production';
      default: return 'Done';
    }
  };

  const getStepLabel = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return '📦 COLLECT';
      case 'deliver_to_client': return '🚚 DELIVER';
      case 'supplier_to_supplier': return '🔄 S→S TRANSFER';
      default: return '📍 TO SUPPLIER';
    }
  };

  const renderStepCard = (step: WorkflowStep, showProductionStatus = false) => {
    const isUpdating = updatingStep === step.id;
    const dueDate = step.due_date ? new Date(step.due_date) : null;
    const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
    const isDueToday = dueDate && isToday(dueDate);
    const isUrgent = step.task_priority === 'urgent' || step.task_priority === 'high';
    const colors = stepTypeColors[step.step_type];

    // Parse FROM/TO for S→S
    let fromSupplier = '';
    let toSupplier = '';
    if (step.step_type === 'supplier_to_supplier' && step.location_notes) {
      const lines = step.location_notes.split('\n');
      const fromLine = lines.find(l => l.startsWith('FROM:'));
      const toLine = lines.find(l => l.startsWith('TO:'));
      if (fromLine) fromSupplier = fromLine.replace('FROM:', '').split('(')[0].trim();
      if (toLine) toSupplier = toLine.replace('TO:', '').split('(')[0].trim();
    }

    return (
      <Card 
        key={step.id}
        className={cn(
          "overflow-hidden transition-all border-l-4",
          colors.bg,
          step.step_type === 'collect' && "border-l-blue-500",
          step.step_type === 'deliver_to_client' && "border-l-green-500",
          step.step_type === 'supplier_to_supplier' && "border-l-purple-500",
          step.step_type === 'deliver_to_supplier' && "border-l-amber-500",
          isOverdue && "border-l-destructive bg-destructive/5"
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {/* Icon with type-specific background */}
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              step.status === 'completed' ? "bg-green-100" : colors.iconBg
            )}>
              {step.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : showProductionStatus ? (
                <Factory className="h-5 w-5 text-purple-600" />
              ) : (
                getStepIcon(step)
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header with type badge */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge 
                  variant="outline" 
                  className={cn("text-xs font-bold", colors.badge)}
                >
                  {getStepLabel(step)}
                </Badge>
                {isUrgent && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {step.task_priority?.toUpperCase()}
                  </Badge>
                )}
                {showProductionStatus && step.step_type === 'supplier_to_supplier' && (
                  <Badge className="text-xs bg-purple-600 text-white">
                    <Factory className="h-3 w-3 mr-0.5" />
                    AT PRODUCTION
                  </Badge>
                )}
              </div>

              {/* Due date if applicable */}
              {dueDate && !showProductionStatus && (
                <div className={cn(
                  "text-xs mb-1 font-medium",
                  isOverdue && "text-destructive",
                  isDueToday && !isOverdue && "text-orange-600"
                )}>
                  {isOverdue ? '⚠️ OVERDUE' : isDueToday ? '📅 Due Today' : `📅 ${format(dueDate, 'MMM d')}`}
                </div>
              )}

              {/* Supplier/Location - Type specific display */}
              {step.step_type === 'supplier_to_supplier' ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold flex items-center gap-1">
                    <span className="text-blue-600">{fromSupplier || 'Supplier'}</span>
                    <ArrowRight className="h-4 w-4 text-purple-500" />
                    <span className="text-purple-600">{toSupplier || step.supplier_name || 'Production'}</span>
                  </p>
                  {showProductionStatus && (
                    <p className="text-xs text-purple-600 font-medium">
                      🏭 Item is at {toSupplier || step.supplier_name} for production
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-bold line-clamp-1">
                  {step.supplier_name || step.location_address || 'No location'}
                </p>
              )}

              {/* Task Reference */}
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {step.task_client || step.task_title}
              </p>

              {/* Address for non-S→S */}
              {step.location_address && step.step_type !== 'supplier_to_supplier' && (
                <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{step.location_address}</span>
                </p>
              )}
            </div>

            {/* Action Button - only for non-completed */}
            {step.status !== 'completed' && !showProductionStatus && (
              <Button
                size="sm"
                className={cn(
                  "text-xs h-9 gap-1 shrink-0",
                  step.step_type === 'collect' && "bg-blue-600 hover:bg-blue-700",
                  step.step_type === 'deliver_to_client' && "bg-green-600 hover:bg-green-700",
                  step.step_type === 'supplier_to_supplier' && "bg-purple-600 hover:bg-purple-700",
                  step.step_type === 'deliver_to_supplier' && "bg-amber-600 hover:bg-amber-700"
                )}
                disabled={isUpdating}
                onClick={() => handleQuickComplete(step)}
              >
                {isUpdating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Check className="h-3 w-3" />
                    {getActionLabel(step)}
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header Stats with color-coded badges */}
      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Badge className="shrink-0 gap-1 bg-blue-600 text-white">
            <Package className="h-3 w-3" />
            {pendingCollections.length}
          </Badge>
          <Badge className="shrink-0 gap-1 bg-purple-600 text-white">
            <Factory className="h-3 w-3" />
            {atProduction.length}
          </Badge>
          <Badge className="shrink-0 gap-1 bg-green-600 text-white">
            <Truck className="h-3 w-3" />
            {pendingDeliveries.length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchAllSteps}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-muted/20 border-b flex flex-wrap gap-2 text-xs">
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Collect</span>
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>S→S Transfer</span>
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Deliver</span>
        </span>
        <span className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span>To Supplier</span>
        </span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start px-4 py-2 h-auto bg-background border-b rounded-none">
          <TabsTrigger 
            value="pending" 
            className="flex-1 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            📦 To Do ({allPending.length})
          </TabsTrigger>
          <TabsTrigger 
            value="at-production" 
            className="flex-1 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
          >
            🏭 At Production ({atProduction.length})
          </TabsTrigger>
          <TabsTrigger 
            value="done" 
            className="flex-1 data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            ✓ Done ({completedDeliveries.length})
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="pending" className="p-4 space-y-3 m-0">
            {allPending.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No pending collections or deliveries</p>
              </div>
            ) : (
              allPending.map(step => renderStepCard(step))
            )}
          </TabsContent>

          <TabsContent value="at-production" className="p-4 space-y-3 m-0">
            {atProduction.length === 0 ? (
              <div className="text-center py-12">
                <Factory className="h-12 w-12 text-purple-500/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No items at production</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Items sent via S→S transfer will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="text-xs text-purple-600 font-medium mb-2 flex items-center gap-1">
                  <Factory className="h-4 w-4" />
                  Items currently at supplier for production
                </div>
                {atProduction.map(step => renderStepCard(step, true))}
              </>
            )}
          </TabsContent>

          <TabsContent value="done" className="p-4 space-y-3 m-0">
            {completedDeliveries.length === 0 ? (
              <div className="text-center py-12">
                <Check className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No completed deliveries</p>
              </div>
            ) : (
              completedDeliveries.slice(0, 20).map(step => (
                <Card key={step.id} className="bg-green-50/50 dark:bg-green-950/10 border-l-4 border-l-green-500">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {step.supplier_name || step.location_address}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {step.task_client || step.task_title}
                        </p>
                      </div>
                      <Badge className="text-xs bg-green-600 text-white">
                        ✓ Delivered
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
