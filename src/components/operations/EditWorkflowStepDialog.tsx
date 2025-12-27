import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Package } from "lucide-react";

interface WorkflowStepProduct {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
}

interface WorkflowStep {
  id: string;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  location_address: string | null;
  location_notes: string | null;
  notes: string | null;
  due_date: string | null;
  products?: WorkflowStepProduct[];
}

interface EditWorkflowStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: WorkflowStep | null;
  taskId: string;
  onStepUpdated: () => void;
}

export const EditWorkflowStepDialog = ({
  open,
  onOpenChange,
  step,
  taskId,
  onStepUpdated
}: EditWorkflowStepDialogProps) => {
  const [supplierName, setSupplierName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [stepType, setStepType] = useState<string>("collect");
  const [saving, setSaving] = useState(false);
  
  // Products state
  const [products, setProducts] = useState<WorkflowStepProduct[]>([]);
  const [newProductName, setNewProductName] = useState("");
  const [newProductQty, setNewProductQty] = useState("");
  const [newProductUnit, setNewProductUnit] = useState("pcs");
  const [newProductSupplier, setNewProductSupplier] = useState("");

  useEffect(() => {
    if (step) {
      setSupplierName(step.supplier_name || "");
      setLocationAddress(step.location_address || "");
      setNotes(step.notes || "");
      setDueDate(step.due_date ? step.due_date.split('T')[0] : "");
      setStepType(step.step_type);
      setProducts(step.products || []);
    }
  }, [step]);

  const handleSave = async () => {
    if (!step) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('task_workflow_steps')
        .update({
          supplier_name: supplierName || null,
          location_address: locationAddress || null,
          notes: notes || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          step_type: stepType
        })
        .eq('id', step.id);

      if (error) throw error;

      toast.success("Step updated successfully");
      onStepUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating step:', error);
      toast.error("Failed to update step");
    } finally {
      setSaving(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName.trim() || !step) return;

    try {
      const { error } = await supabase
        .from('task_products')
        .insert({
          task_id: taskId,
          workflow_step_id: step.id,
          product_name: newProductName.trim(),
          quantity: newProductQty ? parseFloat(newProductQty) : 1,
          unit: newProductUnit || 'pcs',
          supplier_name: newProductSupplier.trim() || null
        });

      if (error) throw error;

      toast.success("Product added");
      setNewProductName("");
      setNewProductQty("");
      setNewProductSupplier("");
      
      // Refresh products
      const { data } = await supabase
        .from('task_products')
        .select('*')
        .eq('workflow_step_id', step.id);
      
      if (data) setProducts(data);
      onStepUpdated();
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast.error("Failed to add product");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('task_products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      setProducts(products.filter(p => p.id !== productId));
      toast.success("Product removed");
      onStepUpdated();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error("Failed to remove product");
    }
  };

  if (!step) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Workflow Step</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step Type */}
          <div className="space-y-2">
            <Label>Step Type</Label>
            <Select value={stepType} onValueChange={setStepType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collect">Collect</SelectItem>
                <SelectItem value="deliver_to_supplier">Deliver to Supplier</SelectItem>
                <SelectItem value="deliver_to_client">Deliver to Client</SelectItem>
                <SelectItem value="supplier_to_supplier">S→S Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Supplier/Location Name */}
          <div className="space-y-2">
            <Label>Supplier / Location Name</Label>
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="e.g., Alfa, Print Lab, Client Office"
            />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label>Address (optional)</Label>
            <Input
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="Full address"
            />
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional instructions..."
              rows={2}
            />
          </div>

          {/* Products Section */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-purple-600" />
              <Label className="text-base font-semibold">Products ({products.length})</Label>
            </div>

            {/* Existing Products */}
            {products.length > 0 && (
              <div className="space-y-2">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{product.product_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {product.quantity || 1} {product.unit || 'pcs'}
                        {product.supplier_name && ` • from ${product.supplier_name}`}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteProduct(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Product */}
            <div className="space-y-2 bg-purple-50 dark:bg-purple-950/30 rounded-md p-3">
              <Label className="text-sm font-medium text-purple-700 dark:text-purple-300">Add Product</Label>
              <Input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="Product name"
                className="bg-background"
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  type="number"
                  value={newProductQty}
                  onChange={(e) => setNewProductQty(e.target.value)}
                  placeholder="Qty"
                  className="bg-background"
                />
                <Select value={newProductUnit} onValueChange={setNewProductUnit}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">pcs</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="m">m</SelectItem>
                    <SelectItem value="sqm">sqm</SelectItem>
                    <SelectItem value="sqft">sqft</SelectItem>
                    <SelectItem value="set">set</SelectItem>
                    <SelectItem value="roll">roll</SelectItem>
                    <SelectItem value="box">box</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={newProductSupplier}
                  onChange={(e) => setNewProductSupplier(e.target.value)}
                  placeholder="Supplier"
                  className="bg-background"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={handleAddProduct}
                disabled={!newProductName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Product
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
