import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, Truck, MapPin, ClipboardList, Plus, X, Calendar, User } from "lucide-react";
import { TaskProductsManager } from "./TaskProductsManager";

type OperationsTask = {
  id: string;
  title: string;
  description: string | null;
  suppliers: string[] | null;
  delivery_instructions: string | null;
  delivery_address: string | null;
  due_date: string | null;
  client_name: string | null;
  status: string;
  assigned_to: string | null;
};

type OperationsUser = {
  id: string;
  full_name: string | null;
  email: string;
};

type OperationsTaskDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: OperationsTask | null;
  onTaskUpdated: () => void;
};

export const OperationsTaskDetails = ({ 
  open, 
  onOpenChange, 
  task, 
  onTaskUpdated 
}: OperationsTaskDetailsProps) => {
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [newSupplier, setNewSupplier] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchOperationsUsers();
  }, []);

  useEffect(() => {
    if (task) {
      setSuppliers(task.suppliers || []);
      setDeliveryInstructions(task.delivery_instructions || "");
      setDeliveryAddress(task.delivery_address || "");
      setDeliveryDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : "");
      setAssignedTo(task.assigned_to || "unassigned");
    }
  }, [task]);

  const fetchOperationsUsers = async () => {
    try {
      console.log('🔍 Fetching operations users...');
      
      // Get all user IDs with operations role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');

      console.log('📋 Role data:', roleData, 'Error:', roleError);

      if (roleError) {
        console.error('❌ Role fetch error:', roleError);
        throw roleError;
      }
      
      if (roleData && roleData.length > 0) {
        const userIds = roleData.map(r => r.user_id);
        console.log('👥 User IDs:', userIds);
        
        // Fetch profiles for those user IDs
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
          
        console.log('👤 Profile data:', profileData, 'Error:', profileError);

        if (profileError) {
          console.error('❌ Profile fetch error:', profileError);
          throw profileError;
        }
        
        if (profileData) {
          console.log('✅ Setting operations users:', profileData);
          setOperationsUsers(profileData as OperationsUser[]);
        }
      } else {
        console.warn('⚠️ No operations users found');
      }
    } catch (error) {
      console.error('❌ Error fetching operations users:', error);
      toast.error("Failed to load operations team members");
    }
  };

  const handleAddSupplier = () => {
    if (newSupplier.trim()) {
      setSuppliers([...suppliers, newSupplier.trim()]);
      setNewSupplier("");
    }
  };

  const handleRemoveSupplier = (index: number) => {
    setSuppliers(suppliers.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          suppliers: suppliers.length > 0 ? suppliers : null,
          delivery_instructions: deliveryInstructions || null,
          delivery_address: deliveryAddress || null,
          due_date: deliveryDate || null,
          assigned_to: assignedTo === "unassigned" ? null : assignedTo,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Operations details updated successfully");
      onTaskUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating operations details:", error);
      toast.error(error.message || "Failed to update operations details");
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Operations Details: {task.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Overview */}
          <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Task Details</Label>
            </div>
            <p className="text-sm text-muted-foreground">{task.description || "No description"}</p>
            {task.client_name && (
              <p className="text-sm">
                <span className="font-medium">Client:</span> {task.client_name}
              </p>
            )}
            <Badge variant={task.status === 'production' ? 'default' : 'secondary'}>
              {task.status === 'production' ? 'In Production' : 'Done'}
            </Badge>
          </div>

          {/* Assignment Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <Label htmlFor="assigned-to">Assigned To</Label>
              {operationsUsers.length > 0 && (
                <Badge variant="outline" className="ml-auto">
                  {operationsUsers.length} team members
                </Badge>
              )}
            </div>
            <Select value={assignedTo} onValueChange={(value) => {
              console.log('🎯 Assignment changed to:', value);
              setAssignedTo(value);
            }}>
              <SelectTrigger id="assigned-to" className="w-full">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-[100]" position="popper" sideOffset={5}>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {operationsUsers.map((user) => {
                  console.log('🔹 Rendering option:', user.full_name, user.id);
                  return (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Assign this task to a specific operations team member
              {operationsUsers.length === 0 && " (Loading...)"}
            </p>
          </div>

          {/* Supplier Workflow Chain */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <Label>Supplier Workflow Chain</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Add suppliers in order of workflow (e.g., collect from Supplier A → process at Supplier B → deliver)
            </p>
            
            <div className="space-y-2">
              {suppliers.map((supplier, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <span className="text-sm font-medium text-primary">Step {index + 1}:</span>
                  <span className="flex-1 text-sm">{supplier}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSupplier(index)}
                    className="h-7 w-7 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                placeholder="Enter supplier name"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSupplier();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleAddSupplier}
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Delivery Date */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <Label htmlFor="deliveryDate">Delivery Date</Label>
            </div>
            <Input
              id="deliveryDate"
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          {/* Delivery Address */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <Label htmlFor="deliveryAddress">Delivery Address</Label>
            </div>
            <Input
              id="deliveryAddress"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Enter final delivery address"
            />
          </div>

          {/* Special Instructions */}
          <div className="space-y-2">
            <Label htmlFor="deliveryInstructions">Special Instructions</Label>
            <Textarea
              id="deliveryInstructions"
              value={deliveryInstructions}
              onChange={(e) => setDeliveryInstructions(e.target.value)}
              placeholder="Enter any special handling or delivery instructions..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Products with Quantities */}
          <div className="border-t pt-4">
            <TaskProductsManager 
              taskId={task.id} 
              isAdmin={false}
              userRole="operations"
              readOnly={false}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
