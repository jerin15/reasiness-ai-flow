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
  Loader2
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

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh
}: SimpleOperationsViewProps) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'at-supplier' | 'done'>('pending');

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
                         step.step_type === 'supplier_to_supplier' ? 'Transferred' : 'Completed';

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

  // Mark as "At Supplier" (sent for production)
  const handleMarkAtSupplier = async (step: WorkflowStep) => {
    setUpdatingStep(step.id);
    
    try {
      const nowIso = new Date().toISOString();
      
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ 
          status: 'in_progress',
          started_at: nowIso
        })
        .eq('id', step.id);

      if (error) throw error;

      toast.success(`📦 Sent to ${step.supplier_name || 'supplier'}`);
      fetchAllSteps();
      onRefresh?.();
    } catch (error: any) {
      console.error('Error updating step:', error);
      toast.error('Failed to update');
    } finally {
      setUpdatingStep(null);
    }
  };

  // Categorize steps
  const collections = steps.filter(s => 
    (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && 
    s.status === 'pending'
  );
  
  const atSupplier = steps.filter(s => 
    (s.step_type === 'collect' || s.step_type === 'deliver_to_supplier' || s.step_type === 'supplier_to_supplier') && 
    s.status === 'in_progress'
  );
  
  const deliveries = steps.filter(s => 
    s.step_type === 'deliver_to_client' && 
    (s.status === 'pending' || s.status === 'in_progress')
  );
  
  const completedToday = steps.filter(s => 
    s.status === 'completed'
  );

  // Pending items = collections + deliveries
  const pendingItems = [...collections, ...deliveries].sort((a, b) => {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  const getStepIcon = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return <Package className="h-5 w-5 text-blue-600" />;
      case 'deliver_to_client': return <Truck className="h-5 w-5 text-green-600" />;
      case 'supplier_to_supplier': return <ArrowRight className="h-5 w-5 text-purple-600" />;
      default: return <MapPin className="h-5 w-5 text-amber-600" />;
    }
  };

  const getActionLabel = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return 'Collected';
      case 'deliver_to_client': return 'Delivered';
      case 'supplier_to_supplier': return 'Transferred';
      default: return 'Done';
    }
  };

  const getStepLabel = (step: WorkflowStep) => {
    switch (step.step_type) {
      case 'collect': return 'Collect';
      case 'deliver_to_client': return 'Deliver';
      case 'supplier_to_supplier': return 'S→S Transfer';
      default: return 'To Supplier';
    }
  };

  const renderStepCard = (step: WorkflowStep, showSendToSupplier = false) => {
    const isUpdating = updatingStep === step.id;
    const dueDate = step.due_date ? new Date(step.due_date) : null;
    const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
    const isDueToday = dueDate && isToday(dueDate);
    const isUrgent = step.task_priority === 'urgent' || step.task_priority === 'high';

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
          "overflow-hidden transition-all",
          isUrgent && "border-orange-400 bg-orange-50/50 dark:bg-orange-950/20",
          isOverdue && "border-destructive bg-destructive/5"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
              step.status === 'completed' ? "bg-green-100" : 
              step.status === 'in_progress' ? "bg-blue-100" : "bg-muted"
            )}>
              {step.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                getStepIcon(step)
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {getStepLabel(step)}
                </Badge>
                {isUrgent && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {step.task_priority?.toUpperCase()}
                  </Badge>
                )}
                {dueDate && (
                  <span className={cn(
                    "text-xs",
                    isOverdue && "text-destructive font-semibold",
                    isDueToday && !isOverdue && "text-orange-600 font-medium"
                  )}>
                    {isOverdue ? '⚠️ Overdue' : isDueToday ? 'Today' : format(dueDate, 'MMM d')}
                  </span>
                )}
              </div>

              {/* Supplier/Location */}
              {step.step_type === 'supplier_to_supplier' ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {fromSupplier || 'Unknown'} → {toSupplier || step.supplier_name || 'Unknown'}
                  </p>
                </div>
              ) : (
                <p className="text-sm font-semibold line-clamp-1">
                  {step.supplier_name || step.location_address || 'No location'}
                </p>
              )}

              {/* Task Reference */}
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {step.task_client || step.task_title}
              </p>

              {/* Address */}
              {step.location_address && step.step_type !== 'supplier_to_supplier' && (
                <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{step.location_address}</span>
                </p>
              )}
            </div>

            {/* Action Button */}
            <div className="flex flex-col gap-2 shrink-0">
              {step.status === 'pending' && showSendToSupplier && step.step_type === 'deliver_to_supplier' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  disabled={isUpdating}
                  onClick={() => handleMarkAtSupplier(step)}
                >
                  {isUpdating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>At Supplier</>
                  )}
                </Button>
              )}
              
              {step.status !== 'completed' && (
                <Button
                  size="sm"
                  className="text-xs h-9 gap-1"
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
      {/* Header Stats */}
      <div className="px-4 py-3 bg-muted/30 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Badge variant="secondary" className="shrink-0 gap-1">
            <Package className="h-3 w-3" />
            {collections.length} to collect
          </Badge>
          <Badge variant="outline" className="shrink-0 gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3" />
            {atSupplier.length} at supplier
          </Badge>
          <Badge variant="outline" className="shrink-0 gap-1 bg-green-50 text-green-700 border-green-200">
            <Truck className="h-3 w-3" />
            {deliveries.length} to deliver
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchAllSteps}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start px-4 py-2 h-auto bg-background border-b rounded-none">
          <TabsTrigger value="pending" className="flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Pending ({pendingItems.length})
          </TabsTrigger>
          <TabsTrigger value="at-supplier" className="flex-1 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            At Supplier ({atSupplier.length})
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1 data-[state=active]:bg-green-600 data-[state=active]:text-white">
            Done ({completedToday.length})
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="pending" className="p-4 space-y-3 m-0">
            {pendingItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-3" />
                <p className="text-muted-foreground">All caught up!</p>
              </div>
            ) : (
              pendingItems.map(step => renderStepCard(step, true))
            )}
          </TabsContent>

          <TabsContent value="at-supplier" className="p-4 space-y-3 m-0">
            {atSupplier.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No items at supplier</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Items sent to suppliers for production will appear here
                </p>
              </div>
            ) : (
              atSupplier.map(step => renderStepCard(step))
            )}
          </TabsContent>

          <TabsContent value="done" className="p-4 space-y-3 m-0">
            {completedToday.length === 0 ? (
              <div className="text-center py-12">
                <Check className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No completed items</p>
              </div>
            ) : (
              completedToday.slice(0, 20).map(step => (
                <Card key={step.id} className="bg-green-50/50 dark:bg-green-950/10 border-green-200">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {step.supplier_name || step.location_address}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getStepLabel(step)} • {step.task_client || step.task_title}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                        ✓ {getActionLabel(step)}
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
