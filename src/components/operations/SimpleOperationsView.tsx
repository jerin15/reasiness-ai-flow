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
  Factory, 
  MapPin, 
  Check, 
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  History,
  Calendar,
  Filter,
  Clock,
  Navigation,
  ChevronRight,
  Map,
  ArrowRight,
  User,
  Box,
  Trash2,
  Edit2,
  Plus,
  UserPlus,
  Bell
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
import { format, isToday, isPast, isTomorrow, differenceInDays, differenceInHours } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OperationsRouteMap } from './OperationsRouteMap';
import { OperationsProductEditor } from './OperationsProductEditor';
import { CreateOperationsTaskDialog } from '../CreateOperationsTaskDialog';
import { 
  type WorkflowStage, 
  type OperationsWorkflowItem,
  OperationsWorkflowCard 
} from './OperationsWorkflowCard';
import { WorkflowStageConfirmDialog } from './WorkflowStageConfirmDialog';

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

// Parse workflow stage from notes
const parseWorkflowStage = (notes: string | null, stepStatus: string, stepType: string): WorkflowStage => {
  // Check notes for explicit stage markers
  if (notes) {
    if (notes.includes('[STAGE:deliver]')) return 'deliver';
    if (notes.includes('[STAGE:collect_for_delivery]')) return 'collect_for_delivery';
    if (notes.includes('[STAGE:production_done]')) return 'production_done';
    if (notes.includes('[STAGE:at_production]')) return 'at_production';
    if (notes.includes('[STAGE:sent_for_production]')) return 'sent_for_production';
  }
  
  // Infer from step type and status
  if (stepStatus === 'completed') {
    if (stepType === 'deliver_to_client') return 'deliver';
    if (stepType === 'collect') return 'sent_for_production';
    if (stepType === 'supplier_to_supplier' || stepType === 'deliver_to_supplier') return 'at_production';
  }
  
  // Default based on step type
  if (stepType === 'deliver_to_client') return 'deliver';
  if (stepType === 'supplier_to_supplier' || stepType === 'deliver_to_supplier') return 'collect';
  return 'collect';
};

// Parse S→S location notes
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
  // Data state
  const [allItems, setAllItems] = useState<OperationsWorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  
  // View state
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
  
  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    item: OperationsWorkflowItem;
    nextStage: WorkflowStage;
  } | null>(null);

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [productEditor, setProductEditor] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
  } | null>(null);

  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    taskId: string;
    taskTitle: string;
    currentAssignee: string | null;
  } | null>(null);
  const [newAssignee, setNewAssignee] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  // Fetch all workflow data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch workflow steps with task info
      const { data: stepsData, error } = await supabase
        .from('task_workflow_steps')
        .select(`
          id, step_type, supplier_name, status, location_address, due_date, task_id, 
          completed_at, completed_by, location_notes, step_order, assigned_to, notes, started_at, updated_at,
          tasks!inner (id, title, client_name, priority, due_date, delivery_address, delivery_instructions, assigned_to, deleted_at, status)
        `)
        .is('tasks.deleted_at', null)
        .eq('tasks.status', 'production')
        .order('step_order', { ascending: true });

      if (error) throw error;

      // Fetch products
      const taskIds = [...new Set((stepsData || []).map((s: any) => s.task_id))];
      let productsMap: Record<string, { name: string; qty: number | null; unit: string | null; supplier: string | null }[]> = {};
      
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
            supplier: p.supplier_name
          });
        });
      }

      // Fetch completed_by profiles
      const completedByIds = [...new Set((stepsData || []).filter((s: any) => s.completed_by).map((s: any) => s.completed_by))];
      let profilesMap: Record<string, string> = {};
      if (completedByIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', completedByIds);
        (profiles || []).forEach((p: any) => {
          profilesMap[p.id] = p.full_name || p.email || 'Team member';
        });
      }

      // Build workflow items
      const items: OperationsWorkflowItem[] = [];

      (stepsData || []).forEach((step: any) => {
        const task = step.tasks;
        if (!task) return;

        // Apply team filter
        if (isAdmin && teamFilter !== 'all' && task.assigned_to !== teamFilter) return;

        // Get products
        const taskProducts = productsMap[step.task_id] || [];
        
        // Parse S→S info
        const s2sInfo = parseSupplierToSupplier(step.location_notes);
        
        // Determine current stage
        const currentStage = parseWorkflowStage(step.notes, step.status, step.step_type);
        
        // Get assignee name
        const assignee = operationsUsers.find(u => u.id === (step.assigned_to || task.assigned_to));
        
        const item: OperationsWorkflowItem = {
          stepId: step.id,
          taskId: step.task_id,
          taskTitle: task.title,
          clientName: task.client_name,
          supplierName: step.supplier_name || 'Unknown',
          toSupplier: step.supplier_name,
          fromSupplier: s2sInfo.fromSupplier,
          address: step.location_address || task.delivery_address,
          dueDate: step.due_date || task.due_date,
          priority: task.priority,
          products: taskProducts,
          stepType: step.step_type,
          area: extractArea(step.location_address || task.delivery_address),
          instructions: task.delivery_instructions,
          assignedTo: step.assigned_to || task.assigned_to,
          assigneeName: assignee?.full_name || assignee?.email || null,
          currentStage,
          stageUpdatedAt: step.updated_at,
          notes: step.notes,
          completedAt: step.completed_at,
          completedBy: step.completed_by,
          completedByName: step.completed_by ? profilesMap[step.completed_by] : null
        };

        items.push(item);
      });

      // Sort by priority then due date
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      items.sort((a, b) => {
        const pA = priorityOrder[a.priority] ?? 2;
        const pB = priorityOrder[b.priority] ?? 2;
        if (pA !== pB) return pA - pB;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setAllItems(items);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [teamFilter, isAdmin, operationsUsers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch mapbox token
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-mapbox-token');
        if (error) throw error;
        if (data?.token) setMapboxToken(data.token);
      } catch (error) {
        console.error('Error fetching mapbox token:', error);
      }
    };
    fetchMapboxToken();
  }, []);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('ops-workflow-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_workflow_steps' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_products' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Filter items by stage and date
  const getFilteredItems = useCallback((stages: WorkflowStage[]) => {
    return allItems.filter(item => {
      if (!stages.includes(item.currentStage)) return false;
      
      // Apply today filter
      if (todayOnly && item.dueDate) {
        const date = new Date(item.dueDate);
        if (!isToday(date) && !isPast(date)) return false;
      }
      
      return true;
    });
  }, [allItems, todayOnly]);

  // Categorize items
  const collectItems = getFilteredItems(['collect']);
  const productionItems = getFilteredItems(['sent_for_production', 'at_production', 'production_done', 'collect_for_delivery']);
  const deliverItems = getFilteredItems(['deliver']);
  const completedItems = allItems.filter(item => item.completedAt).slice(-30);

  // Stage transition handler
  const handleStageTransition = async (item: OperationsWorkflowItem, nextStage: WorkflowStage) => {
    setProcessingStep(item.stepId);
    try {
      // Get current notes
      const { data: stepData } = await supabase
        .from('task_workflow_steps')
        .select('notes')
        .eq('id', item.stepId)
        .single();
      
      // Update notes with new stage marker
      let currentNotes = stepData?.notes || '';
      // Remove old stage markers
      currentNotes = currentNotes.replace(/\[STAGE:\w+\]/g, '').trim();
      // Add new stage marker
      const newNotes = `${currentNotes} [STAGE:${nextStage}]`.trim();
      
      // Prepare update
      const updates: any = { 
        notes: newNotes,
        updated_at: new Date().toISOString()
      };
      
      // If final delivery, mark as completed
      if (nextStage === 'deliver' && item.currentStage !== 'collect') {
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
        updates.completed_by = userId;
      }
      
      // If collection complete (first step), mark started
      if (item.currentStage === 'collect') {
        updates.started_at = updates.started_at || new Date().toISOString();
      }

      const { error } = await supabase
        .from('task_workflow_steps')
        .update(updates)
        .eq('id', item.stepId);
      
      if (error) throw error;
      
      // Log activity with full details
      await supabase.from('task_activity_log').insert({
        task_id: item.taskId,
        user_id: userId,
        action: 'workflow_stage_updated',
        details: { 
          step_id: item.stepId,
          previous_stage: item.currentStage,
          new_stage: nextStage,
          supplier: item.supplierName,
          client: item.clientName,
          products_count: item.products.length,
          due_date: item.dueDate,
          timestamp: new Date().toISOString()
        }
      });

      // Send notification to admins
      const stageLabels: Record<WorkflowStage, string> = {
        collect: '📥 Collected',
        sent_for_production: '🚚 Sent for Production',
        at_production: '🏭 At Production',
        production_done: '✅ Production Complete',
        collect_for_delivery: '📦 Collected for Delivery',
        deliver: '🚚 Delivered'
      };

      await supabase.from('urgent_notifications').insert({
        sender_id: userId,
        recipient_id: null,
        is_broadcast: true,
        title: `${stageLabels[nextStage]}: ${item.taskTitle}`,
        message: `Task "${item.taskTitle}" moved to "${stageLabels[nextStage]}".\n\nSupplier: ${item.supplierName}\nClient: ${item.clientName || 'N/A'}\nProducts: ${item.products.length} items\n\nUpdated by: ${userName}\nTime: ${format(new Date(), 'MMM d, h:mm a')}`,
        priority: 'medium',
        is_acknowledged: false
      });
      
      toast.success(`✓ ${stageLabels[nextStage]}`);
      fetchData();
      onRefresh?.();
    } catch (e) {
      console.error('Error updating stage:', e);
      toast.error('Failed to update');
    } finally {
      setProcessingStep(null);
      setConfirmDialog(null);
    }
  };

  // Handle delete
  const handleDeleteTask = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteDialog.taskId);

      if (error) throw error;

      // Log activity
      await supabase.from('task_activity_log').insert({
        task_id: deleteDialog.taskId,
        user_id: userId,
        action: 'task_deleted',
        details: { task_title: deleteDialog.taskTitle }
      });

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

  // Handle assign
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
      
      // Log activity
      await supabase.from('task_activity_log').insert({
        task_id: assignDialog.taskId,
        user_id: userId,
        action: 'task_assigned',
        details: { 
          new_assignee: newAssignee, 
          new_assignee_name: assigneeName,
          assigned_by: userName
        }
      });

      // Notify assignee
      if (newAssignee) {
        await supabase.from('urgent_notifications').insert({
          sender_id: userId,
          recipient_id: newAssignee,
          is_broadcast: false,
          title: '📋 Task Assigned to You',
          message: `"${assignDialog.taskTitle}" has been assigned to you by ${userName}.`,
          priority: 'medium',
          is_acknowledged: false
        });
      }

      toast.success(`Assigned to ${assigneeName}`);
      setAssignDialog(null);
      setNewAssignee('');
      fetchData();
    } catch (error) {
      toast.error('Failed to assign');
    } finally {
      setAssigning(false);
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

  const handleTouchEnd = (item: OperationsWorkflowItem) => {
    if (swipeOffset > 80) {
      const config = {
        collect: 'sent_for_production',
        sent_for_production: 'at_production',
        at_production: 'production_done',
        production_done: 'collect_for_delivery',
        collect_for_delivery: 'deliver',
        deliver: 'deliver'
      } as const;
      const nextStage = config[item.currentStage] as WorkflowStage;
      setConfirmDialog({ open: true, item, nextStage });
    }
    setSwipingItem(null);
    setSwipeOffset(0);
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

  // Group production by stage
  const productionByStage = {
    sent_for_production: productionItems.filter(i => i.currentStage === 'sent_for_production'),
    at_production: productionItems.filter(i => i.currentStage === 'at_production'),
    production_done: productionItems.filter(i => i.currentStage === 'production_done'),
    collect_for_delivery: productionItems.filter(i => i.currentStage === 'collect_for_delivery')
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
        {/* Date + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">{format(new Date(), 'EEE, MMM d')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="default" 
              size="sm" 
              className="h-8 text-xs"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Task
            </Button>
            
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

        {/* Workflow Progress */}
        <div className="bg-background/80 rounded-lg p-2 border">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5 px-1">
            <span>WORKFLOW PROGRESS</span>
            <span>{allItems.filter(i => i.completedAt).length}/{allItems.length} complete</span>
          </div>
          <div className="flex gap-1">
            <div className="flex-1 text-center">
              <div className="bg-blue-500 text-white rounded py-1.5 px-1 mb-1">
                <p className="text-lg font-bold">{collectItems.length}</p>
              </div>
              <p className="text-[9px] text-muted-foreground">COLLECT</p>
            </div>
            <div className="flex items-center text-muted-foreground">→</div>
            <div className="flex-1 text-center">
              <div className="bg-amber-500 text-white rounded py-1.5 px-1 mb-1">
                <p className="text-lg font-bold">{productionByStage.sent_for_production.length}</p>
              </div>
              <p className="text-[9px] text-muted-foreground">SEND</p>
            </div>
            <div className="flex items-center text-muted-foreground">→</div>
            <div className="flex-1 text-center">
              <div className="bg-purple-500 text-white rounded py-1.5 px-1 mb-1">
                <p className="text-lg font-bold">{productionByStage.at_production.length}</p>
              </div>
              <p className="text-[9px] text-muted-foreground">PROD</p>
            </div>
            <div className="flex items-center text-muted-foreground">→</div>
            <div className="flex-1 text-center">
              <div className="bg-emerald-500 text-white rounded py-1.5 px-1 mb-1">
                <p className="text-lg font-bold">{productionByStage.production_done.length + productionByStage.collect_for_delivery.length}</p>
              </div>
              <p className="text-[9px] text-muted-foreground">DONE</p>
            </div>
            <div className="flex items-center text-muted-foreground">→</div>
            <div className="flex-1 text-center">
              <div className="bg-green-500 text-white rounded py-1.5 px-1 mb-1">
                <p className="text-lg font-bold">{deliverItems.length}</p>
              </div>
              <p className="text-[9px] text-muted-foreground">DELIVER</p>
            </div>
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

      {/* List View */}
      {viewMode === 'list' && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full px-2 py-2 h-auto bg-background border-b rounded-none gap-1 justify-start">
            <TabsTrigger value="collect" className="flex-1 text-xs py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              📥 Collect ({collectItems.length})
            </TabsTrigger>
            <TabsTrigger value="production" className="flex-1 text-xs py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
              🏭 Prod ({productionItems.length})
            </TabsTrigger>
            <TabsTrigger value="deliver" className="flex-1 text-xs py-2 data-[state=active]:bg-green-600 data-[state=active]:text-white">
              🚚 Deliver ({deliverItems.length})
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
                  <p className="text-sm text-muted-foreground mt-1">No pending collections</p>
                </div>
              ) : (
                Object.entries(collectByArea).map(([area, items]) => (
                  <div key={area} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1 z-10">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-bold text-sm text-blue-700 dark:text-blue-400">{area}</span>
                      <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                    </div>
                    {items.map(item => (
                      <div
                        key={item.stepId}
                        onTouchStart={(e) => handleTouchStart(e, item.stepId)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(item)}
                      >
                        <OperationsWorkflowCard
                          item={item}
                          onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                          onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                          onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onNavigate={openMaps}
                          isProcessing={processingStep === item.stepId}
                          isAdmin={isAdmin}
                          swipingItemId={swipingItem}
                          swipeOffset={swipingItem === item.stepId ? swipeOffset : 0}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </TabsContent>

            {/* PRODUCTION TAB */}
            <TabsContent value="production" className="p-3 m-0">
              {productionItems.length === 0 ? (
                <div className="text-center py-12">
                  <Factory className="h-12 w-12 text-purple-500/30 mx-auto mb-2" />
                  <p className="font-medium">No Production Tasks</p>
                </div>
              ) : (
                <>
                  {/* Sent for Production */}
                  {productionByStage.sent_for_production.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <Truck className="h-4 w-4 text-amber-600" />
                        <span className="font-bold text-sm text-amber-700 dark:text-amber-400">Sent for Production</span>
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs">
                          {productionByStage.sent_for_production.length}
                        </Badge>
                      </div>
                      {productionByStage.sent_for_production.map(item => (
                        <OperationsWorkflowCard
                          key={item.stepId}
                          item={item}
                          onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                          onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                          onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onNavigate={openMaps}
                          isProcessing={processingStep === item.stepId}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  )}

                  {/* At Production */}
                  {productionByStage.at_production.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <Factory className="h-4 w-4 text-purple-600" />
                        <span className="font-bold text-sm text-purple-700 dark:text-purple-400">At Production</span>
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs">
                          {productionByStage.at_production.length}
                        </Badge>
                      </div>
                      {productionByStage.at_production.map(item => (
                        <OperationsWorkflowCard
                          key={item.stepId}
                          item={item}
                          onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                          onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                          onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onNavigate={openMaps}
                          isProcessing={processingStep === item.stepId}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  )}

                  {/* Production Done */}
                  {productionByStage.production_done.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400">Production Done</span>
                        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs">
                          {productionByStage.production_done.length}
                        </Badge>
                      </div>
                      {productionByStage.production_done.map(item => (
                        <OperationsWorkflowCard
                          key={item.stepId}
                          item={item}
                          onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                          onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                          onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onNavigate={openMaps}
                          isProcessing={processingStep === item.stepId}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  )}

                  {/* Collection for Delivery */}
                  {productionByStage.collect_for_delivery.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1 z-10">
                        <Package className="h-4 w-4 text-cyan-600" />
                        <span className="font-bold text-sm text-cyan-700 dark:text-cyan-400">Collect for Delivery</span>
                        <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 text-xs">
                          {productionByStage.collect_for_delivery.length}
                        </Badge>
                      </div>
                      {productionByStage.collect_for_delivery.map(item => (
                        <OperationsWorkflowCard
                          key={item.stepId}
                          item={item}
                          onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                          onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                          onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                          onNavigate={openMaps}
                          isProcessing={processingStep === item.stepId}
                          isAdmin={isAdmin}
                        />
                      ))}
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
                    {items.map(item => (
                      <OperationsWorkflowCard
                        key={item.stepId}
                        item={item}
                        onStageAction={(item, nextStage) => setConfirmDialog({ open: true, item, nextStage })}
                        onEdit={(item) => setProductEditor({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                        onAssign={(item) => setAssignDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle, currentAssignee: item.assignedTo || null })}
                        onDelete={(item) => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                        onNavigate={openMaps}
                        isProcessing={processingStep === item.stepId}
                        isAdmin={isAdmin}
                      />
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
                          {item.currentStage === 'deliver' ? 'Delivered' : item.currentStage.replace(/_/g, ' ')}
                          {item.supplierName && ` - ${item.supplierName}`}
                        </p>
                        {item.completedByName && (
                          <p className="text-[10px] text-muted-foreground">
                            by {item.completedByName} • {item.completedAt && format(new Date(item.completedAt), 'MMM d, h:mm a')}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteDialog({ open: true, taskId: item.taskId, taskTitle: item.taskTitle })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      )}

      {/* Dialogs */}
      <CreateOperationsTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onTaskCreated={fetchData}
      />

      <WorkflowStageConfirmDialog
        open={confirmDialog?.open ?? false}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
        onConfirm={() => confirmDialog && handleStageTransition(confirmDialog.item, confirmDialog.nextStage)}
        item={confirmDialog?.item ?? null}
        nextStage={confirmDialog?.nextStage ?? null}
      />

      <AlertDialog open={deleteDialog?.open} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Task
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteDialog?.taskTitle}</strong>"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTask}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogAction onClick={handleAssignTask} disabled={assigning}>
              {assigning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Assign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
