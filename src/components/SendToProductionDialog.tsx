import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  ArrowRight
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface SendToProductionDialogProps {
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
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client';
  supplier_name: string;
  location_address: string;
  location_notes: string;
  due_date: string;
  products: ProductDraft[];
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

export const SendToProductionDialog = ({
  open,
  onOpenChange,
  task,
  onSuccess
}: SendToProductionDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  // Form state - pre-populated from task
  const [assignedTo, setAssignedTo] = useState<string>("__unassigned__");
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Workflow steps
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [newStepType, setNewStepType] = useState<WorkflowStepDraft['step_type']>('collect');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStepDueDate, setNewStepDueDate] = useState('');

  // Products for new step
  const [tempProductName, setTempProductName] = useState('');
  const [tempProductQty, setTempProductQty] = useState<number>(1);
  const [tempProductUnit, setTempProductUnit] = useState('pcs');
  const [tempProductPrice, setTempProductPrice] = useState('');
  const [newStepProducts, setNewStepProducts] = useState<ProductDraft[]>([]);

  // Fetch operations users
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
      // Pre-populate from task
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
    setNewStepProducts([...newStepProducts, {
      id: crypto.randomUUID(),
      product_name: tempProductName.trim(),
      quantity: tempProductQty,
      unit: tempProductUnit,
      estimated_price: tempProductPrice ? parseFloat(tempProductPrice) : null
    }]);
    setTempProductName('');
    setTempProductQty(1);
    setTempProductUnit('pcs');
    setTempProductPrice('');
  };

  const handleAddStep = () => {
    if (!newSupplierName.trim() && newStepType !== 'deliver_to_client') {
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
      products: [...newStepProducts]
    };

    setWorkflowSteps([...workflowSteps, newStep]);
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewStepType('collect');
    setNewStepProducts([]);
  };

  const handleRemoveStep = (stepId: string) => {
    setWorkflowSteps(workflowSteps.filter(s => s.id !== stepId));
  };

  const handleSend = async () => {
    if (!task) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const targetTaskId = task.is_product && task.parent_task_id ? task.parent_task_id : task.id;
      const now = new Date().toISOString();

      const normalizedAssignedTo =
        assignedTo && assignedTo !== "__unassigned__" ? assignedTo : null;

      // 1) Send original task to Estimation (same as before)
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

      // 2) Ensure Operations task exists, then apply Operations-specific details
      // Try to find the latest linked operations task (in case duplicates exist, we only update the newest)
      const { data: opsCandidates, error: opsCandidatesError } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_task_id', targetTaskId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (opsCandidatesError) throw opsCandidatesError;

      let operationsTaskId: string | null = opsCandidates?.[0]?.id ?? null;

      // If not created automatically yet, create it ourselves (single-attempt) 
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

      // 3) Replace workflow steps/products for operations task (if provided)
      if (workflowSteps.length > 0 && operationsTaskId) {
        // Clear any existing workflow artifacts to prevent duplication on resend
        await supabase.from('task_products').delete().eq('task_id', operationsTaskId);
        await supabase.from('task_workflow_steps').delete().eq('task_id', operationsTaskId);

        for (let i = 0; i < workflowSteps.length; i++) {
          const step = workflowSteps[i];

          const { data: insertedStep, error: stepError } = await supabase
            .from('task_workflow_steps')
            .insert({
              task_id: operationsTaskId,
              step_order: i,
              step_type: step.step_type,
              supplier_name: step.supplier_name || null,
              location_address: step.location_address || null,
              location_notes: step.location_notes || null,
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

      toast.success('Task sent to Estimation & Operations production!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error sending to production:', error);
      toast.error(error.message || 'Failed to send to production');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send to Operations Team
          </DialogTitle>
          {task && (
            <p className="text-sm text-muted-foreground mt-1">
              Task: <span className="font-medium">{task.title}</span>
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
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
                      <p className="text-sm">{step.supplier_name || 'Client'}</p>
                      {step.location_address && (
                        <p className="text-xs text-muted-foreground">{step.location_address}</p>
                      )}
                      {step.products.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">Products:</p>
                          {step.products.map(p => (
                            <Badge key={p.id} variant="outline" className="mr-1 mt-1">
                              {p.product_name} x{p.quantity}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

              {/* Add New Step Form */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Workflow Step
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Step Type</Label>
                      <Select value={newStepType} onValueChange={(v: any) => setNewStepType(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collect">Collect from Supplier</SelectItem>
                          <SelectItem value="deliver_to_supplier">Deliver to Supplier</SelectItem>
                          <SelectItem value="deliver_to_client">Deliver to Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Supplier/Location Name</Label>
                      <Input
                        placeholder="e.g., ABC Suppliers"
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>Address</Label>
                    <Input
                      placeholder="Location address"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Notes</Label>
                      <Input
                        placeholder="Special instructions"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={newStepDueDate}
                        onChange={(e) => setNewStepDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Products for this step */}
                  <div className="border-t pt-4 mt-4">
                    <h5 className="text-sm font-medium mb-2">Products for this step</h5>
                    {newStepProducts.map(p => (
                      <Badge key={p.id} variant="secondary" className="mr-1 mb-1">
                        {p.product_name} x{p.quantity}
                        <button 
                          className="ml-1 text-destructive"
                          onClick={() => setNewStepProducts(newStepProducts.filter(x => x.id !== p.id))}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                    
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <Input
                        placeholder="Product name"
                        value={tempProductName}
                        onChange={(e) => setTempProductName(e.target.value)}
                      />
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={tempProductQty}
                        onChange={(e) => setTempProductQty(parseInt(e.target.value) || 1)}
                      />
                      <Input
                        placeholder="Unit"
                        value={tempProductUnit}
                        onChange={(e) => setTempProductUnit(e.target.value)}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={handleAddProduct}>
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
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={loading}>
            {loading ? 'Sending...' : 'Send to Operations'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
