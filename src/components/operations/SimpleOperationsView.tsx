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
  Trash2,
  Edit2,
  Plus,
  MousePointerClick,
  UserPlus
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
import { OperationsProductEditor } from './OperationsProductEditor';
import { CreateOperationsTaskDialog } from '../CreateOperationsTaskDialog';

interface OperationItem {
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
  instructions?: string | null;
  assignedTo?: string | null;
  isAtProduction?: boolean;
  fromSupplier?: string | null;
  toSupplier?: string | null;
  locationNotes?: string | null;
  stepOrder: number;
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

// Parse S→S location notes to extract from/to suppliers
const parseSupplierToSupplier = (locationNotes: string | null): { fromSupplier: string | null; fromAddress: string | null } => {
  if (!locationNotes) return { fromSupplier: null, fromAddress: null };
  const match = locationNotes.match(/FROM:\s*([^(]+)(?:\s*\(([^)]+)\))?/i);
  if (match) {
    return {
      fromSupplier: match[1]?.trim() || null,
      fromAddress: match[2]?.trim() || null
    };
  }
  return { fromSupplier: null, fromAddress: null };
};

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh,
  operationsUsers = []
}: SimpleOperationsViewProps) => {
  const [collectItems, setCollectItems] = useState<OperationItem[]>([]);
  const [deliverItems, setDeliverItems] = useState<OperationItem[]>([]);
  const [productionItems, setProductionItems] = useState<OperationItem[]>([]);
  const [completedItems, setCompletedItems] = useState<OperationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingStep, setCompletingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('collect');
  const [todayOnly, setTodayOnly] = useState(true);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  
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

  // Product editor dialog state
  const [productEditor, setProductEditor] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
  } | null>(null);

  // Assignment dialog state
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
    currentAssignee: string | null;
  } | null>(null);
  const [newAssignee, setNewAssignee] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch workflow steps with task info
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_type, supplier_name, status, location_address, due_date, task_id, completed_at, location_notes, step_order, assigned_to,
          tasks!inner (id, title, client_name, priority, due_date, delivery_address, delivery_instructions, assigned_to, deleted_at, status)
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .order('step_order', { ascending: true });

      if (error) throw error;

      // Fetch products
      const taskIds = [...new Set((stepsData || []).map((s: any) => s.task_id))];
      let productsMap: Record<string, { name: string; qty: number | null; unit: string | null; supplier: string | null; stepId: string | null }[]> = {};
      
      if (taskIds.length > 0) {
        const { data: productsData } = await supabase
          .from('task_products')
          .select('task_id, product_name, quantity, unit, supplier_name, workflow_step_id')
          .in('task_id', taskIds);
        
        (productsData || []).forEach((p: any) => {
          if (!productsMap[p.task_id]) productsMap[p.task_id] = [];
          productsMap[p.task_id].push({ 
            name: p.product_name, 
            qty: p.quantity, 
            unit: p.unit,
            supplier: p.supplier_name,
            stepId: p.workflow_step_id
          });
        });
      }

      // Build flat lists
      const collections: OperationItem[] = [];
      const deliveries: OperationItem[] = [];
      const productions: OperationItem[] = [];
      const completed: OperationItem[] = [];

      (stepsData || []).forEach((step: any) => {
        const task = step.tasks;
        if (!task) return;

        // Apply team filter
        if (isAdmin && teamFilter !== 'all' && task.assigned_to !== teamFilter) return;

        // Get products for this specific step or all task products
        const taskProducts = productsMap[step.task_id] || [];
        const stepProducts = taskProducts
          .filter(p => !p.stepId || p.stepId === step.id)
          .map(p => ({ name: p.name, qty: p.qty, unit: p.unit, supplier: p.supplier }));

        // Parse S→S info
        const s2sInfo = parseSupplierToSupplier(step.location_notes);
        
        const baseItem: OperationItem = {
          stepId: step.id,
          taskId: step.task_id,
          taskTitle: task.title,
          clientName: task.client_name,
          supplierName: step.supplier_name || 'Unknown',
          address: step.location_address || task.delivery_address,
          dueDate: step.due_date || task.due_date,
          priority: task.priority,
          products: stepProducts,
          stepType: step.step_type,
          area: extractArea(step.location_address || task.delivery_address),
          instructions: task.delivery_instructions,
          assignedTo: step.assigned_to || task.assigned_to,
          locationNotes: step.location_notes,
          fromSupplier: s2sInfo.fromSupplier,
          toSupplier: step.supplier_name,
          stepOrder: step.step_order || 0
        };

        if (step.status === 'completed') {
          completed.push({ ...baseItem, isAtProduction: false });
          
          // S→S completed goes to "At Production" 
          if (step.step_type === 'supplier_to_supplier') {
            productions.push({ ...baseItem, isAtProduction: true });
          }
          // deliver_to_supplier completed also means "At Production"
          if (step.step_type === 'deliver_to_supplier') {
            productions.push({ ...baseItem, isAtProduction: true });
          }
        } else if (step.status === 'pending') {
          // Apply today filter
          const itemDueDate = step.due_date || task.due_date;
          if (todayOnly && itemDueDate && !isToday(new Date(itemDueDate)) && !isPast(new Date(itemDueDate))) {
            return;
          }

          // LOGIC:
          // 1. collect -> Collections tab
          // 2. deliver_to_client -> Deliveries tab  
          // 3. deliver_to_supplier -> Production tab (delivery FOR production)
          // 4. supplier_to_supplier -> Collections tab (collect from 1st supplier) 
          //    When completed, it shows in Production tab as "At Production" and creates delivery to 2nd supplier
          
          switch (step.step_type) {
            case 'collect':
              collections.push(baseItem);
              break;
            case 'deliver_to_client':
              deliveries.push(baseItem);
              break;
            case 'deliver_to_supplier':
              productions.push({ ...baseItem, isAtProduction: false });
              break;
            case 'supplier_to_supplier':
              // This appears as a COLLECTION from the first supplier
              collections.push({
                ...baseItem,
                supplierName: s2sInfo.fromSupplier || step.supplier_name || 'Unknown'
              });
              break;
          }
        }
      });

      // Sort by priority (urgent first) then by due date, then by step order
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sortFn = (a: OperationItem, b: OperationItem) => {
        const pA = priorityOrder[a.priority] ?? 2;
        const pB = priorityOrder[b.priority] ?? 2;
        if (pA !== pB) return pA - pB;
        if (!a.dueDate && !b.dueDate) return a.stepOrder - b.stepOrder;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        const dateDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.stepOrder - b.stepOrder;
      };

      setCollectItems(collections.sort(sortFn));
      setDeliverItems(deliveries.sort(sortFn));
      setProductionItems(productions);
      setCompletedItems(completed.slice(-30).reverse());
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
      .channel('ops-realtime-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_workflow_steps' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleComplete = async (stepId: string, label: string, stepType?: string) => {
    setCompletingStep(stepId);
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(), 
          completed_by: userId 
        })
        .eq('id', stepId);
      
      if (error) throw error;
      
      toast.success(`✓ ${label}`);
      
      // Log activity
      const { data: stepData } = await supabase
        .from('task_workflow_steps')
        .select('task_id')
        .eq('id', stepId)
        .single();
      
      if (stepData?.task_id) {
        await supabase.from('task_activity_log').insert({
          task_id: stepData.task_id,
          user_id: userId,
          action: 'step_completed',
          details: { step_id: stepId, step_type: stepType, label }
        });
      }
      
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

  // Swipe handlers for mobile
  const handleTouchStart = (e: React.TouchEvent, itemId: string) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipingItem(itemId);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swipingItem) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff > 0) setSwipeOffset(Math.min(diff, 120));
  };

  const handleTouchEnd = (item: OperationItem, type: 'collect' | 'deliver' | 'production') => {
    if (swipeOffset > 80) {
      showConfirmation(item, type);
    }
    setSwipingItem(null);
    setSwipeOffset(0);
  };

  // Show confirmation dialog (works for both swipe and click)
  const showConfirmation = (item: OperationItem, type: 'collect' | 'deliver' | 'production') => {
    let label = '';
    if (type === 'collect') {
      if (item.stepType === 'supplier_to_supplier') {
        label = `Collected from ${item.fromSupplier || item.supplierName} → Ready for ${item.toSupplier || 'production'}`;
      } else {
        label = `Collected from ${item.supplierName}`;
      }
    } else if (type === 'deliver') {
      label = `Delivered to ${item.clientName || 'client'}`;
    } else {
      label = `Sent to ${item.supplierName} for production`;
    }
    
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
  };

  // Desktop click handler
  const handleClickComplete = (item: OperationItem, type: 'collect' | 'deliver' | 'production') => {
    showConfirmation(item, type);
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

      // Get the task to check if it has a linked_task_id (source task from other team)
      const { data: taskData } = await supabase
        .from('tasks')
        .select('linked_task_id')
        .eq('id', taskId)
        .single();

      // Clear linked_task_id references
      if (taskData?.linked_task_id) {
        await supabase
          .from('tasks')
          .update({ linked_task_id: null })
          .eq('id', taskData.linked_task_id);
      }

      await supabase
        .from('tasks')
        .update({ linked_task_id: null })
        .eq('linked_task_id', taskId);

      // Soft delete ONLY the operations task
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      toast.success(`Deleted "${deleteDialog.taskTitle}"`);
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

  const handleAssignTask = async () => {
    if (!assignDialog) return;
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ assigned_to: newAssignee || null })
        .eq('id', assignDialog.taskId);

      if (error) throw error;

      const assigneeName = operationsUsers.find(u => u.id === newAssignee)?.full_name || 'Unassigned';
      toast.success(`Assigned to ${assigneeName}`);
      
      // Notify admin
      await supabase.from('task_activity_log').insert({
        task_id: assignDialog.taskId,
        user_id: userId,
        action: 'task_reassigned',
        details: { new_assignee: newAssignee, new_assignee_name: assigneeName }
      });

      setAssignDialog(null);
      setNewAssignee('');
      fetchData();
    } catch (error) {
      toast.error('Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const getConfirmDialogDescription = () => {
    if (!confirmDialog) return '';
    const { type, taskTitle, supplierName, clientName, products } = confirmDialog;
    const productList = products.slice(0, 3).map(p => `${p.name}${p.qty ? ` (${p.qty}${p.unit || ''})` : ''}`).join(', ');
    
    if (type === 'collect') {
      return `Collected all items from ${supplierName}?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
    } else if (type === 'deliver') {
      return `Delivered all items to ${clientName || 'the client'}?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
    } else {
      return `Sent items to ${supplierName} for production?\n\nTask: ${taskTitle}\nProducts: ${productList}`;
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
    if (isPast(date) && !isToday(date)) return { text: 'OVERDUE', color: 'text-red-600 bg-red-50 dark:bg-red-950/50' };
    if (isToday(date)) return { text: 'TODAY', color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50' };
    if (isTomorrow(date)) return { text: 'Tomorrow', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50' };
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

  const getAssigneeName = (assignedTo: string | null | undefined) => {
    if (!assignedTo) return null;
    const user = operationsUsers.find(u => u.id === assignedTo);
    return user?.full_name || user?.email || null;
  };

  const renderOperationCard = (
    item: OperationItem,
    type: 'collect' | 'deliver' | 'production',
    extraContent?: React.ReactNode
  ) => {
    const isActive = swipingItem === item.stepId;
    const isCompleting = completingStep === item.stepId;
    const due = getDueLabel(item.dueDate);
    const assigneeName = getAssigneeName(item.assignedTo);
    
    const bgColor = type === 'collect' ? 'bg-blue-50 dark:bg-blue-950/30' :
                    type === 'deliver' ? 'bg-green-50 dark:bg-green-950/30' :
                    'bg-amber-50 dark:bg-amber-950/30';
    
    const borderColor = type === 'collect' ? 'border-l-blue-500' :
                        type === 'deliver' ? 'border-l-green-500' :
                        'border-l-amber-500';

    const actionColor = type === 'collect' ? 'bg-blue-600' :
                        type === 'deliver' ? 'bg-green-600' :
                        'bg-amber-600';

    const actionLabel = type === 'collect' ? 'Mark Collected' :
                        type === 'deliver' ? 'Mark Delivered' :
                        'Mark at Production';

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
          onTouchEnd={() => handleTouchEnd(item, type)}
        >
          <CardContent className="p-3">
            {isCompleting ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Header Row */}
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
                    <Badge variant="outline" className="text-[10px] shrink-0 font-semibold bg-red-50 text-red-600 border-red-200 dark:bg-red-950/50 dark:border-red-800">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No Due
                    </Badge>
                  )}
                </div>

                {/* Task Reference + Assignee */}
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap">
                  <User className="h-3 w-3" />
                  <span className="truncate">{item.clientName || 'No client'}</span>
                  <span className="mx-1">•</span>
                  <span className="truncate font-medium">{item.taskTitle}</span>
                  {assigneeName && (
                    <>
                      <span className="mx-1">•</span>
                      <Badge variant="secondary" className="text-[10px] h-4">
                        {assigneeName}
                      </Badge>
                    </>
                  )}
                </div>

                {/* Step Type Badge */}
                {type === 'collect' && item.stepType && (
                  <div className="mb-2">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px]",
                        item.stepType === 'supplier_to_supplier' 
                          ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800' 
                          : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                      )}
                    >
                      {item.stepType === 'supplier_to_supplier' ? (
                        <>
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Collect → {item.toSupplier || 'Production'}
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

                {type === 'production' && (
                  <div className="mb-2">
                    <Badge 
                      variant="outline" 
                      className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
                    >
                      <Truck className="h-3 w-3 mr-1" />
                      Deliver for Production
                    </Badge>
                  </div>
                )}

                {/* Products Section */}
                <div className="bg-white/70 dark:bg-black/20 rounded-lg p-2 border border-border/50 mb-2">
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                      <Box className="h-3 w-3" />
                      PRODUCTS ({item.products.length} items{totalQty > 0 && `, ${totalQty} qty`})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-primary hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProductEditor({
                          open: true,
                          taskId: item.taskId,
                          taskTitle: item.taskTitle
                        });
                      }}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
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

                {/* Destination for Production */}
                {type === 'production' && item.supplierName && (
                  <div className="bg-amber-100/50 dark:bg-amber-950/30 rounded p-2 border border-amber-200/50 dark:border-amber-800/50 mb-2">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      <Factory className="h-3 w-3" />
                      Production at: {item.supplierName}
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

                {/* Action Buttons Row */}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/50">
                  {/* Complete Button (Desktop) */}
                  <Button
                    size="sm"
                    className={cn("flex-1 h-9 text-xs font-semibold", actionColor, "hover:opacity-90")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClickComplete(item, type);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    {actionLabel}
                  </Button>

                  {/* Assign Button */}
                  {(isAdmin || item.assignedTo === userId || !item.assignedTo) && operationsUsers.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssignDialog({
                          open: true,
                          taskId: item.taskId,
                          taskTitle: item.taskTitle,
                          currentAssignee: item.assignedTo || null
                        });
                        setNewAssignee(item.assignedTo || '');
                      }}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Admin Delete Button */}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog({
                          open: true,
                          taskId: item.taskId,
                          taskTitle: item.taskTitle
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Swipe hint (mobile only) */}
                <p className="text-[10px] text-muted-foreground opacity-60 flex items-center gap-1 mt-2 md:hidden">
                  <ChevronRight className="h-3 w-3" />
                  Swipe right to complete
                </p>
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

  const atProductionCount = productionItems.filter(p => p.isAtProduction).length;
  const pendingProductionCount = productionItems.filter(p => !p.isAtProduction).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b space-y-3">
        {/* Date + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">{format(new Date(), 'EEE, MMM d')}</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Create Task Button */}
            <Button 
              variant="default" 
              size="sm" 
              className="h-8 text-xs"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
            
            {/* View Mode Toggle */}
            <div className="flex bg-muted rounded-lg p-0.5 ml-1">
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
            <p className="text-xl font-bold">{pendingProductionCount}</p>
            <p className="text-[9px] opacity-90">PRODUCTION</p>
          </div>
          <div className="bg-green-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{deliverItems.length}</p>
            <p className="text-[9px] opacity-90">DELIVER</p>
          </div>
          <div className="bg-purple-500 text-white rounded-lg p-2 text-center">
            <p className="text-xl font-bold">{atProductionCount}</p>
            <p className="text-[9px] opacity-90">AT PROD</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={todayOnly} onCheckedChange={setTodayOnly} id="today" />
            <label htmlFor="today" className="text-xs font-medium">Today + Overdue</label>
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
            {/* COLLECT TAB */}
            <TabsContent value="collect" className="p-3 m-0">
              {collectItems.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500/50 mx-auto mb-2" />
                  <p className="font-medium">All Collected! 🎉</p>
                </div>
              ) : (
                Object.entries(collectByArea).map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-bold text-sm text-blue-700 dark:text-blue-400">{area}</span>
                      <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                    </div>
                    {items.map(item => renderOperationCard(item, 'collect'))}
                  </div>
                ))
              )}
            </TabsContent>

            {/* PRODUCTION TAB */}
            <TabsContent value="production" className="p-3 m-0">
              {productionItems.length === 0 ? (
                <div className="text-center py-12">
                  <Factory className="h-12 w-12 text-amber-500/30 mx-auto mb-2" />
                  <p className="font-medium">No Production Tasks</p>
                </div>
              ) : (
                <>
                  {/* Pending Production */}
                  {pendingProductionCount > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <Truck className="h-4 w-4 text-amber-600" />
                        <span className="font-bold text-sm text-amber-700 dark:text-amber-400">Deliver for Production</span>
                        <Badge variant="secondary" className="text-xs">{pendingProductionCount}</Badge>
                      </div>
                      {productionItems.filter(p => !p.isAtProduction).map(item => 
                        renderOperationCard(item, 'production')
                      )}
                    </div>
                  )}

                  {/* At Production */}
                  {atProductionCount > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <Factory className="h-4 w-4 text-purple-600" />
                        <span className="font-bold text-sm text-purple-700 dark:text-purple-400">At Production</span>
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs">
                          {atProductionCount}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {productionItems.filter(p => p.isAtProduction).map(item => (
                          <Card key={`at-${item.stepId}`} className="border-l-4 border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Factory className="h-4 w-4 text-purple-600 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-sm truncate">{item.supplierName}</p>
                                    <p className="text-xs text-muted-foreground truncate">{item.taskTitle}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-[10px]">
                                    In Progress
                                  </Badge>
                                  {/* Edit Products */}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => setProductEditor({
                                      open: true,
                                      taskId: item.taskId,
                                      taskTitle: item.taskTitle
                                    })}
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  {isAdmin && (
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
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              {item.products.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {item.products.slice(0, 4).map((p, i) => (
                                    <Badge key={i} variant="secondary" className="text-[10px]">
                                      {p.name} {p.qty && `(${p.qty})`}
                                    </Badge>
                                  ))}
                                  {item.products.length > 4 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      +{item.products.length - 4} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* DELIVER TAB */}
            <TabsContent value="deliver" className="p-3 m-0">
              {deliverItems.length === 0 ? (
                <div className="text-center py-12">
                  <Truck className="h-12 w-12 text-green-500/30 mx-auto mb-2" />
                  <p className="font-medium">No Deliveries 🎉</p>
                </div>
              ) : (
                Object.entries(deliverByArea).map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                      <MapPin className="h-4 w-4 text-green-600" />
                      <span className="font-bold text-sm text-green-700 dark:text-green-400">{area}</span>
                      <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                    </div>
                    {items.map(item => renderOperationCard(
                      item, 
                      'deliver',
                      item.instructions && (
                        <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-2 text-xs mt-2">
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
                  <Card key={`done-${item.stepId}`} className="mb-2 bg-muted/30">
                    <CardContent className="p-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.taskTitle}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.stepType === 'collect' ? 'Collected' : 
                           item.stepType === 'deliver_to_client' ? 'Delivered' : 
                           item.stepType === 'supplier_to_supplier' ? 'S→S Transfer' : 
                           'To Production'}
                          {item.supplierName && ` - ${item.supplierName}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.dueDate && (
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(item.dueDate), 'MMM d')}
                          </span>
                        )}
                        {isAdmin && (
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

      {/* Create Task Dialog */}
      <CreateOperationsTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTaskCreated={fetchData}
      />

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
                : `Confirm Production Delivery`
          }
          description={getConfirmDialogDescription()}
          actionType={confirmDialog.type}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog?.open} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Task
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteDialog?.taskTitle}</strong>"?
              <br /><br />
              This removes only this operations task and won't affect tasks from other teams.
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

      {/* Assignment Dialog */}
      <AlertDialog open={assignDialog?.open} onOpenChange={(open) => !open && setAssignDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Assign Task
            </AlertDialogTitle>
            <AlertDialogDescription>
              Assign "<strong>{assignDialog?.taskTitle}</strong>" to a team member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={newAssignee} onValueChange={setNewAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {operationsUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAssignTask}
              disabled={assigning}
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product Editor Dialog */}
      {productEditor && (
        <OperationsProductEditor
          open={productEditor.open}
          onOpenChange={(open) => !open && setProductEditor(null)}
          taskId={productEditor.taskId}
          taskTitle={productEditor.taskTitle}
          onProductsUpdated={fetchData}
        />
      )}
    </div>
  );
};
