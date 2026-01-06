import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  Trash2, 
  Package, 
  Save, 
  Loader2,
  Edit2,
  X,
  CheckCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Product {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
}

interface OperationsProductEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onProductsUpdated?: () => void;
}

export const OperationsProductEditor = ({
  open,
  onOpenChange,
  taskId,
  taskTitle,
  onProductsUpdated
}: OperationsProductEditorProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New product form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    product_name: '',
    quantity: 1,
    unit: 'pcs',
    supplier_name: ''
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    product_name: '',
    quantity: 1,
    unit: 'pcs',
    supplier_name: ''
  });

  useEffect(() => {
    if (open && taskId) {
      fetchProducts();
    }
  }, [open, taskId]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_products')
        .select('id, product_name, quantity, unit, supplier_name')
        .eq('task_id', taskId)
        .order('position');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = async (action: string, productName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get admin users to notify
      const { data: adminUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminUsers && adminUsers.length > 0) {
        const notifications = adminUsers.map(admin => ({
          sender_id: user.id,
          recipient_id: admin.user_id,
          title: `Product ${action}`,
          message: `${action} "${productName}" on task "${taskTitle}"`,
          priority: 'normal'
        }));

        await supabase.from('urgent_notifications').insert(notifications);
      }

      // Log activity
      await supabase.from('task_activity_log').insert({
        task_id: taskId,
        user_id: user.id,
        action: 'operations_update',
        details: { message: `Product ${action.toLowerCase()}: ${productName}` }
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('task_products')
        .insert({
          task_id: taskId,
          product_name: newProduct.product_name.trim(),
          quantity: newProduct.quantity,
          unit: newProduct.unit,
          supplier_name: newProduct.supplier_name.trim() || null,
          position: products.length,
          approval_status: 'pending'
        });

      if (error) throw error;

      await sendNotification('Added', newProduct.product_name);
      toast.success('Product added');
      
      setNewProduct({ product_name: '', quantity: 1, unit: 'pcs', supplier_name: '' });
      setShowAddForm(false);
      await fetchProducts();
      onProductsUpdated?.();
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast.error(error.message || 'Failed to add product');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProduct = async (productId: string) => {
    if (!editForm.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('task_products')
        .update({
          product_name: editForm.product_name.trim(),
          quantity: editForm.quantity,
          unit: editForm.unit,
          supplier_name: editForm.supplier_name.trim() || null
        })
        .eq('id', productId);

      if (error) throw error;

      await sendNotification('Updated', editForm.product_name);
      toast.success('Product updated');
      
      setEditingId(null);
      await fetchProducts();
      onProductsUpdated?.();
    } catch (error: any) {
      console.error('Error updating product:', error);
      toast.error(error.message || 'Failed to update product');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (product: Product) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('task_products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      await sendNotification('Deleted', product.product_name);
      toast.success('Product deleted');
      
      await fetchProducts();
      onProductsUpdated?.();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      toast.error(error.message || 'Failed to delete product');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      product_name: product.product_name,
      quantity: product.quantity || 1,
      unit: product.unit || 'pcs',
      supplier_name: product.supplier_name || ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Manage Products
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{taskTitle}</p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pb-4">
              {/* Existing Products */}
              {products.length === 0 && !showAddForm ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No products yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddForm(true)}
                    className="mt-3"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Product
                  </Button>
                </div>
              ) : (
                <>
                  {products.map((product) => (
                    <Card key={product.id} className="p-3">
                      {editingId === product.id ? (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs">Product Name</Label>
                            <Input
                              value={editForm.product_name}
                              onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                              placeholder="Product name"
                              className="h-9"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                value={editForm.quantity}
                                onChange={(e) => setEditForm({ ...editForm, quantity: parseFloat(e.target.value) || 1 })}
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Unit</Label>
                              <Input
                                value={editForm.unit}
                                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                                placeholder="pcs"
                                className="h-9"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Supplier</Label>
                              <Input
                                value={editForm.supplier_name}
                                onChange={(e) => setEditForm({ ...editForm, supplier_name: e.target.value })}
                                placeholder="Supplier"
                                className="h-9"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleUpdateProduct(product.id)}
                              disabled={saving}
                              className="flex-1"
                            >
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{product.product_name}</span>
                              {product.quantity && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  {product.quantity} {product.unit || 'pcs'}
                                </Badge>
                              )}
                            </div>
                            {product.supplier_name && (
                              <p className="text-xs text-muted-foreground truncate">
                                From: {product.supplier_name}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEditing(product)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteProduct(product)}
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </>
              )}

              {/* Add Product Form */}
              {showAddForm && (
                <>
                  <Separator />
                  <Card className="p-3 border-primary/30 bg-primary/5">
                    <p className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      New Product
                    </p>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Product Name *</Label>
                        <Input
                          value={newProduct.product_name}
                          onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                          placeholder="Enter product name"
                          className="h-9"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <Input
                            type="number"
                            value={newProduct.quantity}
                            onChange={(e) => setNewProduct({ ...newProduct, quantity: parseFloat(e.target.value) || 1 })}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={newProduct.unit}
                            onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                            placeholder="pcs"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Supplier</Label>
                          <Input
                            value={newProduct.supplier_name}
                            onChange={(e) => setNewProduct({ ...newProduct, supplier_name: e.target.value })}
                            placeholder="Supplier"
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={handleAddProduct}
                          disabled={saving}
                          className="flex-1"
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                          Add Product
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setShowAddForm(false);
                            setNewProduct({ product_name: '', quantity: 1, unit: 'pcs', supplier_name: '' });
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </Card>
                </>
              )}

              {/* Add Product Button */}
              {products.length > 0 && !showAddForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </Button>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
