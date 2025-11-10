import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Check, X, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id?: string;
  product_name: string;
  description: string;
  quantity: number;
  unit: string;
  estimated_price: number;
  final_price?: number;
  approval_status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  approval_notes?: string;
  approved_by?: string;
  approved_at?: string;
}

interface TaskProductsManagerProps {
  taskId?: string;
  isAdmin?: boolean;
  onProductsChange?: (products: Product[]) => void;
  readOnly?: boolean;
  userRole?: string;
}

export function TaskProductsManager({ 
  taskId, 
  isAdmin = false, 
  onProductsChange,
  readOnly = false,
  userRole 
}: TaskProductsManagerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<Product>({
    product_name: '',
    description: '',
    quantity: 1,
    unit: 'pcs',
    estimated_price: 0,
    approval_status: 'pending'
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  useEffect(() => {
    fetchCurrentUserRole();
  }, []);

  const fetchCurrentUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData) {
      setCurrentUserRole(roleData.role);
    }
  };

  // Determine the effective user role (prioritize userRole prop, fallback to currentUserRole)
  const effectiveRole = userRole || currentUserRole;
  
  // Determine if user can add/edit products (admins, technical_head, estimation can add)
  const canEdit = !readOnly && (
    isAdmin || 
    ['admin', 'technical_head', 'estimation'].includes(effectiveRole)
  );
  
  // ONLY admins can approve/reject products
  const canApprove = !readOnly && (
    isAdmin || 
    effectiveRole === 'admin'
  );

  useEffect(() => {
    if (taskId) {
      fetchProducts();
    }
  }, [taskId]);

  const fetchProducts = async () => {
    if (!taskId) return;
    
    const { data, error } = await supabase
      .from('task_products')
      .select('*')
      .eq('task_id', taskId)
      .order('position');

    if (error) {
      console.error('Error fetching products:', error);
      return;
    }

    setProducts((data as any) || []);
  };

  const handleAddProduct = async () => {
    if (!newProduct.product_name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (taskId) {
      // Save to database for existing tasks
      const { error } = await supabase
        .from('task_products')
        .insert({
          task_id: taskId,
          ...newProduct,
          position: products.length
        });

      if (error) {
        toast.error('Failed to add product');
        console.error(error);
        return;
      }

      await fetchProducts();
      toast.success('Product added');
    } else {
      // For new tasks, add to local state
      const tempProduct = { 
        ...newProduct, 
        id: `temp-${Date.now()}`,
        position: products.length 
      };
      const updatedProducts = [...products, tempProduct];
      setProducts(updatedProducts);
      onProductsChange?.(updatedProducts);
      toast.success('Product added');
    }

    // Reset form
    setNewProduct({
      product_name: '',
      description: '',
      quantity: 1,
      unit: 'pcs',
      estimated_price: 0,
      approval_status: 'pending'
    });
    setShowAddForm(false);
  };

  const handleUpdateProduct = async (productId: string, updates: Partial<Product>) => {
    if (!taskId) return;

    const { error } = await supabase
      .from('task_products')
      .update(updates)
      .eq('id', productId);

    if (error) {
      toast.error('Failed to update product');
      console.error(error);
      return;
    }

    await fetchProducts();
    toast.success('Product updated');
    setEditingId(null);
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!taskId) {
      // For new tasks, just remove from local state
      const updatedProducts = products.filter(p => p.id !== productId);
      setProducts(updatedProducts);
      onProductsChange?.(updatedProducts);
      toast.success('Product removed');
      return;
    }

    const { error } = await supabase
      .from('task_products')
      .delete()
      .eq('id', productId);

    if (error) {
      toast.error('Failed to delete product');
      console.error(error);
      return;
    }

    await fetchProducts();
    toast.success('Product deleted');
  };

  const handleApprovalStatusChange = async (
    productId: string, 
    status: 'approved' | 'rejected' | 'needs_revision',
    notes?: string
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    const updates = {
      approval_status: status,
      approval_notes: notes,
      approved_by: user?.id,
      approved_at: new Date().toISOString()
    };

    await handleUpdateProduct(productId, updates);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: 'secondary', label: 'Pending' },
      approved: { variant: 'default', label: 'Approved' },
      rejected: { variant: 'destructive', label: 'Rejected' },
      needs_revision: { variant: 'outline', label: 'Needs Revision' }
    };
    
    const { variant, label } = variants[status] || variants.pending;
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Products</h3>
        {canEdit && (
          <Button 
            type="button"
            onClick={() => setShowAddForm(!showAddForm)} 
            size="sm"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Product
          </Button>
        )}
      </div>

      {showAddForm && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Product Name *</Label>
              <Input
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                placeholder="Enter product name"
              />
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                placeholder="Product description"
                rows={2}
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={newProduct.quantity}
                onChange={(e) => setNewProduct({ ...newProduct, quantity: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                value={newProduct.unit}
                onValueChange={(value) => setNewProduct({ ...newProduct, unit: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Pieces</SelectItem>
                  <SelectItem value="sqft">Sq Ft</SelectItem>
                  <SelectItem value="sqm">Sq Meter</SelectItem>
                  <SelectItem value="kg">Kg</SelectItem>
                  <SelectItem value="m">Meter</SelectItem>
                  <SelectItem value="set">Set</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estimated Price (AED)</Label>
              <Input
                type="number"
                value={newProduct.estimated_price}
                onChange={(e) => setNewProduct({ ...newProduct, estimated_price: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleAddProduct}>
              Add Product
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {products.map((product) => (
          <Card key={product.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold">{product.product_name}</h4>
                  {getStatusBadge(product.approval_status)}
                </div>
                
                {product.description && (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                )}
                
                <div className="flex gap-4 text-sm">
                  <span>Qty: {product.quantity} {product.unit}</span>
                  <span>Est. Price: AED {product.estimated_price}</span>
                  {product.final_price && (
                    <span className="font-medium">Final: AED {product.final_price}</span>
                  )}
                </div>

                {product.approval_notes && (
                  <div className="text-sm bg-muted p-2 rounded">
                    <span className="font-medium">Notes: </span>
                    {product.approval_notes}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {canApprove && product.approval_status === 'pending' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-green-600"
                      onClick={() => handleApprovalStatusChange(product.id!, 'approved')}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() => {
                        const notes = prompt('Rejection reason (optional):');
                        handleApprovalStatusChange(product.id!, 'rejected', notes || undefined);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                
                {canEdit && !canApprove && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteProduct(product.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}

        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No products added yet
          </p>
        )}
      </div>

      {products.length > 0 && (
        <div className="pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total Products:</span>
            <span className="font-semibold">{products.length}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Approved:</span>
            <span className="font-semibold text-green-600">
              {products.filter(p => p.approval_status === 'approved').length}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Pending:</span>
            <span className="font-semibold text-yellow-600">
              {products.filter(p => p.approval_status === 'pending').length}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Rejected:</span>
            <span className="font-semibold text-red-600">
              {products.filter(p => p.approval_status === 'rejected').length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}