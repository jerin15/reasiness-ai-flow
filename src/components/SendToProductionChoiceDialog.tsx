import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Plus, 
  Trash2, 
  Package, 
  Truck, 
  MapPin,
  User,
  ChevronDown,
  ChevronUp,
  Send,
  ArrowRight,
  Calculator,
  Users
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SendToProductionChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  onSuccess?: () => void;
}

interface ProductDraft {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  estimated_price: number | null;
}

interface WorkflowStepDraft {
  id: string;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string;
  location_address: string;
  location_notes: string;
  due_date: string;
  products: ProductDraft[];
  from_supplier_name?: string;
  from_supplier_address?: string;
}

interface OperationsUser {
  id: string;
  full_name: string | null;
  email: string;
}

const stepTypeConfig = {
  collect: {
    icon: Package,
    label: 'Collect from Supplier',
    color: 'text-blue-600 bg-blue-100 dark:bg-blue-950',
    shortLabel: 'Collect'
  },
  deliver_to_supplier: {
    icon: Truck,
    label: 'Deliver to Supplier',
    color: 'text-amber-600 bg-amber-100 dark:bg-amber-950',
    shortLabel: 'To Supplier'
  },
  deliver_to_client: {
    icon: MapPin,
    label: 'Deliver to Client',
    color: 'text-green-600 bg-green-100 dark:bg-green-950',
    shortLabel: 'To Client'
  },
  supplier_to_supplier: {
    icon: ArrowRight,
    label: 'Supplier to Supplier',
    color: 'text-purple-600 bg-purple-100 dark:bg-purple-950',
    shortLabel: 'S→S Transfer'
  }
};

export const SendToProductionChoiceDialog = ({
  open,
  onOpenChange,
  task,
  onSuccess
}: SendToProductionChoiceDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [stepsExpanded, setStepsExpanded] = useState(true);
  
  // Selection state - which teams to send to
  const [sendToEstimation, setSendToEstimation] = useState(true);
  const [sendToOperations, setSendToOperations] = useState(false);
  
  // Operations-specific form state
  const [assignedTo, setAssignedTo] = useState("__unassigned__");
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Workflow steps
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [newStepType, setNewStepType] = useState<WorkflowStepDraft['step_type']>('collect');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStepDueDate, setNewStepDueDate] = useState('');
  const [fromSupplierName, setFromSupplierName] = useState('');
  const [fromSupplierAddress, setFromSupplierAddress] = useState('');

  // Products for new step
  const [tempProductName, setTempProductName] = useState('');
  const [tempProductQty, setTempProductQty] = useState<string>('');
  const [tempProductUnit, setTempProductUnit] = useState('pcs');
  const [tempProductPrice, setTempProductPrice] = useState('');
  const [newStepProducts, setNewStepProducts] = useState<ProductDraft[]>([]);

  useEffect(() => {
    const fetchOperationsUsers = async () => {
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
    };

    if (open) {
      fetchOperationsUsers();
      setAssignedTo("__unassigned__");
      setSendToEstimation(true);
      setSendToOperations(false);
      setWorkflowSteps([]);
      if (task) {
        setDeliveryAddress(task.delivery_address || '');
        setDeliveryInstructions(task.delivery_instructions || '');
      }
    }
  }, [open, task]);

  const handleAddProduct = () => {
    if (!tempProductName.trim()) {
      toast.error('Please enter a product name');
      return;
    }
    const qty = parseFloat(tempProductQty) || 1;
    setNewStepProducts([...newStepProducts, {
      id: crypto.randomUUID(),
      product_name: tempProductName.trim(),
      quantity: qty,
      unit: tempProductUnit,
      estimated_price: tempProductPrice ? parseFloat(tempProductPrice) : null
    }]);
    setTempProductName('');
    setTempProductQty('');
    setTempProductUnit('pcs');
    setTempProductPrice('');
  };

  const handleAddStep = () => {
    if (newStepType === 'supplier_to_supplier') {
      if (!fromSupplierName.trim()) {
        toast.error('Please enter the "From" supplier name');
        return;
      }
      if (!newSupplierName.trim()) {
        toast.error('Please enter the "To" supplier name');
        return;
      }
    } else if (!newSupplierName.trim() && newStepType !== 'deliver_to_client') {
      toast.error('Please enter a supplier/location name');
      return;
    }

    const newStep: WorkflowStepDraft = {
      id: crypto.randomUUID(),
      step_type: newStepType,
      supplier_name: newSupplierName.trim(),
      location_address: newAddress.trim(),
      location_notes: newNotes.trim(),
      due_date: newStepDueDate,
      products: [...newStepProducts],
      ...(newStepType === 'supplier_to_supplier' && {
        from_supplier_name: fromSupplierName.trim(),
        from_supplier_address: fromSupplierAddress.trim()
      })
    };

    setWorkflowSteps([...workflowSteps, newStep]);
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewStepType('collect');
    setNewStepProducts([]);
    setFromSupplierName('');
    setFromSupplierAddress('');
  };

  const handleRemoveStep = (stepId: string) => {
    setWorkflowSteps(workflowSteps.filter(s => s.id !== stepId));
  };

  const handleSendToEstimationOnly = async () => {
    if (!task) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const targetTaskId = task.is_product && task.parent_task_id ? task.parent_task_id : task.id;
      const now = new Date().toISOString();

      // Get estimation user
      const { data: estimationUsers, error: estimationUsersError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'estimation')
        .limit(1);

      if (estimationUsersError) throw estimationUsersError;
      if (!estimationUsers || estimationUsers.length === 0) {
        throw new Error('No estimation user found');
      }

      const estimationUserId = estimationUsers[0].user_id as string;

      // Update task to production status and assign to estimation
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'production',
          came_from_designer_done: true,
          assigned_to: estimationUserId,
          status_changed_at: now,
          updated_at: now,
          previous_status: 'done',
          admin_removed_from_production: true,
        })
        .eq('id', targetTaskId);

      if (updateError) throw updateError;

      toast.success('Task sent to Estimation production pipeline!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error sending to estimation:', error);
      toast.error(error.message || 'Failed to send to estimation');
    } finally {
      setLoading(false);
    }
  };

  const handleSendWithOperations = async () => {
    if (!task) return;
    if (!sendToEstimation && !sendToOperations) {
      toast.error('Please select at least one destination');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const targetTaskId = task.is_product && task.parent_task_id ? task.parent_task_id : task.id;
      const now = new Date().toISOString();
      const normalizedAssignedTo = assignedTo && assignedTo !== "__unassigned__" ? assignedTo : null;

      // 1) Send to Estimation if selected
      if (sendToEstimation) {
        const { data: estimationUsers, error: estimationUsersError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'estimation')
          .limit(1);

        if (estimationUsersError) throw estimationUsersError;
        if (!estimationUsers || estimationUsers.length === 0) {
          throw new Error('No estimation user found');
        }

        const estimationUserId = estimationUsers[0].user_id as string;

        const { error: estimationUpdateError } = await supabase
          .from('tasks')
          .update({
            status: 'production',
            came_from_designer_done: true,
            assigned_to: estimationUserId,
            status_changed_at: now,
            updated_at: now,
            previous_status: 'done',
            admin_removed_from_production: true,
            delivery_address: deliveryAddress || null,
            delivery_instructions: deliveryInstructions || null,
          })
          .eq('id', targetTaskId);

        if (estimationUpdateError) throw estimationUpdateError;
      }

      // 2) Send to Operations if selected
      if (sendToOperations) {
        // Find or create operations task
        const { data: opsCandidates, error: opsCandidatesError } = await supabase
          .from('tasks')
          .select('id')
          .eq('linked_task_id', targetTaskId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (opsCandidatesError) throw opsCandidatesError;

        let operationsTaskId: string | null = opsCandidates?.[0]?.id ?? null;

        if (!operationsTaskId) {
          const { data: originalTask, error: originalTaskError } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', targetTaskId)
            .maybeSingle();

          if (originalTaskError) throw originalTaskError;
          if (!originalTask) throw new Error('Original task not found');

          const { data: createdOpsTask, error: createOpsError } = await supabase
            .from('tasks')
            .insert({
              title: originalTask.title,
              description: originalTask.description,
              client_name: originalTask.client_name,
              supplier_name: originalTask.supplier_name,
              suppliers: originalTask.suppliers,
              priority: originalTask.priority,
              due_date: originalTask.due_date,
              status: 'production',
              type: 'production',
              created_by: user.id,
              assigned_by: user.id,
              assigned_to: normalizedAssignedTo,
              linked_task_id: targetTaskId,
              status_changed_at: now,
              updated_at: now,
              came_from_designer_done: true,
              previous_status: 'done',
              delivery_address: deliveryAddress || null,
              delivery_instructions: deliveryInstructions || null,
            })
            .select('id')
            .single();

          if (createOpsError) throw createOpsError;
          operationsTaskId = createdOpsTask.id;
        } else {
          const { error: opsUpdateError } = await supabase
            .from('tasks')
            .update({
              assigned_to: normalizedAssignedTo,
              delivery_address: deliveryAddress || null,
              delivery_instructions: deliveryInstructions || null,
              updated_at: now,
            })
            .eq('id', operationsTaskId);

          if (opsUpdateError) throw opsUpdateError;
        }

        // Add workflow steps if provided
        if (workflowSteps.length > 0 && operationsTaskId) {
          await supabase.from('task_products').delete().eq('task_id', operationsTaskId);
          await supabase.from('task_workflow_steps').delete().eq('task_id', operationsTaskId);

          for (let i = 0; i < workflowSteps.length; i++) {
            const step = workflowSteps[i];

            // For S→S transfers, store FROM info in location_notes
            let locationNotes = step.location_notes || '';
            if (step.step_type === 'supplier_to_supplier' && step.from_supplier_name) {
              locationNotes = `FROM: ${step.from_supplier_name}${step.from_supplier_address ? ` (${step.from_supplier_address})` : ''}\n${locationNotes}`.trim();
            }

            const { data: insertedStep, error: stepError } = await supabase
              .from('task_workflow_steps')
              .insert({
                task_id: operationsTaskId,
                step_order: i,
                step_type: step.step_type,
                supplier_name: step.supplier_name || null,
                location_address: step.location_address || null,
                location_notes: locationNotes || null,
                due_date: step.due_date || null,
                status: 'pending',
              })
              .select()
              .single();

            if (stepError) throw stepError;

            if (step.products.length > 0 && insertedStep) {
              const productsToInsert = step.products.map((product, idx) => ({
                task_id: operationsTaskId,
                workflow_step_id: insertedStep.id,
                product_name: product.product_name,
                quantity: product.quantity,
                unit: product.unit,
                supplier_name: step.supplier_name || null,
                estimated_price: product.estimated_price,
                position: idx,
              }));

              const { error: productsError } = await supabase
                .from('task_products')
                .insert(productsToInsert);

              if (productsError) throw productsError;
            }
          }
        }

        // Send notifications to operations team
        // Get the current user's profile for the notification
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        
        const senderName = senderProfile?.full_name || 'Admin';
        const stepsSummary = workflowSteps.length > 0 
          ? `\n\n📦 Workflow Steps: ${workflowSteps.length} step(s)\n${workflowSteps.map((s, i) => {
              const config = stepTypeConfig[s.step_type];
              if (s.step_type === 'supplier_to_supplier') {
                return `  ${i + 1}. ${config.shortLabel}: ${s.from_supplier_name || 'N/A'} → ${s.supplier_name}${s.products.length > 0 ? ` (${s.products.length} products)` : ''}`;
              }
              return `  ${i + 1}. ${config.shortLabel}: ${s.supplier_name || 'Client'}${s.products.length > 0 ? ` (${s.products.length} products)` : ''}`;
            }).join('\n')}`
          : '';

        const notificationMessage = `📦 NEW OPERATIONS TASK

Task: ${task.title}
Client: ${task.client_name || 'N/A'}
Priority: ${task.priority?.toUpperCase() || 'MEDIUM'}
${deliveryAddress ? `\n📍 Delivery: ${deliveryAddress}` : ''}${stepsSummary}

Sent by: ${senderName}
${normalizedAssignedTo ? `Assigned to: ${operationsUsers.find(u => u.id === normalizedAssignedTo)?.full_name || 'Team member'}` : '⚠️ Unassigned - Please claim this task!'}`;

        if (normalizedAssignedTo) {
          // Send targeted notification to assigned user
          await supabase.from('urgent_notifications').insert({
            sender_id: user.id,
            recipient_id: normalizedAssignedTo,
            title: `📦 New Operations Task: ${task.title}`,
            message: notificationMessage,
            priority: task.priority === 'urgent' ? 'urgent' : 'high',
            is_broadcast: false,
            is_acknowledged: false
          });
        } else {
          // Send broadcast to all operations team members
          await supabase.from('urgent_notifications').insert({
            sender_id: user.id,
            recipient_id: null,
            title: `📦 New Unassigned Operations Task: ${task.title}`,
            message: notificationMessage,
            priority: 'high',
            is_broadcast: true,
            is_acknowledged: false
          });
        }
        
        // Also send a chat message notification if assigned
        if (normalizedAssignedTo) {
          await supabase.from('messages').insert({
            sender_id: user.id,
            recipient_id: normalizedAssignedTo,
            message: `📦 New production task assigned to you: "${task.title}"${workflowSteps.length > 0 ? ` with ${workflowSteps.length} workflow step(s)` : ''}`,
            message_type: 'notification'
          });
        }
      }

      const destinations = [];
      if (sendToEstimation) destinations.push('Estimation');
      if (sendToOperations) destinations.push('Operations');
      
      toast.success(`Task sent to ${destinations.join(' & ')}!`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error sending to production:', error);
      toast.error(error.message || 'Failed to send to production');
    } finally {
      setLoading(false);
    }
  };

  // If only sending to estimation (no operations), show simple confirmation
  const showOperationsForm = sendToOperations;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${showOperationsForm ? 'max-w-2xl max-h-[90vh]' : 'max-w-md'} flex flex-col overflow-hidden`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send to Production
          </DialogTitle>
          {task && (
            <p className="text-sm text-muted-foreground mt-1">
              Task: <span className="font-medium">{task.title}</span>
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
          {/* Team Selection */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">Send To:</Label>
            
            <div className="space-y-3">
              <Card 
                className={`cursor-pointer transition-all ${sendToEstimation ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                onClick={() => setSendToEstimation(!sendToEstimation)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Checkbox 
                    checked={sendToEstimation} 
                    onCheckedChange={(checked) => setSendToEstimation(!!checked)}
                  />
                  <Calculator className="h-5 w-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium">Estimation Team</p>
                    <p className="text-xs text-muted-foreground">
                      Sends directly to production pipeline without additional details
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${sendToOperations ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                onClick={() => setSendToOperations(!sendToOperations)}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Checkbox 
                    checked={sendToOperations} 
                    onCheckedChange={(checked) => setSendToOperations(!!checked)}
                  />
                  <Users className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium">Operations Team</p>
                    <p className="text-xs text-muted-foreground">
                      Requires delivery details and workflow steps
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Operations Details Form - Only shown when Operations is selected */}
          {showOperationsForm && (
            <>
              {/* Assignment */}
              <div className="grid gap-2">
                <Label>Assign To (Optional)</Label>
                <Select
                  value={assignedTo !== "__unassigned__" ? assignedTo : undefined}
                  onValueChange={setAssignedTo}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operations team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">Unassigned</SelectItem>
                    {operationsUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {user.full_name || user.email}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delivery Info */}
              <div className="space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Delivery Information
                </h3>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="deliveryAddress">Final Delivery Address</Label>
                    <Input
                      id="deliveryAddress"
                      placeholder="Client's delivery address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
                    <Textarea
                      id="deliveryInstructions"
                      placeholder="Special instructions for delivery..."
                      value={deliveryInstructions}
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
              </div>

              {/* Workflow Steps */}
              <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between px-2">
                    <span className="font-semibold flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Workflow Steps (Optional)
                      {workflowSteps.length > 0 && (
                        <Badge variant="secondary">{workflowSteps.length}</Badge>
                      )}
                    </span>
                    {stepsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-4 mt-4">
                  {/* Existing Steps */}
                  {workflowSteps.map((step, index) => {
                    const config = stepTypeConfig[step.step_type];
                    const Icon = config.icon;
                    const isS2S = step.step_type === 'supplier_to_supplier';
                    return (
                      <Card key={step.id} className="border-l-4" style={{ borderLeftColor: 'hsl(var(--primary))' }}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className={config.color}>
                                <Icon className="h-3 w-3 mr-1" />
                                {config.shortLabel}
                              </Badge>
                              <span className="font-medium">Step {index + 1}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveStep(step.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          
                          {isS2S ? (
                            <div className="space-y-2">
                              {/* FROM */}
                              <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
                                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                  <Package className="h-3 w-3" /> FROM
                                </p>
                                <p className="text-sm">{step.from_supplier_name}</p>
                                {step.from_supplier_address && (
                                  <p className="text-xs text-muted-foreground">{step.from_supplier_address}</p>
                                )}
                              </div>
                              {/* TO */}
                              <div className="bg-purple-50 dark:bg-purple-950/30 rounded p-2">
                                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1">
                                  <Truck className="h-3 w-3" /> TO
                                </p>
                                <p className="text-sm">{step.supplier_name}</p>
                                {step.location_address && (
                                  <p className="text-xs text-muted-foreground">{step.location_address}</p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm">{step.supplier_name}</p>
                              {step.location_address && (
                                <p className="text-xs text-muted-foreground">{step.location_address}</p>
                              )}
                            </>
                          )}
                          
                          {step.products.length > 0 && (
                            <div className="mt-2 bg-purple-50/50 dark:bg-purple-950/20 rounded p-2">
                              <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1 flex items-center gap-1">
                                <Package className="h-3 w-3" /> Products ({step.products.length})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {step.products.map(p => (
                                  <Badge key={p.id} variant="outline" className="text-xs">
                                    {p.product_name} ({p.quantity} {p.unit})
                                    {p.estimated_price && ` - AED ${p.estimated_price}`}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Add New Step Form */}
                  <Card className="border-dashed">
                    <CardContent className="p-4 space-y-4">
                      <div className="grid gap-2">
                        <Label>Step Type</Label>
                        <Select value={newStepType} onValueChange={(v) => setNewStepType(v as any)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(stepTypeConfig).map(([key, val]) => (
                              <SelectItem key={key} value={key}>
                                <div className="flex items-center gap-2">
                                  <val.icon className="h-4 w-4" />
                                  {val.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {newStepType === 'supplier_to_supplier' ? (
                        <>
                          {/* FROM Supplier */}
                          <div className="border rounded-lg p-3 space-y-3 bg-blue-50 dark:bg-blue-950/30">
                            <Label className="text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              Collect FROM
                            </Label>
                            <div className="grid gap-2">
                              <Input
                                placeholder="From Supplier Name"
                                value={fromSupplierName}
                                onChange={(e) => setFromSupplierName(e.target.value)}
                              />
                              <Input
                                placeholder="From Supplier Address"
                                value={fromSupplierAddress}
                                onChange={(e) => setFromSupplierAddress(e.target.value)}
                              />
                            </div>
                          </div>

                          {/* TO Supplier */}
                          <div className="border rounded-lg p-3 space-y-3 bg-purple-50 dark:bg-purple-950/30">
                            <Label className="text-purple-700 dark:text-purple-400 font-semibold flex items-center gap-2">
                              <Truck className="h-4 w-4" />
                              Deliver TO
                            </Label>
                            <div className="grid gap-2">
                              <Input
                                placeholder="To Supplier Name"
                                value={newSupplierName}
                                onChange={(e) => setNewSupplierName(e.target.value)}
                              />
                              <Input
                                placeholder="To Supplier Address"
                                value={newAddress}
                                onChange={(e) => setNewAddress(e.target.value)}
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-2">
                            <Label>{newStepType === 'deliver_to_client' ? 'Location Name' : 'Supplier Name'}</Label>
                            <Input
                              placeholder={newStepType === 'deliver_to_client' ? 'Client location' : 'Supplier name'}
                              value={newSupplierName}
                              onChange={(e) => setNewSupplierName(e.target.value)}
                            />
                          </div>

                          <div className="grid gap-2">
                            <Label>Address (Optional)</Label>
                            <Input
                              placeholder="Full address"
                              value={newAddress}
                              onChange={(e) => setNewAddress(e.target.value)}
                            />
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-2">
                          <Label>Due Date (Optional)</Label>
                          <Input
                            type="date"
                            value={newStepDueDate}
                            onChange={(e) => setNewStepDueDate(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Products for this step */}
                      <div className="border rounded-lg p-3 space-y-3 bg-purple-50/50 dark:bg-purple-950/20">
                        <Label className="text-xs font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
                          <Package className="h-3 w-3" />
                          Products for this step ({newStepProducts.length})
                        </Label>
                        
                        {/* List of added products */}
                        {newStepProducts.length > 0 && (
                          <div className="space-y-1">
                            {newStepProducts.map((p, idx) => (
                              <div key={p.id} className="flex items-center justify-between bg-background rounded px-2 py-1.5 text-sm">
                                <span>
                                  <span className="font-medium">{p.product_name}</span>
                                  <span className="text-muted-foreground ml-2">({p.quantity} {p.unit})</span>
                                  {p.estimated_price && <span className="text-muted-foreground ml-1">- AED {p.estimated_price}</span>}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={() => setNewStepProducts(newStepProducts.filter(x => x.id !== p.id))}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Add product form */}
                        <div className="flex gap-2 items-end flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <Input
                              placeholder="Product name"
                              value={tempProductName}
                              onChange={(e) => setTempProductName(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="w-16">
                            <Input
                              type="number"
                              placeholder="Qty"
                              value={tempProductQty}
                              onChange={(e) => setTempProductQty(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="w-20">
                            <Select value={tempProductUnit} onValueChange={setTempProductUnit}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pcs">pcs</SelectItem>
                                <SelectItem value="sqft">sqft</SelectItem>
                                <SelectItem value="sqm">sqm</SelectItem>
                                <SelectItem value="meters">meters</SelectItem>
                                <SelectItem value="kg">kg</SelectItem>
                                <SelectItem value="sets">sets</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-20">
                            <Input
                              type="number"
                              placeholder="Price"
                              value={tempProductPrice}
                              onChange={(e) => setTempProductPrice(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <Button type="button" size="sm" variant="outline" className="h-9" onClick={handleAddProduct}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <Button type="button" onClick={handleAddStep} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Step
                      </Button>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={showOperationsForm ? handleSendWithOperations : handleSendToEstimationOnly}
            disabled={loading || (!sendToEstimation && !sendToOperations)}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

