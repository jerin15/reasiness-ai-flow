import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Package, 
  Truck, 
  MapPin, 
  Check, 
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Factory,
  History,
  Calendar,
  Filter,
  Clock,
  Navigation,
  ChevronRight,
  X,
  Map,
  ArrowRight,
  User,
  Box,
  Trash2
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isToday, isPast, isTomorrow } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OperationsRouteMap } from './OperationsRouteMap';
import { SwipeConfirmDialog } from './SwipeConfirmDialog';

interface CollectionItem {
  stepId: string;
  taskId: string;
  taskTitle: string;
  clientName: string | null;
  supplierName: string;
  address: string | null;
  dueDate: string | null;
  priority: string;
  products: { name: string; qty: number | null; unit: string | null; supplier: string | null }[];
  stepType: string;
  area: string;
}

interface DeliveryItem {
  stepId: string;
  taskId: string;
  taskTitle: string;
  clientName: string | null;
  address: string | null;
  dueDate: string | null;
  priority: string;
  products: { name: string; qty: number | null; unit: string | null }[];
  area: string;
  instructions: string | null;
}

interface ProductionItem {
  stepId: string;
  taskId: string;
  taskTitle: string;
  clientName: string | null;
  supplierName: string;
  dueDate: string | null;
  priority: string;
  products: { name: string; qty: number | null; unit: string | null }[];
  isAtProduction: boolean;
  stepType: string;
  address?: string | null;
}

interface SimpleOperationsViewProps {
  userId: string;
  userName: string;
  isAdmin?: boolean;
  onRefresh?: () => void;
  operationsUsers?: Array<{ id: string; full_name: string | null; email: string }>;
}

type TabType = 'collect' | 'production' | 'deliver' | 'done';
type ViewMode = 'list' | 'map';

// Extract area from address
const extractArea = (address: string | null): string => {
  if (!address) return 'Other';
  const lower = address.toLowerCase();
  const areas = ['deira', 'bur dubai', 'satwa', 'karama', 'jumeirah', 'marina', 'downtown', 'business bay', 'al quoz', 'jebel ali', 'sharjah', 'ajman', 'abu dhabi'];
  for (const area of areas) {
    if (lower.includes(area)) return area.charAt(0).toUpperCase() + area.slice(1);
  }
  return 'Other';
};

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh,
  operationsUsers = []
}: SimpleOperationsViewProps) => {
  const [collectItems, setCollectItems] = useState<CollectionItem[]>([]);
  const [deliverItems, setDeliverItems] = useState<DeliveryItem[]>([]);
  const [productionItems, setProductionItems] = useState<ProductionItem[]>([]);
  const [completedItems, setCompletedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingStep, setCompletingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('collect');
  const [todayOnly, setTodayOnly] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  
  // Swipe state
  const [swipingItem, setSwipingItem] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const touchStartX = useRef(0);
  
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    stepId: string;
    label: string;
    type: 'collect' | 'deliver' | 'production';
    taskTitle: string;
    supplierName?: string;
    clientName?: string;
    products: { name: string; qty: number | null; unit: string | null }[];
  } | null>(null);

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch workflow steps with task info
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_type, supplier_name, status, location_address, due_date, task_id, completed_at,
          tasks!inner (id, title, client_name, priority, due_date, delivery_address, delivery_instructions, assigned_to, deleted_at, status)
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Fetch products
      const taskIds = [...new Set((stepsData || []).map((s: any) => s.task_id))];
      let productsMap: Record<string, { name: string; qty: number | null; unit: string | null; supplier: string | null }[]> = {};
      
      if (taskIds.length > 0) {
        const { data: productsData } = await supabase
          .from('task_products')
          .select('task_id, product_name, quantity, unit, supplier_name')
          .in('task_id', taskIds);
        
        (productsData || []).forEach((p: any) => {
          if (!productsMap[p.task_id]) productsMap[p.task_id] = [];
          productsMap[p.task_id].push({ 
            name: p.product_name, 
            qty: p.quantity, 
            unit: p.unit,
            supplier: p.supplier_name 
          });
        });
      }

      // Build flat lists
      const collections: CollectionItem[] = [];
      const deliveries: DeliveryItem[] = [];
      const productions: ProductionItem[] = [];
      const completed: any[] = [];

      (stepsData || []).forEach((step: any) => {
        const task = step.tasks;
        if (!task) return;

        // Apply team filter
        if (isAdmin && teamFilter !== 'all' && task.assigned_to !== teamFilter) return;

        const taskProducts = productsMap[step.task_id] || [];
        const stepProducts = taskProducts.map(p => ({ name: p.name, qty: p.qty, unit: p.unit, supplier: p.supplier }));

        if (step.status === 'completed') {
          completed.push({
            stepId: step.id,
            taskId: step.task_id,
            taskTitle: task.title,
            supplierName: step.supplier_name,
            stepType: step.step_type,
            completedAt: step.completed_at
          });
          
          // Also track S→S completed as "at production"
          if (step.step_type === 'supplier_to_supplier') {
            productions.push({
              stepId: step.id,
              taskId: step.task_id,
              taskTitle: task.title,
              clientName: task.client_name,
              supplierName: step.supplier_name || 'Unknown',
              dueDate: task.due_date,
              priority: task.priority,
              products: stepProducts,
              isAtProduction: true,
              stepType: step.step_type,
              address: step.location_address
            });
          }
        } else if (step.status === 'pending') {
          // Apply today filter
          if (todayOnly && task.due_date && !isToday(new Date(task.due_date)) && !isPast(new Date(task.due_date))) {
            return;
          }

          if (step.step_type === 'collect' || step.step_type === 'supplier_to_supplier') {
            collections.push({
              stepId: step.id,
              taskId: step.task_id,
              taskTitle: task.title,
              clientName: task.client_name,
              supplierName: step.supplier_name || 'Unknown Supplier',
              address: step.location_address,
              dueDate: task.due_date,
              priority: task.priority,
              products: stepProducts,
              stepType: step.step_type,
              area: extractArea(step.location_address)
            });
          } else if (step.step_type === 'deliver_to_client') {
            deliveries.push({
              stepId: step.id,
              taskId: step.task_id,
              taskTitle: task.title,
              clientName: task.client_name,
              address: task.delivery_address,
              dueDate: task.due_date,
              priority: task.priority,
              products: stepProducts,
              area: extractArea(task.delivery_address),
              instructions: task.delivery_instructions
            });
          } else if (step.step_type === 'deliver_to_supplier') {
            productions.push({
              stepId: step.id,
              taskId: step.task_id,
              taskTitle: task.title,
              clientName: task.client_name,
              supplierName: step.supplier_name || 'Unknown',
              dueDate: task.due_date,
              priority: task.priority,
              products: stepProducts,
              isAtProduction: false,
              stepType: step.step_type,
              address: step.location_address
            });
          }
        }
      });

      // Sort by priority (urgent first) then by due date
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sortFn = (a: any, b: any) => {
        const pA = priorityOrder[a.priority] ?? 2;
        const pB = priorityOrder[b.priority] ?? 2;
        if (pA !== pB) return pA - pB;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      };

      setCollectItems(collections.sort(sortFn));
      setDeliverItems(deliveries.sort(sortFn));
      setProductionItems(productions);
      setCompletedItems(completed.slice(-20));
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [todayOnly, teamFilter, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.token) {
          setMapboxToken(data.token);
        }
      } catch (error) {
        console.error('Error fetching mapbox token:', error);
      }
    };
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('ops-realtime-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_workflow_steps' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleComplete = async (stepId: string, label: string) => {
    setCompletingStep(stepId);
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: userId })
        .eq('id', stepId);
      if (error) throw error;
      toast.success(`✓ ${label}`);
      fetchData();
      onRefresh?.();
    } catch (e) {
      toast.error('Failed');
    } finally {
      setCompletingStep(null);
      setSwipingItem(null);
      setSwipeOffset(0);
    }
  };

  const openMaps = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipingItem(itemId);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipingItem) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff > 0) setSwipeOffset(Math.min(diff, 120));
  };

  const handleTouchEnd = (
    item: { 
      stepId: string; 
      supplierName?: string; 
      clientName?: string; 
      taskTitle: string;
      products: { name: string; qty: number | null; unit: string | null }[] 
    }, 
    type: 'collect' | 'deliver' | 'production'
  ) => {
    if (swipeOffset > 80) {
      const label = type === 'collect' ? `Collected from ${item.supplierName}` : 
                    type === 'deliver' ? 'Delivered to client' : 'Sent to Production';
      
      // Show confirmation dialog instead of completing immediately
      setConfirmDialog({
        open: true,
        stepId: item.stepId,
        label,
        type,
        taskTitle: item.taskTitle,
        supplierName: item.supplierName,
        clientName: item.clientName,
        products: item.products
      });
    }
    setSwipingItem(null);
    setSwipeOffset(0);
  };

  const handleConfirmComplete = async () => {
    if (!confirmDialog) return;
    await handleComplete(confirmDialog.stepId, confirmDialog.label);
    setConfirmDialog(null);
  };

  const handleDeleteTask = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      const taskId = deleteDialog.taskId;

      // First, get the task to check if it has a linked_task_id (source task from other team)
      const { data: taskData } = await supabase
        .from('tasks')
        .select('linked_task_id')
        .eq('id', taskId)
        .single();

      // If this operations task is linked to a source task, clear the reference in the source
      // This ensures the source task (from estimation/designer) is not affected
      if (taskData?.linked_task_id) {
        await supabase
          .from('tasks')
          .update({ linked_task_id: null })
          .eq('id', taskData.linked_task_id);
      }

      // Also clear any tasks that link TO this operations task
      await supabase
        .from('tasks')
        .update({ linked_task_id: null })
        .eq('linked_task_id', taskId);

      // Soft delete ONLY the operations task (not the linked source task)
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      toast.success(`Operations task "${deleteDialog.taskTitle}" deleted`);
      setDeleteDialog(null);
      fetchData();
      onRefresh?.();
    } catch (error: any) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    } finally {
      setDeleting(false);
    }
  };

  const getConfirmDialogDescription = () => {
    if (!confirmDialog) return '';
    const { type, taskTitle, supplierName, clientName, products } = confirmDialog;
    const productList = products.slice(0, 3).map(p => `${p.name}${p.qty ? ` (${p.qty}${p.unit || ''})` : ''}`).join(', ');
    
    if (type === 'collect') {
      return `Are you sure you collected all items from ${supplierName}?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
    } else if (type === 'deliver') {
      return `Are you sure you delivered all items to ${clientName || 'the client'}?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
    } else {
      return `Are you sure you sent items to production at ${supplierName}?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-blue-500';
      default: return 'bg-gray-400';
    }
  };

  const getDueLabel = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) return { text: 'OVERDUE', color: 'text-red-600 bg-red-50' };
    if (isToday(date)) return { text: 'TODAY', color: 'text-orange-600 bg-orange-50' };
    if (isTomorrow(date)) return { text: 'Tomorrow', color: 'text-blue-600 bg-blue-50' };
    return { text: format(date, 'MMM d'), color: 'text-muted-foreground bg-muted' };
  };

  // Group by area
  const groupByArea = <T extends { area: string }>(items: T[]): Record<string, T[]> => {
    return items.reduce((acc, item) => {
      if (!acc[item.area]) acc[item.area] = [];
      acc[item.area].push(item);
      return acc;
    }, {} as Record<string, T[]>);
  };

  const collectByArea = groupByArea(collectItems);
  const deliverByArea = groupByArea(deliverItems);

  const renderSwipeableCard = (
    item: { 
      stepId: string; 
      taskId?: string;
      supplierName?: string; 
      clientName?: string; 
      taskTitle: string; 
      address?: string | null; 
      dueDate: string | null; 
      priority: string; 
      products: { name: string; qty: number | null; unit: string | null; supplier?: string | null }[];
      stepType?: string;
    },
    type: 'collect' | 'deliver' | 'production',
    extraContent?: React.ReactNode
  ) => {
    const isActive = swipingItem === item.stepId;
    const isCompleting = completingStep === item.stepId;
    const due = getDueLabel(item.dueDate);
    
    const bgColor = type === 'collect' ? 'bg-blue-50 dark:bg-blue-950/30' :
                    type === 'deliver' ? 'bg-green-50 dark:bg-green-950/30' :
                    'bg-amber-50 dark:bg-amber-950/30';
    
    const borderColor = type === 'collect' ? 'border-l-blue-500' :
                        type === 'deliver' ? 'border-l-green-500' :
                        'border-l-amber-500';

    const actionColor = type === 'collect' ? 'bg-blue-600' :
                        type === 'deliver' ? 'bg-green-600' :
                        'bg-amber-600';

    // Calculate total quantity
    const totalQty = item.products.reduce((sum, p) => sum + (p.qty || 0), 0);

    return (
      <div key={item.stepId} className="relative overflow-hidden rounded-lg mb-3">
        {/* Swipe reveal background */}
        <div className={cn(
          "absolute inset-y-0 left-0 flex items-center justify-center px-4 transition-all",
          actionColor,
          isActive && swipeOffset > 0 ? "opacity-100" : "opacity-0"
        )} style={{ width: swipeOffset }}>
          <Check className="h-6 w-6 text-white" />
        </div>

        {/* Card */}
        <Card
          className={cn(
            "border-l-4 transition-transform touch-pan-y",
            borderColor,
            bgColor
          )}
          style={{ transform: isActive ? `translateX(${swipeOffset}px)` : 'translateX(0)' }}
          onTouchStart={(e) => handleTouchStart(e, item.stepId)}
          onTouchMove={handleTouchMove}
          onTouchEnd={() => handleTouchEnd(item as any, type)}
        >
          <CardContent className="p-3">
            {isCompleting ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Header Row with Priority + Due Date */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", getPriorityColor(item.priority))} />
                    <span className="font-bold text-base truncate">
                      {type === 'deliver' ? (item.clientName || item.taskTitle) : (item.supplierName || item.taskTitle)}
                    </span>
                  </div>
                  {due ? (
                    <Badge variant="outline" className={cn("text-[10px] shrink-0 font-semibold", due.color)}>
                      <Clock className="h-3 w-3 mr-1" />
                      {due.text}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] shrink-0 font-semibold bg-red-50 text-red-600 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No Due Date
                    </Badge>
                  )}
                </div>

                {/* Task Reference */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                  <User className="h-3 w-3" />
                  <span className="truncate">{item.clientName || 'No client'}</span>
                  <span className="mx-1">•</span>
                  <span className="truncate font-medium">{item.taskTitle}</span>
                </div>

                {/* Step Type indicator for collection */}
                {type === 'collect' && item.stepType && (
                  <div className="mb-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px]",
                        item.stepType === 'supplier_to_supplier' 
                          ? 'bg-purple-50 text-purple-700 border-purple-200' 
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      )}
                    >
                      {item.stepType === 'supplier_to_supplier' ? (
                        <>
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Supplier → Supplier
                        </>
                      ) : (
                        <>
                          <Package className="h-3 w-3 mr-1" />
                          Collect
                        </>
                      )}
                    </Badge>
                  </div>
                )}

                {/* Products Section */}
                <div className="bg-white/70 dark:bg-black/20 rounded-lg p-2 border border-border/50 mb-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground mb-1.5">
                    <Box className="h-3 w-3" />
                    PRODUCTS ({item.products.length} items, {totalQty} total qty)
                  </div>
                  
                  {type === 'collect' ? (
                    // Group by supplier for collection
                    <div className="space-y-1.5">
                      {(() => {
                        const bySupplier: Record<string, { name: string; qty: number | null; unit: string | null }[]> = {};
                        item.products.forEach(p => {
                          const sup = p.supplier || item.supplierName || 'Unknown';
                          if (!bySupplier[sup]) bySupplier[sup] = [];
                          bySupplier[sup].push(p);
                        });
                        return Object.entries(bySupplier).map(([supplier, prods]) => (
                          <div key={supplier} className="bg-primary/5 rounded p-1.5 border border-primary/10">
                            <div className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                              <Factory className="h-3 w-3" />
                              From: {supplier}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {prods.map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] h-5">
                                  {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ' pcs'})`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  ) : (
                    // Standard product list for delivery/production
                    <div className="flex flex-wrap gap-1">
                      {item.products.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] h-5">
                          {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ' pcs'})`}
                        </Badge>
                      ))}
                      {item.products.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">No products listed</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Destination for Production */}
                {type === 'production' && item.supplierName && (
                  <div className="bg-amber-100/50 dark:bg-amber-950/30 rounded p-2 border border-amber-200/50 mb-2">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                      <ArrowRight className="h-3 w-3" />
                      Send to: {item.supplierName}
                    </div>
                  </div>
                )}

                {extraContent}

                {/* Address + Navigate */}
                {item.address && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs justify-between mt-2"
                    onClick={() => openMaps(item.address!)}
                  >
                    <div className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate text-left">{item.address}</span>
                    </div>
                    <Navigation className="h-3.5 w-3.5 shrink-0 ml-2 text-primary" />
                  </Button>
                )}

                {/* Due date display */}
                {item.dueDate && (
                  <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mt-2 bg-muted/50 rounded py-1">
                    <Calendar className="h-3 w-3" />
                    Due: {format(new Date(item.dueDate), 'EEE, MMM d, yyyy')}
                  </div>
                )}

                {/* Footer with swipe hint and admin delete */}
                <div className="flex items-center justify-between mt-2">
                  {/* Swipe hint */}
                  <p className="text-[10px] text-muted-foreground opacity-60 flex items-center gap-1 flex-1">
                    <ChevronRight className="h-3 w-3" />
                    Swipe right to complete
                  </p>
                  
                  {/* Admin Delete Button */}
                  {isAdmin && item.taskId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog({
                          open: true,
                          taskId: item.taskId!,
                          taskTitle: item.taskTitle
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b space-y-3">
        {/* Date + Refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">{format(new Date(), 'EEE, MMM d')}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* View Mode Toggle */}
            <div className="flex bg-muted rounded-lg p-0.5">
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-7 w-7"
                onClick={() => setViewMode('list')}
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
              <Button 
                variant={viewMode === 'map' ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-7 w-7"
                onClick={() => setViewMode('map')}
                disabled={!mapboxToken}
              >
                <Map className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-blue-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{collectItems.length}</p>
            <p className="text-[9px] opacity-90">COLLECT</p>
          </div>
          <div className="bg-amber-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{productionItems.filter(p => !p.isAtProduction).length}</p>
            <p className="text-[9px] opacity-90">PRODUCTION</p>
          </div>
          <div className="bg-green-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{deliverItems.length}</p>
            <p className="text-[9px] opacity-90">DELIVER</p>
          </div>
          <div className="bg-purple-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{productionItems.filter(p => p.isAtProduction).length}</p>
            <p className="text-[9px] opacity-90">AT PROD</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={todayOnly} onCheckedChange={setTodayOnly} id="today" />
            <label htmlFor="today" className="text-xs font-medium">Today + Overdue only</label>
          </div>
          {isAdmin && operationsUsers.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team</SelectItem>
                {operationsUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Map View */}
      {viewMode === 'map' && mapboxToken && (
        <div className="flex-1 min-h-[400px]">
          <OperationsRouteMap
            userId={userId}
            userName={userName}
            mapboxToken={mapboxToken}
            operationsUsers={operationsUsers}
          />
        </div>
      )}

      {/* List View - Tabs */}
      {viewMode === 'list' && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full px-2 py-2 h-auto bg-background border-b rounded-none gap-1 justify-start">
            <TabsTrigger value="collect" className="flex-1 text-xs py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              📥 Collect
            </TabsTrigger>
            <TabsTrigger value="production" className="flex-1 text-xs py-2 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
              🏭 Prod
            </TabsTrigger>
            <TabsTrigger value="deliver" className="flex-1 text-xs py-2 data-[state=active]:bg-green-600 data-[state=active]:text-white">
              🚚 Deliver
            </TabsTrigger>
            <TabsTrigger value="done" className="flex-1 text-xs py-2 data-[state=active]:bg-gray-600 data-[state=active]:text-white">
              ✓ Done
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
          {/* COLLECT TAB - Grouped by Area */}
          <TabsContent value="collect" className="p-3 m-0">
            {collectItems.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-2" />
                <p className="font-medium">All Collected! 🎉</p>
              </div>
            ) : (
              Object.entries(collectByArea).map(([area, items]) => (
                <div key={area} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <span className="font-bold text-sm text-blue-700">{area}</span>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                  {items.map(item => renderSwipeableCard(item, 'collect'))}
                </div>
              ))
            )}
          </TabsContent>

          {/* PRODUCTION TAB */}
          <TabsContent value="production" className="p-3 m-0">
            {productionItems.length === 0 ? (
              <div className="text-center py-12">
                <Factory className="h-12 w-12 text-amber-500/30 mx-auto mb-2" />
                <p className="font-medium">Nothing for Production</p>
              </div>
            ) : (
              <>
                {/* To Send */}
                {productionItems.filter(p => !p.isAtProduction).length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Factory className="h-4 w-4 text-amber-600" />
                      <span className="font-bold text-sm text-amber-700">To Send</span>
                    </div>
                    {productionItems.filter(p => !p.isAtProduction).map(item => 
                      renderSwipeableCard({
                        ...item,
                        address: null
                      }, 'production')
                    )}
                  </div>
                )}
                
                {/* At Production */}
                {productionItems.filter(p => p.isAtProduction).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Factory className="h-4 w-4 text-purple-600" />
                      <span className="font-bold text-sm text-purple-700">At Production</span>
                      <Badge variant="secondary" className="text-xs">{productionItems.filter(p => p.isAtProduction).length}</Badge>
                    </div>
                    {productionItems.filter(p => p.isAtProduction).map(item => (
                      <Card key={item.stepId} className="border-l-4 border-l-purple-500 bg-purple-50 dark:bg-purple-950/30 mb-3">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-purple-600 text-white text-xs">AT PRODUCTION</Badge>
                              <span className="font-bold text-sm">{item.supplierName}</span>
                            </div>
                            {item.dueDate ? (
                              <Badge variant="outline" className={cn(
                                "text-[10px] shrink-0 font-semibold",
                                isPast(new Date(item.dueDate)) && !isToday(new Date(item.dueDate)) ? "bg-red-50 text-red-600" :
                                isToday(new Date(item.dueDate)) ? "bg-orange-50 text-orange-600" : "bg-muted text-muted-foreground"
                              )}>
                                <Clock className="h-3 w-3 mr-1" />
                                {isPast(new Date(item.dueDate)) && !isToday(new Date(item.dueDate)) ? 'OVERDUE' :
                                 isToday(new Date(item.dueDate)) ? 'TODAY' : format(new Date(item.dueDate), 'MMM d')}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] shrink-0 font-semibold bg-red-50 text-red-600 border-red-200">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                No Due Date
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                            <User className="h-3 w-3" />
                            <span>{item.clientName || 'No client'}</span>
                            <span className="mx-1">•</span>
                            <span className="font-medium">{item.taskTitle}</span>
                          </div>

                          {/* Products */}
                          <div className="bg-white/70 dark:bg-black/20 rounded p-2 border border-border/50">
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground mb-1">
                              <Box className="h-3 w-3" />
                              PRODUCTS ({item.products.length} items)
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {item.products.map((p, i) => (
                                <Badge key={i} variant="secondary" className="text-[10px] h-5">
                                  {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ' pcs'})`}
                                </Badge>
                              ))}
                              {item.products.length === 0 && (
                                <span className="text-xs text-muted-foreground italic">No products listed</span>
                              )}
                            </div>
                          </div>

                          {item.dueDate && (
                            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mt-2 bg-muted/50 rounded py-1">
                              <Calendar className="h-3 w-3" />
                              Due: {format(new Date(item.dueDate), 'EEE, MMM d, yyyy')}
                            </div>
                          )}

                          {/* Admin Delete Button */}
                          {isAdmin && (
                            <div className="flex justify-end mt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteDialog({
                                    open: true,
                                    taskId: item.taskId,
                                    taskTitle: item.taskTitle
                                  });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                <span className="text-xs">Delete</span>
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* DELIVER TAB - Grouped by Area */}
          <TabsContent value="deliver" className="p-3 m-0">
            {deliverItems.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="h-12 w-12 text-green-500/30 mx-auto mb-2" />
                <p className="font-medium">No Deliveries 🎉</p>
              </div>
            ) : (
              Object.entries(deliverByArea).map(([area, items]) => (
                <div key={area} className="mb-4">
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                    <MapPin className="h-4 w-4 text-green-600" />
                    <span className="font-bold text-sm text-green-700">{area}</span>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                  {items.map(item => renderSwipeableCard(
                    item, 
                    'deliver',
                    item.instructions && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs mt-2">
                        <span className="font-semibold">📝 </span>{item.instructions}
                      </div>
                    )
                  ))}
                </div>
              ))
            )}
          </TabsContent>

          {/* DONE TAB */}
          <TabsContent value="done" className="p-3 m-0">
            {completedItems.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="font-medium">No History Yet</p>
              </div>
            ) : (
              completedItems.map(item => (
                <Card key={item.stepId} className="mb-2 bg-muted/30">
                  <CardContent className="p-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.taskTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.stepType === 'collect' ? 'Collected' : item.stepType === 'deliver_to_client' ? 'Delivered' : 'Production'}
                        {item.supplierName && ` - ${item.supplierName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.completedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(item.completedAt), 'h:mm a')}
                        </span>
                      )}
                      {isAdmin && item.taskId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDialog({
                              open: true,
                              taskId: item.taskId,
                              taskTitle: item.taskTitle
                            });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </ScrollArea>
        </Tabs>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <SwipeConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => {
            if (!open) setConfirmDialog(null);
          }}
          onConfirm={handleConfirmComplete}
          title={
            confirmDialog.type === 'collect' 
              ? `Confirm Collection` 
              : confirmDialog.type === 'deliver' 
                ? `Confirm Delivery` 
                : `Confirm Production`
          }
          description={getConfirmDialogDescription()}
          actionType={confirmDialog.type}
        />
      )}

      {/* Delete Confirmation Dialog (Admin only) */}
      <AlertDialog open={deleteDialog?.open} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Task
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the task "<strong>{deleteDialog?.taskTitle}</strong>"?
              <br /><br />
              This will remove the task and all its workflow steps. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
