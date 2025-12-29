import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, ClipboardList, Loader2, User, CheckCircle, Clock, AlertTriangle, Package, Truck, Calendar, Edit2, X, Check } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WhiteboardTask {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  assignee?: { full_name: string | null; email: string } | null;
  creator?: { full_name: string | null; email: string } | null;
  completer?: { full_name: string | null; email: string } | null;
}

interface OperationsTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  client_name: string | null;
  delivery_address: string | null;
  due_date: string | null;
  created_at: string;
  assigned_to: string | null;
  assignee?: { full_name: string | null; email: string } | null;
  workflow_steps?: Array<{
    id: string;
    step_type: string;
    status: string;
    supplier_name: string | null;
  }>;
}

interface OperationsUser {
  id: string;
  full_name: string | null;
  email: string;
}

interface SupplierPendingItem {
  id: string;
  supplier_name: string;
  items_description: string;
  quantity: number | null;
  expected_date: string | null;
  notes: string | null;
  status: string;
  task_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const OperationsWhiteboard = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<WhiteboardTask[]>([]);
  const [operationsTasks, setOperationsTasks] = useState<OperationsTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [adding, setAdding] = useState(false);
  
  // Supplier tracking state
  const [supplierItems, setSupplierItems] = useState<SupplierPendingItem[]>([]);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newItemsDesc, setNewItemsDesc] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newExpectedDate, setNewExpectedDate] = useState("");
  const [newSupplierNotes, setNewSupplierNotes] = useState("");
  const [addingSupplierItem, setAddingSupplierItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SupplierPendingItem>>({});

  useEffect(() => {
    checkAuthAndFetch();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('whiteboard-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operations_whiteboard'
        },
        () => {
          fetchTasks();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'status=eq.production'
        },
        () => {
          fetchOperationsTasks();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_workflow_steps'
        },
        () => {
          fetchOperationsTasks();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'supplier_pending_items'
        },
        () => {
          fetchSupplierItems();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuthAndFetch = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      
      setCurrentUserId(user.id);
      
      // Check user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      const role = roleData?.role || '';
      setUserRole(role);
      
      // Only admins and operations can access
      if (role !== 'admin' && role !== 'operations' && role !== 'technical_head') {
        toast.error("Access denied - only admins and operations team can access this page");
        navigate('/');
        return;
      }

      await Promise.all([fetchTasks(), fetchOperationsUsers(), fetchOperationsTasks(), fetchSupplierItems()]);
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/auth');
    } finally {
      setLoading(false);
    }
  };

  const fetchSupplierItems = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_pending_items')
        .select('*')
        .order('expected_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSupplierItems((data || []) as SupplierPendingItem[]);
    } catch (error) {
      console.error('Error fetching supplier items:', error);
    }
  };

  const addSupplierItem = async () => {
    if (!newSupplierName.trim() || !newItemsDesc.trim()) {
      toast.error("Please enter supplier name and items description");
      return;
    }

    setAddingSupplierItem(true);
    try {
      const { error } = await supabase
        .from('supplier_pending_items')
        .insert({
          supplier_name: newSupplierName.trim(),
          items_description: newItemsDesc.trim(),
          quantity: newQuantity ? parseInt(newQuantity) : null,
          expected_date: newExpectedDate || null,
          notes: newSupplierNotes.trim() || null,
          created_by: currentUserId
        });

      if (error) throw error;

      toast.success("Supplier item added");
      setNewSupplierName("");
      setNewItemsDesc("");
      setNewQuantity("");
      setNewExpectedDate("");
      setNewSupplierNotes("");
      fetchSupplierItems();
    } catch (error) {
      console.error('Error adding supplier item:', error);
      toast.error("Failed to add supplier item");
    } finally {
      setAddingSupplierItem(false);
    }
  };

  const updateSupplierItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('supplier_pending_items')
        .update({
          supplier_name: editForm.supplier_name,
          items_description: editForm.items_description,
          quantity: editForm.quantity,
          expected_date: editForm.expected_date,
          notes: editForm.notes,
          status: editForm.status
        })
        .eq('id', id);

      if (error) throw error;
      toast.success("Updated successfully");
      setEditingItemId(null);
      setEditForm({});
      fetchSupplierItems();
    } catch (error) {
      console.error('Error updating supplier item:', error);
      toast.error("Failed to update");
    }
  };

  const deleteSupplierItem = async (id: string) => {
    if (!confirm('Delete this supplier tracking entry?')) return;
    try {
      const { error } = await supabase
        .from('supplier_pending_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success("Deleted");
      fetchSupplierItems();
    } catch (error) {
      console.error('Error deleting supplier item:', error);
      toast.error("Failed to delete");
    }
  };

  const startEditing = (item: SupplierPendingItem) => {
    setEditingItemId(item.id);
    setEditForm({
      supplier_name: item.supplier_name,
      items_description: item.items_description,
      quantity: item.quantity,
      expected_date: item.expected_date,
      notes: item.notes,
      status: item.status
    });
  };

  const fetchTasks = async () => {
    try {
      const { data: tasksData, error } = await supabase
        .from('operations_whiteboard' as any)
        .select('*')
        .order('is_completed', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const tasksList = (tasksData || []) as any[];
      const enrichedTasks = await Promise.all(
        tasksList.map(async (task) => {
          let assignee = null;
          let creator = null;
          let completer = null;

          if (task.assigned_to) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.assigned_to)
              .single();
            assignee = data;
          }

          if (task.created_by) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.created_by)
              .single();
            creator = data;
          }

          if (task.completed_by) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', task.completed_by)
              .single();
            completer = data;
          }

          return { ...task, assignee, creator, completer };
        })
      );

      setTasks(enrichedTasks as WhiteboardTask[]);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const fetchOperationsTasks = async () => {
    try {
      // Get operations user IDs
      const { data: opsData } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');
      
      const opsUserIds = opsData?.map(d => d.user_id) || [];

      // Fetch production tasks
      const { data: taskData, error } = await supabase
        .from('tasks')
        .select(`
          id, title, description, status, priority, client_name, 
          delivery_address, due_date, created_at, assigned_to,
          profiles:assigned_to (full_name, email)
        `)
        .eq('status', 'production')
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch workflow steps for these tasks
      if (taskData && taskData.length > 0) {
        const taskIds = taskData.map(t => t.id);
        const { data: stepsData } = await supabase
          .from('task_workflow_steps')
          .select('id, task_id, step_type, status, supplier_name')
          .in('task_id', taskIds);

        const tasksWithSteps = taskData.map(task => ({
          ...task,
          assignee: task.profiles as any,
          workflow_steps: (stepsData || []).filter(s => s.task_id === task.id)
        }));

        setOperationsTasks(tasksWithSteps);
      } else {
        setOperationsTasks([]);
      }
    } catch (error) {
      console.error('Error fetching operations tasks:', error);
    }
  };

  const fetchOperationsUsers = async () => {
    try {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles(id, full_name, email)')
        .eq('role', 'operations');
      
      if (data) {
        const users = data
          .map(d => d.profiles)
          .filter(Boolean) as OperationsUser[];
        setOperationsUsers(users);
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .insert({
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          assigned_to: selectedAssignee || null,
          created_by: currentUserId
        });

      if (error) throw error;
      
      toast.success("Task added to whiteboard");
      setNewTitle("");
      setNewDescription("");
      setSelectedAssignee("");
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error("Failed to add task");
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .update({
          is_completed: !currentStatus,
          completed_at: !currentStatus ? new Date().toISOString() : null,
          completed_by: !currentStatus ? currentUserId : null
        })
        .eq('id', taskId);

      if (error) throw error;
      toast.success(currentStatus ? "Task unmarked" : "Task completed!");
      fetchTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      toast.error("Failed to update task");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('operations_whiteboard' as any)
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      toast.success("Task deleted");
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error("Failed to delete task");
    }
  };

  const deleteProductionTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this production task?')) return;

    try {
      const nowIso = new Date().toISOString();

      const { data: baseTask, error: baseErr } = await supabase
        .from('tasks')
        .select('id, linked_task_id')
        .eq('id', taskId)
        .maybeSingle();
      if (baseErr) throw baseErr;

      const { data: reverseLinked, error: reverseErr } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_task_id', taskId)
        .is('deleted_at', null)
        .maybeSingle();
      if (reverseErr) throw reverseErr;

      const ids = Array.from(
        new Set(
          [taskId, baseTask?.linked_task_id || null, reverseLinked?.id || null].filter(Boolean) as string[]
        )
      );

      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: nowIso })
        .in('id', ids);

      if (error) throw error;
      toast.success('Production task deleted');
      fetchOperationsTasks();
    } catch (error: any) {
      console.error('Error deleting production task:', error);
      toast.error(error.message || 'Failed to delete task');
    }
  };

  const getStepProgress = (task: OperationsTask) => {
    if (!task.workflow_steps || task.workflow_steps.length === 0) return null;
    const completed = task.workflow_steps.filter(s => s.status === 'completed').length;
    const total = task.workflow_steps.length;
    return { completed, total, percent: Math.round((completed / total) * 100) };
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      default: return 'bg-green-500 text-white';
    }
  };

  const isAdmin = userRole === 'admin' || userRole === 'technical_head';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => !t.is_completed);
  const completedTasks = tasks.filter(t => t.is_completed);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto p-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-primary" />
                Operations Whiteboard
              </h1>
              <p className="text-sm text-muted-foreground">
                {pendingTasks.length} pending • {operationsTasks.length} production • {supplierItems.filter(s => s.status === 'pending').length} supplier items
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-6">
        <Tabs defaultValue="production" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="production" className="gap-2">
              <Package className="h-4 w-4" />
              Production ({operationsTasks.length})
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2">
              <Truck className="h-4 w-4" />
              Suppliers ({supplierItems.filter(s => s.status === 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="whiteboard" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Tasks ({pendingTasks.length})
            </TabsTrigger>
          </TabsList>

          {/* Production Tasks Tab */}
          <TabsContent value="production" className="space-y-4">
            {operationsTasks.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No production tasks</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tasks will appear here when created for operations
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {operationsTasks.map((task) => {
                  const progress = getStepProgress(task);
                  return (
                    <Card key={task.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={getPriorityColor(task.priority)}>
                                {task.priority}
                              </Badge>
                              {task.assignee && (
                                <Badge variant="outline" className="text-xs">
                                  <User className="h-3 w-3 mr-1" />
                                  {task.assignee.full_name || task.assignee.email}
                                </Badge>
                              )}
                            </div>
                            <h3 className="font-semibold mt-2">{task.title}</h3>
                            {task.client_name && (
                              <p className="text-sm text-muted-foreground">Client: {task.client_name}</p>
                            )}
                            {task.delivery_address && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                📍 {task.delivery_address}
                              </p>
                            )}
                          </div>
                          {progress && (
                            <div className="text-right shrink-0">
                              <div className="text-2xl font-bold text-primary">
                                {progress.percent}%
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {progress.completed}/{progress.total} steps
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Workflow Steps */}
                        {task.workflow_steps && task.workflow_steps.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Workflow Steps:</p>
                            <div className="flex flex-wrap gap-2">
                              {task.workflow_steps.map((step, idx) => (
                                <Badge 
                                  key={step.id} 
                                  variant={step.status === 'completed' ? 'default' : 'outline'}
                                  className="text-xs gap-1"
                                >
                                  {step.status === 'completed' ? (
                                    <CheckCircle className="h-3 w-3" />
                                  ) : step.status === 'in_progress' ? (
                                    <Clock className="h-3 w-3 text-yellow-500" />
                                  ) : (
                                    <span className="w-3 h-3 flex items-center justify-center text-muted-foreground">{idx + 1}</span>
                                  )}
                                  {step.step_type === 'collect' ? 'Collect' : 'Deliver'}
                                  {step.supplier_name && `: ${step.supplier_name}`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Created {format(new Date(task.created_at), 'MMM d, h:mm a')}</span>
                          <div className="flex items-center gap-2">
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Due {format(new Date(task.due_date), 'MMM d')}
                              </span>
                            )}
                            {isAdmin && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deleteProductionTask(task.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Supplier Tracking Tab */}
          <TabsContent value="suppliers" className="space-y-4">
            {/* Add Supplier Item Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Track Supplier Pending Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    placeholder="Supplier name (e.g., Alfa, Beta)..."
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                  />
                  <Input
                    placeholder="Items description..."
                    value={newItemsDesc}
                    onChange={(e) => setNewItemsDesc(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input
                    type="number"
                    placeholder="Quantity (optional)"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      placeholder="Expected date"
                      value={newExpectedDate}
                      onChange={(e) => setNewExpectedDate(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={newSupplierNotes}
                    onChange={(e) => setNewSupplierNotes(e.target.value)}
                  />
                </div>
                <Button 
                  onClick={addSupplierItem} 
                  disabled={addingSupplierItem || !newSupplierName.trim() || !newItemsDesc.trim()}
                >
                  {addingSupplierItem ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                  Add Supplier Item
                </Button>
              </CardContent>
            </Card>

            {/* Pending Supplier Items */}
            {supplierItems.filter(s => s.status === 'pending').length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Truck className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No pending supplier items</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Track items sent to suppliers above
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {supplierItems.filter(s => s.status === 'pending').map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      {editingItemId === item.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              value={editForm.supplier_name || ''}
                              onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })}
                              placeholder="Supplier name"
                            />
                            <Input
                              value={editForm.items_description || ''}
                              onChange={(e) => setEditForm({ ...editForm, items_description: e.target.value })}
                              placeholder="Items description"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Input
                              type="number"
                              value={editForm.quantity || ''}
                              onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || null })}
                              placeholder="Quantity"
                            />
                            <Input
                              type="date"
                              value={editForm.expected_date || ''}
                              onChange={(e) => setEditForm({ ...editForm, expected_date: e.target.value })}
                            />
                            <select
                              className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={editForm.status || 'pending'}
                              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            >
                              <option value="pending">Pending</option>
                              <option value="received">Received</option>
                              <option value="delayed">Delayed</option>
                            </select>
                          </div>
                          <Input
                            value={editForm.notes || ''}
                            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                            placeholder="Notes"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => updateSupplierItem(item.id)}>
                              <Check className="h-4 w-4 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditingItemId(null); setEditForm({}); }}>
                              <X className="h-4 w-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-blue-500 text-white">{item.supplier_name}</Badge>
                              {item.quantity && (
                                <Badge variant="outline">Qty: {item.quantity}</Badge>
                              )}
                            </div>
                            <h3 className="font-semibold mt-2">{item.items_description}</h3>
                            {item.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{item.notes}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              {item.expected_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Expected: {format(new Date(item.expected_date), 'MMM d, yyyy')}
                                </span>
                              )}
                              <span>Added {format(new Date(item.created_at), 'MMM d')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditing(item)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteSupplierItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Received Items */}
            {supplierItems.filter(s => s.status === 'received').length > 0 && (
              <Card className="opacity-75">
                <CardHeader>
                  <CardTitle className="text-lg text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Received Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {supplierItems.filter(s => s.status === 'received').map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <span className="font-medium">{item.supplier_name}:</span>
                          <span className="ml-2 text-muted-foreground">{item.items_description}</span>
                          {item.quantity && <span className="ml-2 text-xs">(Qty: {item.quantity})</span>}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEditing(item)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteSupplierItem(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Quick Tasks Tab (Original Whiteboard) */}
          <TabsContent value="whiteboard" className="space-y-4">
            {/* Add Task Card - Only for Admins */}
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Add Quick Task
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Task title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addTask()}
                  />
                  <Textarea
                    placeholder="Description (optional)..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-3 items-center">
                    <select
                      className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                      value={selectedAssignee}
                      onChange={(e) => setSelectedAssignee(e.target.value)}
                    >
                      <option value="">Assign to (optional)</option>
                      {operationsUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </option>
                      ))}
                    </select>
                    <Button onClick={addTask} disabled={adding || !newTitle.trim()}>
                      {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Task
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pending Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pending Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingTasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No pending tasks</p>
                ) : (
                  <div className="space-y-3">
                    {pendingTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg border"
                      >
                        <Checkbox
                          checked={task.is_completed}
                          onCheckedChange={() => toggleTask(task.id, task.is_completed)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{task.title}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {task.assignee && (
                              <Badge variant="outline" className="text-xs">
                                <User className="h-3 w-3 mr-1" />
                                {task.assignee.full_name || task.assignee.email}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Created {format(new Date(task.created_at), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <Card className="opacity-75">
                <CardHeader>
                  <CardTitle className="text-lg text-muted-foreground">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {completedTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-4 bg-muted/20 rounded-lg border opacity-60"
                      >
                        <Checkbox
                          checked={task.is_completed}
                          onCheckedChange={() => toggleTask(task.id, task.is_completed)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium line-through">{task.title}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-through">{task.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 mt-2">
                            {task.completer && (
                              <span className="text-xs text-green-600">
                                Completed by {task.completer.full_name || task.completer.email}
                              </span>
                            )}
                            {task.completed_at && (
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(task.completed_at), 'MMM d, h:mm a')}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default OperationsWhiteboard;
