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
  Map
} from 'lucide-react';
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
              isAtProduction: true
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
              isAtProduction: false
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

  const handleTouchEnd = (item: { stepId: string; supplierName?: string; clientName?: string }, type: 'collect' | 'deliver' | 'production') => {
    if (swipeOffset > 80) {
      const label = type === 'collect' ? `Collected from ${item.supplierName}` : 
                    type === 'deliver' ? 'Delivered' : 'Sent to Production';
      handleComplete(item.stepId, label);
    } else {
      setSwipingItem(null);
      setSwipeOffset(0);
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
    item: { stepId: string; supplierName?: string; clientName?: string; taskTitle: string; address?: string | null; dueDate: string | null; priority: string; products: { name: string; qty: number | null; unit: string | null; supplier?: string | null }[] },
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

    return (
      <div key={item.stepId} className="relative overflow-hidden rounded-lg mb-2">
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
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", getPriorityColor(item.priority))} />
                    <span className="font-bold text-base truncate">
                      {type === 'deliver' ? (item.clientName || item.taskTitle) : (item.supplierName || item.taskTitle)}
                    </span>
                  </div>
                  {due && (
                    <Badge variant="outline" className={cn("text-[10px] shrink-0 font-semibold", due.color)}>
                      {due.text}
                    </Badge>
                  )}
                </div>

                {/* Task/Client reference */}
                <p className="text-xs text-muted-foreground mb-2 truncate">
                  {type === 'deliver' ? item.taskTitle : item.clientName || item.taskTitle}
                </p>

                {/* Products grouped by supplier for collection */}
                {type === 'collect' ? (
                  <div className="space-y-1.5 mb-2">
                    {(() => {
                      const bySupplier: Record<string, { name: string; qty: number | null; unit: string | null }[]> = {};
                      item.products.forEach(p => {
                        const sup = p.supplier || item.supplierName || 'Unknown';
                        if (!bySupplier[sup]) bySupplier[sup] = [];
                        bySupplier[sup].push(p);
                      });
                      return Object.entries(bySupplier).map(([supplier, prods]) => (
                        <div key={supplier} className="bg-white/60 dark:bg-black/20 rounded p-1.5 border border-border/50">
                          <div className="text-[10px] font-semibold text-primary mb-1 flex items-center gap-1">
                            <Factory className="h-3 w-3" />
                            {supplier}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {prods.map((p, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] h-5">
                                {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ''})`}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {item.products.slice(0, 3).map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] h-5">
                        {p.name} {p.qty && `(${p.qty})`}
                      </Badge>
                    ))}
                    {item.products.length > 3 && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        +{item.products.length - 3} more
                      </Badge>
                    )}
                  </div>
                )}

                {extraContent}

                {/* Address + Navigate */}
                {item.address && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs justify-between mt-2"
                    onClick={() => openMaps(item.address!)}
                  >
                    <span className="truncate text-left flex-1">{item.address}</span>
                    <Navigation className="h-3 w-3 shrink-0 ml-2" />
                  </Button>
                )}

                {/* Swipe hint */}
                <p className="text-[10px] text-muted-foreground text-center mt-2 opacity-60">
                  ← Swipe right to complete →
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
                    </div>
                    {productionItems.filter(p => p.isAtProduction).map(item => (
                      <Card key={item.stepId} className="border-l-4 border-l-purple-500 bg-purple-50 dark:bg-purple-950/30 mb-2">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-purple-600 text-white text-xs">AT PRODUCTION</Badge>
                            <span className="font-medium text-sm">{item.supplierName}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{item.taskTitle}</p>
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
                    {item.completedAt && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {format(new Date(item.completedAt), 'h:mm a')}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </ScrollArea>
        </Tabs>
      )}
    </div>
  );
};
