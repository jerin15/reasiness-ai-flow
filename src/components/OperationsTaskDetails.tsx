import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, Truck, MapPin, ClipboardList, Calendar, User, Route, Settings } from "lucide-react";
import { TaskProductsManager } from "./TaskProductsManager";
import { OperationsActivityLog } from "./OperationsActivityLog";
import { TaskWorkflowSteps } from "./operations/TaskWorkflowSteps";

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
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("workflow");

  useEffect(() => {
    fetchOperationsUsers();
  }, []);

  useEffect(() => {
    if (task) {
      setDeliveryInstructions(task.delivery_instructions || "");
      setDeliveryAddress(task.delivery_address || "");
      setDeliveryDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : "");
      setAssignedTo(task.assigned_to || "unassigned");
    }
  }, [task]);

  const fetchOperationsUsers = async () => {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');

      if (roleError) throw roleError;
      
      if (roleData && roleData.length > 0) {
        const userIds = roleData.map(r => r.user_id);
        
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        if (profileError) throw profileError;
        
        if (profileData) {
          setOperationsUsers(profileData as OperationsUser[]);
        }
      }
    } catch (error) {
      console.error('Error fetching operations users:', error);
      toast.error("Failed to load operations team members");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          delivery_instructions: deliveryInstructions || null,
          delivery_address: deliveryAddress || null,
          due_date: deliveryDate || null,
          assigned_to: assignedTo === "unassigned" ? null : assignedTo,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Task details updated");
      onTaskUpdated();
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Package className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="truncate">{task.title}</span>
          </DialogTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            {task.client_name && (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                {task.client_name}
              </Badge>
            )}
            <Badge variant={task.status === 'production' ? 'default' : 'secondary'} className="text-xs">
              {task.status === 'production' ? 'In Production' : task.status.replace('_', ' ')}
            </Badge>
          </div>
        </DialogHeader>

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="w-full grid grid-cols-4 h-12 rounded-none border-b px-2 bg-muted/30 flex-shrink-0">
            <TabsTrigger value="workflow" className="text-xs sm:text-sm data-[state=active]:bg-background">
              <Route className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Workflow</span>
            </TabsTrigger>
            <TabsTrigger value="details" className="text-xs sm:text-sm data-[state=active]:bg-background">
              <Settings className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs sm:text-sm data-[state=active]:bg-background">
              <Package className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Products</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs sm:text-sm data-[state=active]:bg-background">
              <ClipboardList className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            {/* Workflow Tab - Main workflow steps */}
            <TabsContent value="workflow" className="mt-0 space-y-4">
              <TaskWorkflowSteps 
                taskId={task.id} 
                taskTitle={task.title}
                onStepChange={onTaskUpdated}
              />
            </TabsContent>

            {/* Details Tab - Assignment, delivery info */}
            <TabsContent value="details" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Task Description */}
                {task.description && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <p className="text-sm mt-1">{task.description}</p>
                  </div>
                )}

                {/* Assignment Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <Label htmlFor="assigned-to" className="text-sm font-medium">Assign To</Label>
                  </div>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger id="assigned-to" className="h-11">
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-[100]">
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {operationsUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Delivery Date */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryDate" className="text-sm font-medium">Delivery Date</Label>
                  </div>
                  <Input
                    id="deliveryDate"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="h-11"
                  />
                </div>

                {/* Final Delivery Address */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryAddress" className="text-sm font-medium">Final Delivery Address</Label>
                  </div>
                  <Input
                    id="deliveryAddress"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter client's delivery address"
                    className="h-11"
                  />
                </div>

                {/* Special Instructions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryInstructions" className="text-sm font-medium">Special Instructions</Label>
                  </div>
                  <Textarea
                    id="deliveryInstructions"
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Any special handling or delivery notes..."
                    rows={4}
                    className="resize-none"
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-11"
                >
                  {loading ? "Saving..." : "Save Details"}
                </Button>
              </form>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="mt-0">
              <TaskProductsManager 
                taskId={task.id} 
                isAdmin={false}
                userRole="operations"
                readOnly={false}
              />
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="mt-0 space-y-4">
              <div className="space-y-2">
                <h3 className="font-medium flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Progress Updates
                </h3>
                <p className="text-sm text-muted-foreground">
                  Log updates about this task. Your team and admins will be notified.
                </p>
              </div>
              <OperationsActivityLog taskId={task.id} />
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <DialogFooter className="p-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="w-full h-11"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
