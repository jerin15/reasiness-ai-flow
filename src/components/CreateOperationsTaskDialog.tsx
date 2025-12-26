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
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowRight
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

// Product being drafted for new step
interface NewStepProduct {
  product_name: string;
  quantity: number;
  unit: string;
  estimated_price: string;
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

  // Workflow steps draft (now includes products inside each step)
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepDraft[]>([]);
  const [newStepType, setNewStepType] = useState<WorkflowStepDraft['step_type']>('collect');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newStepDueDate, setNewStepDueDate] = useState('');
  
  // Products being drafted for the new step
  const [newStepProducts, setNewStepProducts] = useState<NewStepProduct[]>([]);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [tempProductName, setTempProductName] = useState('');
  const [tempProductQty, setTempProductQty] = useState<number>(1);
  const [tempProductUnit, setTempProductUnit] = useState('pcs');
  const [tempProductPrice, setTempProductPrice] = useState('');

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
    setNewStepType('collect');
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewStepProducts([]);
    setShowNewProductForm(false);
    setTempProductName('');
    setTempProductQty(1);
    setTempProductUnit('pcs');
    setTempProductPrice('');
  };

  const handleAddTempProduct = () => {
    if (!tempProductName.trim()) {
      toast.error('Please enter a product name');
      return;
    }
    setNewStepProducts([...newStepProducts, {
      product_name: tempProductName.trim(),
      quantity: tempProductQty,
      unit: tempProductUnit,
      estimated_price: tempProductPrice
    }]);
    setTempProductName('');
    setTempProductQty(1);
    setTempProductUnit('pcs');
    setTempProductPrice('');
    setShowNewProductForm(false);
  };

  const handleRemoveTempProduct = (index: number) => {
    setNewStepProducts(newStepProducts.filter((_, i) => i !== index));
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
      products: newStepProducts.map(p => ({
        id: crypto.randomUUID(),
        product_name: p.product_name,
        quantity: p.quantity,
        unit: p.unit,
        estimated_price: p.estimated_price ? parseFloat(p.estimated_price) : null
      }))
    };

    setWorkflowSteps([...workflowSteps, newStep]);
    setNewSupplierName('');
    setNewAddress('');
    setNewNotes('');
    setNewStepDueDate('');
    setNewStepType('collect');
    setNewStepProducts([]);
    setShowNewProductForm(false);
  };

  const handleRemoveStep = (stepId: string) => {
    setWorkflowSteps(workflowSteps.filter(s => s.id !== stepId));
  };

  const handleAddProductToStep = (stepId: string, product: Omit<ProductDraft, 'id'>) => {
    setWorkflowSteps(workflowSteps.map(step => {
      if (step.id === stepId) {
        return {
          ...step,
          products: [...step.products, { ...product, id: crypto.randomUUID() }]
        };
      }
      return step;
    }));
  };

  const handleRemoveProductFromStep = (stepId: string, productId: string) => {
    setWorkflowSteps(workflowSteps.map(step => {
      if (step.id === stepId) {
        return {
          ...step,
          products: step.products.filter(p => p.id !== productId)
        };
      }
      return step;
    }));
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

      // Create workflow steps and their products
      if (workflowSteps.length > 0 && newTask) {
        for (let i = 0; i < workflowSteps.length; i++) {
          const step = workflowSteps[i];
          
          // Insert workflow step
          const { data: insertedStep, error: stepError } = await supabase
            .from('task_workflow_steps')
            .insert({
              task_id: newTask.id,
              step_order: i,
              step_type: step.step_type,
              supplier_name: step.supplier_name || null,
              location_address: step.location_address || null,
              location_notes: step.location_notes || null,
              due_date: step.due_date || null,
              status: 'pending'
            })
            .select()
            .single();

          if (stepError) throw stepError;

          // Insert products linked to this step
          if (step.products.length > 0 && insertedStep) {
            const productsToInsert = step.products.map((product, idx) => ({
              task_id: newTask.id,
              workflow_step_id: insertedStep.id,
              product_name: product.product_name,
              quantity: product.quantity,
              unit: product.unit,
              supplier_name: step.supplier_name || null,
              estimated_price: product.estimated_price,
              position: idx
            }));

            const { error: productsError } = await supabase
              .from('task_products')
              .insert(productsToInsert);

            if (productsError) throw productsError;
          }
        }
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
      <DialogContent className="max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Create Operations Task
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
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

          {/* Workflow Steps with Products inside */}
          <Collapsible open={stepsExpanded} onOpenChange={setStepsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2">
                <span className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Workflow Steps (with Products)
                  {workflowSteps.length > 0 && (
                    <Badge variant="secondary">{workflowSteps.length}</Badge>
                  )}
                </span>
                {stepsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 mt-4">
              {/* Existing Steps */}
              {workflowSteps.map((step, index) => (
                <WorkflowStepCard
                  key={step.id}
                  step={step}
                  index={index}
                  onRemove={() => handleRemoveStep(step.id)}
                  onAddProduct={(product) => handleAddProductToStep(step.id, product)}
                  onRemoveProduct={(productId) => handleRemoveProductFromStep(step.id, productId)}
                />
              ))}

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

                  {/* Products Section for new step */}
                  <div className="border-t pt-3 mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4" />
                        Products for this step ({newStepProducts.length})
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setShowNewProductForm(!showNewProductForm)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Product
                      </Button>
                    </div>

                    {/* List of products added to new step */}
                    {newStepProducts.length > 0 && (
                      <div className="space-y-1">
                        {newStepProducts.map((product, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2 text-sm">
                            <span>
                              {idx + 1}. {product.product_name} ({product.quantity} {product.unit})
                              {product.estimated_price && ` - AED ${product.estimated_price}`}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveTempProduct(idx)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add product form */}
                    {showNewProductForm && (
                      <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-dashed">
                        <Input
                          placeholder="Product name"
                          value={tempProductName}
                          onChange={(e) => setTempProductName(e.target.value)}
                          className="h-9"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={tempProductQty}
                            onChange={(e) => setTempProductQty(parseInt(e.target.value) || 1)}
                            className="h-9"
                            placeholder="Qty"
                          />
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
                          <Input
                            type="number"
                            placeholder="Price (AED)"
                            value={tempProductPrice}
                            onChange={(e) => setTempProductPrice(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" className="flex-1 h-8" onClick={handleAddTempProduct}>
                            Add Product
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setShowNewProductForm(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleAddStep}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step {newStepProducts.length > 0 && `(${newStepProducts.length} products)`}
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

// Workflow Step Card with Products inside
interface WorkflowStepCardProps {
  step: WorkflowStepDraft;
  index: number;
  onRemove: () => void;
  onAddProduct: (product: Omit<ProductDraft, 'id'>) => void;
  onRemoveProduct: (productId: string) => void;
}

const WorkflowStepCard = ({ step, index, onRemove, onAddProduct, onRemoveProduct }: WorkflowStepCardProps) => {
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productName, setProductName] = useState('');
  const [productQty, setProductQty] = useState<number>(1);
  const [productUnit, setProductUnit] = useState('pcs');
  const [productPrice, setProductPrice] = useState<string>('');

  const config = stepTypeConfig[step.step_type];
  const StepIcon = config.icon;

  const handleAddProduct = () => {
    if (!productName.trim()) {
      toast.error('Please enter a product name');
      return;
    }
    onAddProduct({
      product_name: productName.trim(),
      quantity: productQty,
      unit: productUnit,
      estimated_price: productPrice ? parseFloat(productPrice) : null
    });
    setProductName('');
    setProductQty(1);
    setProductUnit('pcs');
    setProductPrice('');
    setShowAddProduct(false);
  };

  return (
    <Card className="relative">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
            config.color
          )}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">
                <StepIcon className="h-3 w-3 mr-1" />
                {config.shortLabel}
              </Badge>
              <span className="font-medium text-sm">
                {step.supplier_name || 'Client'}
              </span>
            </div>
            
            {step.location_address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {step.location_address}
              </p>
            )}
            
            {step.due_date && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Due: {new Date(step.due_date).toLocaleDateString()}
              </p>
            )}

            {/* Products Section inside step */}
            <div className="mt-3 pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Products ({step.products.length})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setShowAddProduct(!showAddProduct)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>

              {/* Product list */}
              {step.products.map((product, idx) => (
                <div key={product.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                  <span className="text-xs">
                    {idx + 1}. {product.product_name} ({product.quantity} {product.unit})
                    {product.estimated_price && ` - AED ${product.estimated_price}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                    onClick={() => onRemoveProduct(product.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {/* Add product form */}
              {showAddProduct && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-dashed">
                  <Input
                    placeholder="Product name"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={productQty}
                      onChange={(e) => setProductQty(parseInt(e.target.value) || 1)}
                      className="h-8 text-xs"
                      placeholder="Qty"
                    />
                    <Select value={productUnit} onValueChange={setProductUnit}>
                      <SelectTrigger className="h-8 text-xs">
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
                    <Input
                      type="number"
                      placeholder="Price"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Button size="sm" className="w-full h-7 text-xs" onClick={handleAddProduct}>
                    Add Product
                  </Button>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
