import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package, 
  Truck, 
  MapPin, 
  Check, 
  User,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  Factory,
  History,
  Calendar,
  Filter,
  Phone,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Navigation
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Product {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
}

interface TaskData {
  id: string;
  title: string;
  client_name: string | null;
  due_date: string | null;
  priority: string;
  delivery_address: string | null;
  delivery_instructions: string | null;
  assigned_to: string | null;
  products: Product[];
  workflow_steps: {
    id: string;
    step_type: string;
    supplier_name: string | null;
    status: string;
    location_address: string | null;
    location_notes: string | null;
    due_date: string | null;
    completed_at: string | null;
  }[];
}

interface SimpleOperationsViewProps {
  userId: string;
  userName: string;
  isAdmin?: boolean;
  onRefresh?: () => void;
  operationsUsers?: Array<{ id: string; full_name: string | null; email: string }>;
}

type TabType = 'collect' | 'production' | 'deliver' | 'history';

export const SimpleOperationsView = ({ 
  userId, 
  userName,
  isAdmin = false,
  onRefresh,
  operationsUsers = []
}: SimpleOperationsViewProps) => {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('collect');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all production tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, client_name, due_date, priority, delivery_address, delivery_instructions, assigned_to')
        .eq('status', 'production')
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (tasksError) throw tasksError;
      if (!tasksData || tasksData.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      const taskIds = tasksData.map(t => t.id);

      // Fetch workflow steps for all tasks
      const { data: stepsData } = await supabase
        .from('task_workflow_steps')
        .select('*')
        .in('task_id', taskIds)
        .order('step_order', { ascending: true });

      // Fetch products for all tasks
      const { data: productsData } = await supabase
        .from('task_products')
        .select('id, task_id, product_name, quantity, unit, supplier_name')
        .in('task_id', taskIds);

      // Group steps and products by task
      const stepsMap: Record<string, any[]> = {};
      const productsMap: Record<string, Product[]> = {};

      (stepsData || []).forEach(step => {
        if (!stepsMap[step.task_id]) stepsMap[step.task_id] = [];
        stepsMap[step.task_id].push(step);
      });

      (productsData || []).forEach(product => {
        if (!productsMap[product.task_id]) productsMap[product.task_id] = [];
        productsMap[product.task_id].push(product);
      });

      const enrichedTasks: TaskData[] = tasksData.map(task => ({
        ...task,
        products: productsMap[task.id] || [],
        workflow_steps: stepsMap[task.id] || []
      }));

      setTasks(enrichedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('ops-tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_workflow_steps' }, () => fetchTasks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_products' }, () => fetchTasks())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  // Mark step as completed
  const handleCompleteStep = async (stepId: string, actionLabel: string) => {
    setUpdatingStep(stepId);
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
      toast.success(`✓ ${actionLabel}!`);
      fetchTasks();
      onRefresh?.();
    } catch (error: any) {
      console.error('Error completing step:', error);
      toast.error('Failed to update');
    } finally {
      setUpdatingStep(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Address copied!');
  };

  const openInMaps = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Filter tasks by team member if admin
  const filteredTasks = isAdmin && teamFilter !== 'all'
    ? tasks.filter(t => t.assigned_to === teamFilter)
    : tasks;

  // ======= CATEGORIZE TASKS =======
  // COLLECT: Tasks with pending collect or S→S steps
  const collectTasks = filteredTasks.filter(task => 
    task.workflow_steps.some(s => 
      (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && 
      s.status === 'pending'
    )
  );

  // PRODUCTION: Tasks with pending deliver_to_supplier OR completed S→S (at production)
  const productionTasks = filteredTasks.filter(task =>
    task.workflow_steps.some(s =>
      (s.step_type === 'deliver_to_supplier' && s.status === 'pending') ||
      (s.step_type === 'supplier_to_supplier' && s.status === 'completed')
    )
  );

  // DELIVER: Tasks with pending deliver_to_client steps
  const deliverTasks = filteredTasks.filter(task =>
    task.workflow_steps.some(s => 
      s.step_type === 'deliver_to_client' && s.status === 'pending'
    )
  );

  // HISTORY: All completed steps
  const historyTasks = filteredTasks.filter(task =>
    task.workflow_steps.some(s => s.status === 'completed')
  );

  // ======= RENDER FUNCTIONS =======

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, { color: string; label: string }> = {
      urgent: { color: 'bg-red-600 text-white', label: '🔴 URGENT' },
      high: { color: 'bg-orange-500 text-white', label: '🟠 HIGH' },
      medium: { color: 'bg-blue-500 text-white', label: '🔵 MEDIUM' },
      low: { color: 'bg-gray-400 text-white', label: '⚪ LOW' }
    };
    const c = config[priority] || config.medium;
    return <Badge className={cn("text-xs font-bold", c.color)}>{c.label}</Badge>;
  };

  const getDueDateDisplay = (dueDate: string | null) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const isOverdue = isPast(date) && !isToday(date);
    const isDueToday = isToday(date);
    const isDueTomorrow = isTomorrow(date);

    return (
      <div className={cn(
        "flex items-center gap-1 text-sm font-medium",
        isOverdue && "text-red-600",
        isDueToday && !isOverdue && "text-orange-600",
        isDueTomorrow && "text-blue-600"
      )}>
        <Clock className="h-4 w-4" />
        {isOverdue ? '⚠️ OVERDUE - ' : isDueToday ? '📅 TODAY - ' : isDueTomorrow ? '📅 Tomorrow - ' : '📅 '}
        {format(date, 'MMM d, yyyy')}
      </div>
    );
  };

  // Get suppliers involved in collections
  const getCollectionSuppliers = (task: TaskData) => {
    const collectSteps = task.workflow_steps.filter(s => 
      (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && 
      s.status === 'pending'
    );
    return collectSteps.map(s => ({
      stepId: s.id,
      supplierName: s.supplier_name || 'Unknown Supplier',
      address: s.location_address,
      stepType: s.step_type,
      notes: s.location_notes
    }));
  };

  // Get products grouped by supplier
  const getProductsBySupplier = (task: TaskData) => {
    const grouped: Record<string, Product[]> = {};
    task.products.forEach(p => {
      const supplier = p.supplier_name || 'No Supplier';
      if (!grouped[supplier]) grouped[supplier] = [];
      grouped[supplier].push(p);
    });
    return grouped;
  };

  const renderTaskCard = (task: TaskData, tabType: TabType) => {
    const isExpanded = expandedTasks.has(task.id);
    const productsBySupplier = getProductsBySupplier(task);
    const collectionSuppliers = getCollectionSuppliers(task);

    // Get relevant steps for this tab
    const relevantSteps = task.workflow_steps.filter(s => {
      if (tabType === 'collect') {
        return (s.step_type === 'collect' || s.step_type === 'supplier_to_supplier') && s.status === 'pending';
      } else if (tabType === 'production') {
        return (s.step_type === 'deliver_to_supplier' && s.status === 'pending') ||
               (s.step_type === 'supplier_to_supplier' && s.status === 'completed');
      } else if (tabType === 'deliver') {
        return s.step_type === 'deliver_to_client' && s.status === 'pending';
      }
      return s.status === 'completed';
    });

    const borderColor = tabType === 'collect' ? 'border-l-blue-500' : 
                        tabType === 'production' ? 'border-l-amber-500' : 
                        tabType === 'deliver' ? 'border-l-green-500' : 'border-l-gray-400';

    const bgColor = tabType === 'collect' ? 'bg-blue-50/50 dark:bg-blue-950/20' : 
                    tabType === 'production' ? 'bg-amber-50/50 dark:bg-amber-950/20' : 
                    tabType === 'deliver' ? 'bg-green-50/50 dark:bg-green-950/20' : 'bg-gray-50/50';

    return (
      <Card key={task.id} className={cn("border-l-4 overflow-hidden", borderColor, bgColor)}>
        <CardHeader className="p-4 pb-2">
          {/* Priority + Due Date Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            {getPriorityBadge(task.priority)}
            {getDueDateDisplay(task.due_date)}
          </div>

          {/* Task Title */}
          <h3 className="font-bold text-lg leading-tight">{task.title}</h3>

          {/* Client Name */}
          {task.client_name && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Building2 className="h-4 w-4" />
              Client: <span className="font-medium text-foreground">{task.client_name}</span>
            </p>
          )}
        </CardHeader>

        <CardContent className="p-4 pt-2 space-y-4">
          {/* ALL PRODUCTS - Always Show */}
          <div className="bg-white dark:bg-background rounded-lg border p-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              Products ({task.products.length})
            </h4>
            {task.products.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No products listed</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(productsBySupplier).map(([supplier, products]) => (
                  <div key={supplier} className="space-y-1">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">
                      {supplier}
                    </p>
                    {products.map((product, idx) => (
                      <div key={product.id || idx} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                        <span className="font-medium">{product.product_name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {product.quantity || '?'} {product.unit || 'pcs'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SUPPLIERS TO COLLECT FROM (for collect tab) */}
          {tabType === 'collect' && collectionSuppliers.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-blue-600" />
                Collect From ({collectionSuppliers.length} suppliers)
              </h4>
              {collectionSuppliers.map((supplier, idx) => (
                <div key={supplier.stepId} className="bg-blue-100/50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-base">{supplier.supplierName}</span>
                    {supplier.stepType === 'supplier_to_supplier' && (
                      <Badge className="bg-purple-600 text-white text-xs">S→S Transfer</Badge>
                    )}
                  </div>
                  
                  {supplier.address && (
                    <div className="flex items-start gap-2 mb-2">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{supplier.address}</span>
                    </div>
                  )}

                  {supplier.address && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => copyToClipboard(supplier.address!)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Address
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => openInMaps(supplier.address!)}
                      >
                        <Navigation className="h-3 w-3 mr-1" />
                        Navigate
                      </Button>
                    </div>
                  )}

                  {/* Action Button */}
                  <Button
                    className="w-full mt-3 h-11 text-base font-bold bg-blue-600 hover:bg-blue-700"
                    disabled={updatingStep === supplier.stepId}
                    onClick={() => handleCompleteStep(supplier.stepId, `Collected from ${supplier.supplierName}`)}
                  >
                    {updatingStep === supplier.stepId ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        ✓ COLLECTED FROM {supplier.supplierName.toUpperCase()}
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* PRODUCTION STEPS (for production tab) */}
          {tabType === 'production' && relevantSteps.length > 0 && (
            <div className="space-y-3">
              {relevantSteps.map(step => {
                const isAtProduction = step.step_type === 'supplier_to_supplier' && step.status === 'completed';
                
                return (
                  <div 
                    key={step.id} 
                    className={cn(
                      "rounded-lg p-3 border",
                      isAtProduction ? "bg-purple-100/50 border-purple-200" : "bg-amber-100/50 border-amber-200"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-base">
                        {step.supplier_name || 'Unknown Supplier'}
                      </span>
                      {isAtProduction ? (
                        <Badge className="bg-purple-600 text-white text-xs">
                          <Factory className="h-3 w-3 mr-1" />
                          AT PRODUCTION
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-600 text-white text-xs">
                          SEND TO PRODUCTION
                        </Badge>
                      )}
                    </div>

                    {step.location_address && (
                      <div className="flex items-start gap-2 mb-2">
                        <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="text-sm">{step.location_address}</span>
                      </div>
                    )}

                    {!isAtProduction && (
                      <Button
                        className="w-full mt-2 h-11 text-base font-bold bg-amber-600 hover:bg-amber-700"
                        disabled={updatingStep === step.id}
                        onClick={() => handleCompleteStep(step.id, `Sent to ${step.supplier_name}`)}
                      >
                        {updatingStep === step.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <Check className="h-5 w-5 mr-2" />
                            ✓ SENT TO PRODUCTION
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* DELIVERY SECTION (for deliver tab) */}
          {tabType === 'deliver' && (
            <div className="space-y-3">
              <div className="bg-green-100/50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200">
                <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                  <Truck className="h-4 w-4 text-green-600" />
                  Delivery Details
                </h4>
                
                {task.delivery_address ? (
                  <>
                    <div className="flex items-start gap-2 mb-2">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium">{task.delivery_address}</span>
                    </div>
                    <div className="flex gap-2 mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => copyToClipboard(task.delivery_address!)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Address
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => openInMaps(task.delivery_address!)}
                      >
                        <Navigation className="h-3 w-3 mr-1" />
                        Navigate
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground italic mb-2">No delivery address set</p>
                )}

                {task.delivery_instructions && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded p-2 mb-3">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-1">📝 Instructions:</p>
                    <p className="text-sm">{task.delivery_instructions}</p>
                  </div>
                )}

                {relevantSteps.map(step => (
                  <Button
                    key={step.id}
                    className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700"
                    disabled={updatingStep === step.id}
                    onClick={() => handleCompleteStep(step.id, 'Delivered')}
                  >
                    {updatingStep === step.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        ✓ DELIVERED TO CLIENT
                      </>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* HISTORY VIEW */}
          {tabType === 'history' && (
            <div className="space-y-2">
              {task.workflow_steps.filter(s => s.status === 'completed').map(step => (
                <div key={step.id} className="flex items-center justify-between bg-muted/50 rounded p-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">
                      {step.step_type === 'collect' ? 'Collected' : 
                       step.step_type === 'deliver_to_client' ? 'Delivered' : 
                       step.step_type === 'supplier_to_supplier' ? 'S→S Transfer' : 'To Supplier'}
                      {step.supplier_name && ` - ${step.supplier_name}`}
                    </span>
                  </div>
                  {step.completed_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(step.completed_at), 'MMM d, h:mm a')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground mt-2">Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-primary/10 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </h2>
          <Button variant="ghost" size="icon" onClick={fetchTasks}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-blue-100 dark:bg-blue-950/50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{collectTasks.length}</p>
            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">📥 COLLECT</p>
          </div>
          <div className="bg-amber-100 dark:bg-amber-950/50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{productionTasks.length}</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">🏭 PRODUCTION</p>
          </div>
          <div className="bg-green-100 dark:bg-green-950/50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{deliverTasks.length}</p>
            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium">🚚 DELIVER</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800/50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{tasks.length}</p>
            <p className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">📋 TOTAL</p>
          </div>
        </div>
      </div>

      {/* Admin Filter */}
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
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start px-2 py-2 h-auto bg-background border-b rounded-none gap-1">
          <TabsTrigger 
            value="collect" 
            className="flex-1 text-xs px-2 py-2.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            📥 Collect ({collectTasks.length})
          </TabsTrigger>
          <TabsTrigger 
            value="production" 
            className="flex-1 text-xs px-2 py-2.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white"
          >
            🏭 Prod ({productionTasks.length})
          </TabsTrigger>
          <TabsTrigger 
            value="deliver" 
            className="flex-1 text-xs px-2 py-2.5 data-[state=active]:bg-green-600 data-[state=active]:text-white"
          >
            🚚 Deliver ({deliverTasks.length})
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="flex-1 text-xs px-2 py-2.5 data-[state=active]:bg-gray-600 data-[state=active]:text-white"
          >
            📋 History
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          <TabsContent value="collect" className="p-4 space-y-4 m-0">
            {collectTasks.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-16 w-16 text-green-500/50 mx-auto mb-3" />
                <p className="font-medium text-lg">All Collected! 🎉</p>
                <p className="text-sm text-muted-foreground mt-1">No pending collections</p>
              </div>
            ) : (
              collectTasks.map(task => renderTaskCard(task, 'collect'))
            )}
          </TabsContent>

          <TabsContent value="production" className="p-4 space-y-4 m-0">
            {productionTasks.length === 0 ? (
              <div className="text-center py-12">
                <Factory className="h-16 w-16 text-amber-500/30 mx-auto mb-3" />
                <p className="font-medium text-lg">Nothing for Production</p>
                <p className="text-sm text-muted-foreground mt-1">No items to send or track</p>
              </div>
            ) : (
              productionTasks.map(task => renderTaskCard(task, 'production'))
            )}
          </TabsContent>

          <TabsContent value="deliver" className="p-4 space-y-4 m-0">
            {deliverTasks.length === 0 ? (
              <div className="text-center py-12">
                <Truck className="h-16 w-16 text-green-500/30 mx-auto mb-3" />
                <p className="font-medium text-lg">No Deliveries Pending</p>
                <p className="text-sm text-muted-foreground mt-1">All items delivered</p>
              </div>
            ) : (
              deliverTasks.map(task => renderTaskCard(task, 'deliver'))
            )}
          </TabsContent>

          <TabsContent value="history" className="p-4 space-y-4 m-0">
            {historyTasks.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-16 w-16 text-muted-foreground/30 mx-auto mb-3" />
                <p className="font-medium text-lg">No History Yet</p>
                <p className="text-sm text-muted-foreground mt-1">Completed actions appear here</p>
              </div>
            ) : (
              historyTasks.map(task => renderTaskCard(task, 'history'))
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
