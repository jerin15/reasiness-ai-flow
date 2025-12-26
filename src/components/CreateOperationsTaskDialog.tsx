import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Calendar,
  User,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CreateOperationsTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated?: () => void;
}

interface ProductDraft {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  supplier_name: string;
  estimated_price: number | null;
}

interface WorkflowStepDraft {
  id: string;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client';
  supplier_name: string;
  location_address: string;
  location_notes: string;
  due_date: string;
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
  }
};

export const CreateOperationsTaskDialog = ({
  open,
  onOpenChange,
  onTaskCreated
}: CreateOperationsTaskDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [stepsExpanded, setStepsExpanded] = useState(true);

  // Task form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Products draft
  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [newProductName, setNewProductName] = useState('');
  const [newProductQty, setNewProductQty] = useState<number>(1);
  const [newProductUnit, setNewProductUnit] = useState('pcs');
  const [newProductSupplier, setNewProductSupplier] = useState('');
  const [newProductPrice, setNewProductPrice] = useState<string>('');
  const [productsExpanded, setProductsExpanded] = useState(true);

  // Workflow steps draft
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [newStepType, setNewStepType] = useState<WorkflowStepDraft['step_type']>('collect');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStepDueDate, setNewStepDueDate] = useState('');

  // Fetch operations team members
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
    }
  }, [open]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setClientName('');
    setSupplierName('');
    setAssignedTo('');
    setDueDate('');
    setPriority('medium');
    setDeliveryAddress('');
    setDeliveryInstructions('');
    setWorkflowSteps([]);
    setProducts([]);
    setNewStepType('collect');
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewProductName('');
    setNewProductQty(1);
    setNewProductUnit('pcs');
    setNewProductSupplier('');
    setNewProductPrice('');
  };

  const handleAddProduct = () => {
    if (!newProductName.trim()) {
      toast.error('Please enter a product name');
      return;
    }

    const newProduct: ProductDraft = {
      id: crypto.randomUUID(),
      product_name: newProductName.trim(),
      quantity: newProductQty,
      unit: newProductUnit,
      supplier_name: newProductSupplier.trim(),
      estimated_price: newProductPrice ? parseFloat(newProductPrice) : null
    };

    setProducts([...products, newProduct]);
    setNewProductName('');
    setNewProductQty(1);
    setNewProductUnit('pcs');
    setNewProductSupplier('');
    setNewProductPrice('');
  };

  const handleRemoveProduct = (productId: string) => {
    setProducts(products.filter(p => p.id !== productId));
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
      due_date: newStepDueDate
    };

    setWorkflowSteps([...workflowSteps, newStep]);
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewStepType('collect');
  };

  const handleRemoveStep = (stepId: string) => {
    setWorkflowSteps(workflowSteps.filter(s => s.id !== stepId));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Please enter a task title');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the task with production status for operations
      const { data: newTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          client_name: clientName.trim() || null,
          supplier_name: supplierName.trim() || null,
          assigned_to: assignedTo || null,
          due_date: dueDate || null,
          priority,
          status: 'production',
          type: 'production',
          delivery_address: deliveryAddress.trim() || null,
          delivery_instructions: deliveryInstructions.trim() || null,
          created_by: user.id,
          assigned_by: user.id
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Create workflow steps if any
      if (workflowSteps.length > 0 && newTask) {
        const stepsToInsert = workflowSteps.map((step, index) => ({
          task_id: newTask.id,
          step_order: index,
          step_type: step.step_type,
          supplier_name: step.supplier_name || null,
          location_address: step.location_address || null,
          location_notes: step.location_notes || null,
          due_date: step.due_date || null,
          status: 'pending'
        }));

        const { error: stepsError } = await supabase
          .from('task_workflow_steps')
          .insert(stepsToInsert);

        if (stepsError) throw stepsError;
      }

      // Create products if any
      if (products.length > 0 && newTask) {
        const productsToInsert = products.map((product, index) => ({
          task_id: newTask.id,
          product_name: product.product_name,
          quantity: product.quantity,
          unit: product.unit,
          supplier_name: product.supplier_name || null,
          estimated_price: product.estimated_price,
          position: index
        }));

        const { error: productsError } = await supabase
          .from('task_products')
          .insert(productsToInsert);

        if (productsError) throw productsError;
      }

      toast.success('Operations task created successfully');
      resetForm();
      onOpenChange(false);
      onTaskCreated?.();
    } catch (error: any) {
      console.error('Error creating operations task:', error);
      toast.error(error.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Create Operations Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input
                id="title"
                placeholder="e.g., Collect material from ABC Suppliers"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Detailed instructions for the task..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="client">Client Name</Label>
                <Input
                  id="client"
                  placeholder="Client name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier Name</Label>
                <Input
                  id="supplier"
                  placeholder="Supplier name"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Assign To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
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
                  Workflow Steps
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
                const StepIcon = config.icon;

                return (
                  <Card key={step.id} className="relative">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                          config.color
                        )}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              <StepIcon className="h-3 w-3 mr-1" />
                              {config.shortLabel}
                            </Badge>
                            <span className="font-medium text-sm">
                              {step.supplier_name || 'Client'}
                            </span>
                          </div>
                          {step.location_address && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {step.location_address}
                            </p>
                          )}
                          {step.due_date && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due: {new Date(step.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveStep(step.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Add New Step Form */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>Step Type</Label>
                      <Select 
                        value={newStepType} 
                        onValueChange={(v: any) => setNewStepType(v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collect">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-blue-600" />
                              Collect from Supplier
                            </div>
                          </SelectItem>
                          <SelectItem value="deliver_to_supplier">
                            <div className="flex items-center gap-2">
                              <Truck className="h-4 w-4 text-amber-600" />
                              Deliver to Supplier
                            </div>
                          </SelectItem>
                          <SelectItem value="deliver_to_client">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-green-600" />
                              Deliver to Client
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>
                        {newStepType === 'deliver_to_client' ? 'Location Name' : 'Supplier Name'}
                      </Label>
                      <Input
                        placeholder={newStepType === 'deliver_to_client' ? 'e.g., Client Office' : 'e.g., ABC Suppliers'}
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Address</Label>
                      <Input
                        placeholder="Full address"
                        value={newAddress}
                        onChange={(e) => setNewAddress(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Notes (optional)</Label>
                      <Input
                        placeholder="Contact person, timing, etc."
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Step Due Date</Label>
                      <Input
                        type="date"
                        value={newStepDueDate}
                        onChange={(e) => setNewStepDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddStep}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Products Section */}
          <Collapsible open={productsExpanded} onOpenChange={setProductsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2">
                <span className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Products
                  {products.length > 0 && (
                    <Badge variant="secondary">{products.length}</Badge>
                  )}
                </span>
                {productsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 mt-4">
              {/* Existing Products */}
              {products.map((product, index) => (
                <Card key={product.id} className="relative">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{product.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.quantity} {product.unit}
                          {product.supplier_name && ` • ${product.supplier_name}`}
                          {product.estimated_price && ` • AED ${product.estimated_price}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveProduct(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add New Product Form */}
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-3">
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <Label>Product Name</Label>
                      <Input
                        placeholder="e.g., Vinyl Banner"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-2">
                        <Label>Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          value={newProductQty}
                          onChange={(e) => setNewProductQty(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Unit</Label>
                        <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                          <SelectTrigger>
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
                      <div className="grid gap-2">
                        <Label>Est. Price</Label>
                        <Input
                          type="number"
                          placeholder="AED"
                          value={newProductPrice}
                          onChange={(e) => setNewProductPrice(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Supplier Name</Label>
                      <Input
                        placeholder="e.g., ABC Suppliers"
                        value={newProductSupplier}
                        onChange={(e) => setNewProductSupplier(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddProduct}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
