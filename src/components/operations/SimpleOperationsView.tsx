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
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Factory,
  ArrowRightLeft,
  History,
  Calendar,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, isPast, isTomorrow, startOfDay } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface StepProduct {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
}

interface WorkflowStep {
  id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  location_address: string | null;
  location_notes: string | null;
  due_date: string | null;
  completed_at: string | null;
  task_id: string;
  task_title?: string;
  task_client?: string | null;
  task_priority?: string;
  task_assigned_to?: string | null;
  products?: StepProduct[];
  // For S→S tracking
  fromSupplier?: string;
  toSupplier?: string;
  isCollectionPhase?: boolean; // true = need to collect, false = need to send to production
}

interface SimpleOperationsViewProps {
  userId: string;
  userName: string;
  isAdmin?: boolean;
  onRefresh?: () => void;
  operationsUsers?: Array<{ id: string; full_name: string | null; email: string }>;
}

type TabType = 'collect' | 'production' | 'deliver' | 'history';
type HistoryFilter = 'all' | 'at-production' | 'collections' | 'deliveries';

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh,
  operationsUsers = []
}: SimpleOperationsViewProps) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('collect');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');

  const fetchAllSteps = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all workflow steps with their task info
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_order, step_type, supplier_name, status,
          location_address, location_notes, due_date, task_id, completed_at,
          tasks!inner (
            id, title, client_name, priority, status, deleted_at, assigned_to
          )
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('step_order', { ascending: true });

      if (error) throw error;

      // Fetch products for all steps
      const stepIds = (stepsData || []).map((s: any) => s.id);
      let productsMap: Record<string, StepProduct[]> = {};
      
      if (stepIds.length > 0) {
        const { data: productsData } = await supabase
          .from('task_products')
          .select('id, workflow_step_id, product_name, quantity, unit')
          .in('workflow_step_id', stepIds);
        
        (productsData || []).forEach((p: any) => {
          if (p.workflow_step_id) {
            if (!productsMap[p.workflow_step_id]) {
              productsMap[p.workflow_step_id] = [];
            }
            productsMap[p.workflow_step_id].push({
              id: p.id,
              product_name: p.product_name,
              quantity: p.quantity,
              unit: p.unit
            });
          }
        });
      }

      const enrichedSteps = (stepsData || []).map((step: any) => {
        // Parse FROM/TO for S→S
        let fromSupplier = '';
        let toSupplier = '';
        if (step.step_type === 'supplier_to_supplier' && step.location_notes) {
          const lines = step.location_notes.split('\n');
          const fromLine = lines.find((l: string) => l.startsWith('FROM:'));
          const toLine = lines.find((l: string) => l.startsWith('TO:'));
          if (fromLine) fromSupplier = fromLine.replace('FROM:', '').split('(')[0].trim();
          if (toLine) toSupplier = toLine.replace('TO:', '').split('(')[0].trim();
        }

        return {
          ...step,
          task_title: step.tasks?.title,
          task_client: step.tasks?.client_name,
          task_priority: step.tasks?.priority,
          task_assigned_to: step.tasks?.assigned_to,
          products: productsMap[step.id] || [],
          fromSupplier,
          toSupplier
        };
      });

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

  // One-tap action handler
  const handleQuickComplete = async (step: WorkflowStep, actionType: string) => {
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

      toast.success(`✓ ${actionType}!`);
      fetchAllSteps();
      onRefresh?.();
    } catch (error: any) {
      console.error('Error completing step:', error);
      toast.error('Failed to update');
    } finally {
      setUpdatingStep(null);
    }
  };

  // Apply team filter if admin
  const filteredSteps = isAdmin && teamFilter !== 'all' 
    ? steps.filter(s => s.task_assigned_to === teamFilter)
    : steps;

  // ============ CATEGORIZE STEPS INTO 4 TABS ============

  // COLLECT TAB: Items to pick up
  // - collect type + pending
  // - S→S type + pending (collection phase)
  const collectItems = filteredSteps.filter(s => 
    (s.step_type === 'collect' && s.status === 'pending') ||
    (s.step_type === 'supplier_to_supplier' && s.status === 'pending')
  );

  // PRODUCTION TAB: Items to send to suppliers for fabrication
  // - deliver_to_supplier + pending
  // - S→S completed (now at production, waiting)
  const productionItems = filteredSteps.filter(s => 
    (s.step_type === 'deliver_to_supplier' && (s.status === 'pending' || s.status === 'in_progress')) ||
    (s.step_type === 'supplier_to_supplier' && s.status === 'completed')
  );

  // DELIVER TAB: Items ready to deliver to clients
  // - deliver_to_client + pending/in_progress
  const deliverItems = filteredSteps.filter(s => 
    s.step_type === 'deliver_to_client' && 
    (s.status === 'pending' || s.status === 'in_progress')
  );

  // HISTORY TAB: All completed items with filters
  const historyItems = filteredSteps.filter(s => {
    if (historyFilter === 'all') {
      return s.status === 'completed';
    } else if (historyFilter === 'at-production') {
      return s.step_type === 'supplier_to_supplier' && s.status === 'completed';
    } else if (historyFilter === 'collections') {
      return (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && s.status === 'completed';
    } else if (historyFilter === 'deliveries') {
      return s.step_type === 'deliver_to_client' && s.status === 'completed';
    }
    return false;
  });

  // Today summary
  const today = startOfDay(new Date());
  const todayCollections = collectItems.filter(s => s.due_date && isToday(new Date(s.due_date))).length;
  const todayProduction = productionItems.filter(s => 
    s.step_type === 'deliver_to_supplier' && s.due_date && isToday(new Date(s.due_date))
  ).length;
  const todayDeliveries = deliverItems.filter(s => s.due_date && isToday(new Date(s.due_date))).length;

  // ============ RENDER FUNCTIONS ============

  const getDueDateBadge = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const isOverdue = isPast(date) && !isToday(date);
    const isDueToday = isToday(date);
    const isDueTomorrow = isTomorrow(date);

    if (isOverdue) {
      return <Badge variant="destructive" className="text-xs">⚠️ OVERDUE</Badge>;
    } else if (isDueToday) {
      return <Badge className="text-xs bg-orange-500 text-white">📅 Today</Badge>;
    } else if (isDueTomorrow) {
      return <Badge className="text-xs bg-blue-500 text-white">📅 Tomorrow</Badge>;
    }
    return <Badge variant="outline" className="text-xs">📅 {format(date, 'MMM d')}</Badge>;
  };

  const renderCollectCard = (step: WorkflowStep) => {
    const isUpdating = updatingStep === step.id;
    const isUrgent = step.task_priority === 'urgent' || step.task_priority === 'high';
    const isStoS = step.step_type === 'supplier_to_supplier';

    return (
      <Card 
        key={step.id}
        className={cn(
          "overflow-hidden border-l-4 border-l-blue-500",
          "bg-blue-50/50 dark:bg-blue-950/20"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <Package className="h-6 w-6 text-blue-600" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-blue-600 text-white text-xs font-bold">
                  📥 COLLECT
                </Badge>
                {isUrgent && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {step.task_priority?.toUpperCase()}
                  </Badge>
                )}
                {getDueDateBadge(step.due_date)}
              </div>

              {/* Supplier/Location */}
              <p className="text-base font-bold text-foreground">
                {isStoS ? step.fromSupplier || step.supplier_name : step.supplier_name || step.location_address}
              </p>

              {/* Client */}
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {step.task_client || step.task_title}
              </p>

              {/* Products */}
              {step.products && step.products.length > 0 && (
                <div className="bg-white/80 dark:bg-background/50 rounded-lg p-2 border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    Products:
                  </p>
                  <div className="space-y-1">
                    {step.products.slice(0, 4).map((product, idx) => (
                      <div key={product.id || idx} className="text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span className="font-medium">{product.product_name}</span>
                        {product.quantity && (
                          <span className="text-muted-foreground">
                            ({product.quantity} {product.unit || 'pcs'})
                          </span>
                        )}
                      </div>
                    ))}
                    {step.products.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{step.products.length - 4} more items</p>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              {step.location_address && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{step.location_address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Action Button - Full Width */}
          <Button
            className="w-full mt-4 h-12 text-base font-bold bg-blue-600 hover:bg-blue-700"
            disabled={isUpdating}
            onClick={() => handleQuickComplete(step, 'Collected')}
          >
            {isUpdating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5 mr-2" />
                COLLECTED
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderProductionCard = (step: WorkflowStep) => {
    const isUpdating = updatingStep === step.id;
    const isUrgent = step.task_priority === 'urgent' || step.task_priority === 'high';
    const isStoSCompleted = step.step_type === 'supplier_to_supplier' && step.status === 'completed';
    const isDeliverToSupplier = step.step_type === 'deliver_to_supplier';

    return (
      <Card 
        key={step.id}
        className={cn(
          "overflow-hidden border-l-4",
          isStoSCompleted ? "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
              isStoSCompleted ? "bg-purple-100 dark:bg-purple-900/50" : "bg-amber-100 dark:bg-amber-900/50"
            )}>
              <Factory className={cn("h-6 w-6", isStoSCompleted ? "text-purple-600" : "text-amber-600")} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                {isStoSCompleted ? (
                  <Badge className="bg-purple-600 text-white text-xs font-bold">
                    🏭 AT PRODUCTION
                  </Badge>
                ) : (
                  <Badge className="bg-amber-600 text-white text-xs font-bold">
                    🏭 SEND TO PRODUCTION
                  </Badge>
                )}
                {isUrgent && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {step.task_priority?.toUpperCase()}
                  </Badge>
                )}
                {!isStoSCompleted && getDueDateBadge(step.due_date)}
              </div>

              {/* Supplier */}
              <p className="text-base font-bold text-foreground">
                {isStoSCompleted ? step.toSupplier || step.supplier_name : step.supplier_name}
              </p>

              {/* For S→S completed, show transfer info */}
              {isStoSCompleted && (
                <p className="text-sm text-purple-600 flex items-center gap-1">
                  <ArrowRightLeft className="h-4 w-4" />
                  Transferred from {step.fromSupplier}
                </p>
              )}

              {/* Client */}
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {step.task_client || step.task_title}
              </p>

              {/* Products */}
              {step.products && step.products.length > 0 && (
                <div className="bg-white/80 dark:bg-background/50 rounded-lg p-2 border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    Products:
                  </p>
                  <div className="space-y-1">
                    {step.products.slice(0, 4).map((product, idx) => (
                      <div key={product.id || idx} className="text-sm flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          isStoSCompleted ? "bg-purple-500" : "bg-amber-500"
                        )} />
                        <span className="font-medium">{product.product_name}</span>
                        {product.quantity && (
                          <span className="text-muted-foreground">
                            ({product.quantity} {product.unit || 'pcs'})
                          </span>
                        )}
                      </div>
                    ))}
                    {step.products.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{step.products.length - 4} more items</p>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              {step.location_address && !isStoSCompleted && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{step.location_address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Action Button - Only for pending items, not for "at production" tracking */}
          {!isStoSCompleted && (
            <Button
              className="w-full mt-4 h-12 text-base font-bold bg-amber-600 hover:bg-amber-700"
              disabled={isUpdating}
              onClick={() => handleQuickComplete(step, 'Sent to Production')}
            >
              {isUpdating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  SENT TO PRODUCTION
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderDeliverCard = (step: WorkflowStep) => {
    const isUpdating = updatingStep === step.id;
    const isUrgent = step.task_priority === 'urgent' || step.task_priority === 'high';

    return (
      <Card 
        key={step.id}
        className="overflow-hidden border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center shrink-0">
              <Truck className="h-6 w-6 text-green-600" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-green-600 text-white text-xs font-bold">
                  🚚 DELIVER
                </Badge>
                {isUrgent && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-0.5" />
                    {step.task_priority?.toUpperCase()}
                  </Badge>
                )}
                {getDueDateBadge(step.due_date)}
              </div>

              {/* Client */}
              <p className="text-base font-bold text-foreground">
                {step.task_client || step.task_title}
              </p>

              {/* Products */}
              {step.products && step.products.length > 0 && (
                <div className="bg-white/80 dark:bg-background/50 rounded-lg p-2 border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    Products:
                  </p>
                  <div className="space-y-1">
                    {step.products.slice(0, 4).map((product, idx) => (
                      <div key={product.id || idx} className="text-sm flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="font-medium">{product.product_name}</span>
                        {product.quantity && (
                          <span className="text-muted-foreground">
                            ({product.quantity} {product.unit || 'pcs'})
                          </span>
                        )}
                      </div>
                    ))}
                    {step.products.length > 4 && (
                      <p className="text-xs text-muted-foreground">+{step.products.length - 4} more items</p>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              {step.location_address && (
                <p className="text-xs text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{step.location_address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Action Button */}
          <Button
            className="w-full mt-4 h-12 text-base font-bold bg-green-600 hover:bg-green-700"
            disabled={isUpdating}
            onClick={() => handleQuickComplete(step, 'Delivered')}
          >
            {isUpdating ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Check className="h-5 w-5 mr-2" />
                DELIVERED
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderHistoryCard = (step: WorkflowStep) => {
    const getTypeColor = () => {
      switch (step.step_type) {
        case 'collect': return 'border-l-blue-500 bg-blue-50/30';
        case 'deliver_to_client': return 'border-l-green-500 bg-green-50/30';
        case 'supplier_to_supplier': return 'border-l-purple-500 bg-purple-50/30';
        case 'deliver_to_supplier': return 'border-l-amber-500 bg-amber-50/30';
        default: return 'border-l-gray-500';
      }
    };

    const getTypeLabel = () => {
      switch (step.step_type) {
        case 'collect': return '📥 Collected';
        case 'deliver_to_client': return '🚚 Delivered';
        case 'supplier_to_supplier': return '🏭 At Production';
        case 'deliver_to_supplier': return '📦 To Supplier';
        default: return '✓ Completed';
      }
    };

    return (
      <Card key={step.id} className={cn("border-l-4", getTypeColor())}>
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="secondary" className="text-xs">
                  {getTypeLabel()}
                </Badge>
                {step.completed_at && (
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(step.completed_at), 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium line-clamp-1">
                {step.step_type === 'supplier_to_supplier' 
                  ? `${step.fromSupplier} → ${step.toSupplier}`
                  : step.supplier_name || step.location_address
                }
              </p>
              <p className="text-xs text-muted-foreground">
                {step.task_client || step.task_title}
              </p>
              {/* Products summary */}
              {step.products && step.products.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  📦 {step.products.length} product{step.products.length > 1 ? 's' : ''}
                </p>
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
      {/* Today Summary */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            TODAY: {format(new Date(), 'EEE, MMM d')}
          </h2>
          <Button variant="ghost" size="icon" onClick={fetchAllSteps}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-blue-100 dark:bg-blue-950/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{collectItems.length}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400">📥 Collect</p>
          </div>
          <div className="bg-amber-100 dark:bg-amber-950/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{productionItems.filter(s => s.step_type === 'deliver_to_supplier').length}</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400">🏭 Production</p>
          </div>
          <div className="bg-green-100 dark:bg-green-950/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-green-700 dark:text-green-300">{deliverItems.length}</p>
            <p className="text-[10px] text-green-600 dark:text-green-400">🚚 Deliver</p>
          </div>
          <div className="bg-purple-100 dark:bg-purple-950/50 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{productionItems.filter(s => s.step_type === 'supplier_to_supplier').length}</p>
            <p className="text-[10px] text-purple-600 dark:text-purple-400">🔄 At Prod</p>
          </div>
        </div>
      </div>

      {/* Admin Team Filter */}
      {isAdmin && operationsUsers.length > 0 && (
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team</SelectItem>
              {operationsUsers.map(user => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {teamFilter === 'all' ? 'Viewing all tasks' : 'Filtered by team member'}
          </span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start px-2 py-2 h-auto bg-background border-b rounded-none gap-1">
          <TabsTrigger 
            value="collect" 
            className="flex-1 text-xs px-2 py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            📥 Collect ({collectItems.length})
          </TabsTrigger>
          <TabsTrigger 
            value="production" 
            className="flex-1 text-xs px-2 py-2 data-[state=active]:bg-amber-600 data-[state=active]:text-white"
          >
            🏭 Prod ({productionItems.length})
          </TabsTrigger>
          <TabsTrigger 
            value="deliver" 
            className="flex-1 text-xs px-2 py-2 data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            🚚 Deliver ({deliverItems.length})
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="flex-1 text-xs px-2 py-2 data-[state=active]:bg-gray-600 data-[state=active]:text-white"
          >
            📋 History
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* COLLECT TAB */}
          <TabsContent value="collect" className="p-4 space-y-4 m-0">
            {collectItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No collections pending</p>
                <p className="text-xs text-muted-foreground mt-1">All items have been collected</p>
              </div>
            ) : (
              collectItems.map(step => renderCollectCard(step))
            )}
          </TabsContent>

          {/* PRODUCTION TAB */}
          <TabsContent value="production" className="p-4 space-y-4 m-0">
            {productionItems.length === 0 ? (
              <div className="text-center py-12">
                <Factory className="h-12 w-12 text-amber-500/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No production items</p>
                <p className="text-xs text-muted-foreground mt-1">Nothing to send or track</p>
              </div>
            ) : (
              <>
                {/* Items to send */}
                {productionItems.filter(s => s.step_type === 'deliver_to_supplier').length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">
                      To Send for Production
                    </p>
                    {productionItems.filter(s => s.step_type === 'deliver_to_supplier').map(step => renderProductionCard(step))}
                  </div>
                )}
                
                {/* Items at production (S→S completed) */}
                {productionItems.filter(s => s.step_type === 'supplier_to_supplier').length > 0 && (
                  <div className="space-y-3 mt-6">
                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">
                      Currently at Production
                    </p>
                    {productionItems.filter(s => s.step_type === 'supplier_to_supplier').map(step => renderProductionCard(step))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* DELIVER TAB */}
          <TabsContent value="deliver" className="p-4 space-y-4 m-0">
            {deliverItems.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="h-12 w-12 text-green-500/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No deliveries pending</p>
                <p className="text-xs text-muted-foreground mt-1">All items have been delivered</p>
              </div>
            ) : (
              deliverItems.map(step => renderDeliverCard(step))
            )}
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="p-4 space-y-4 m-0">
            {/* Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={historyFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setHistoryFilter('all')}
              >
                All
              </Button>
              <Button
                variant={historyFilter === 'at-production' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setHistoryFilter('at-production')}
              >
                🏭 At Production
              </Button>
              <Button
                variant={historyFilter === 'collections' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setHistoryFilter('collections')}
              >
                📥 Collections
              </Button>
              <Button
                variant={historyFilter === 'deliveries' ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setHistoryFilter('deliveries')}
              >
                🚚 Deliveries
              </Button>
            </div>

            {historyItems.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No history yet</p>
                <p className="text-xs text-muted-foreground mt-1">Completed actions will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {historyItems.slice(0, 50).map(step => renderHistoryCard(step))}
                {historyItems.length > 50 && (
                  <p className="text-center text-xs text-muted-foreground py-2">
                    Showing 50 of {historyItems.length} items
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
