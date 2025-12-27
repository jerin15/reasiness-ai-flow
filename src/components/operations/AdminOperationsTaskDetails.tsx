import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Package, Truck, MapPin, ClipboardList, Calendar, User, Route, Settings, Trash2, Edit } from "lucide-react";
import { TaskProductsManager } from "../TaskProductsManager";
import { OperationsActivityLog } from "../OperationsActivityLog";
import { TaskWorkflowSteps } from "./TaskWorkflowSteps";

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
  priority: string;
  assigned_to: string | null;
};

type OperationsUser = {
  id: string;
  full_name: string | null;
  email: string;
};

type AdminOperationsTaskDetailsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: OperationsTask | null;
  onTaskUpdated: () => void;
  onTaskDeleted?: () => void;
};

export const AdminOperationsTaskDetails = ({ 
  open, 
  onOpenChange, 
  task, 
  onTaskUpdated,
  onTaskDeleted
}: AdminOperationsTaskDetailsProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [priority, setPriority] = useState<string>("medium");
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("workflow");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchOperationsUsers();
  }, []);

  useEffect(() => {
    if (task) {
      setTitle(task.title || "");
      setDescription(task.description || "");
      setClientName(task.client_name || "");
      setDeliveryInstructions(task.delivery_instructions || "");
      setDeliveryAddress(task.delivery_address || "");
      setDeliveryDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : "");
      setAssignedTo(task.assigned_to || "unassigned");
      setPriority(task.priority || "medium");
      setIsEditing(false);
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
          title: title.trim(),
          description: description.trim() || null,
          client_name: clientName.trim() || null,
          delivery_instructions: deliveryInstructions || null,
          delivery_address: deliveryAddress || null,
          due_date: deliveryDate || null,
          assigned_to: assignedTo === "unassigned" ? null : assignedTo,
          priority: priority as any,
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Task updated successfully");
      setIsEditing(false);
      onTaskUpdated();
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;

    setDeleting(true);
    try {
      const nowIso = new Date().toISOString();
      
      // Soft delete the task (and linked tasks) – no hard-delete of child records needed
      const { data: baseTask } = await supabase
        .from('tasks')
        .select('id, linked_task_id')
        .eq('id', task.id)
        .maybeSingle();

      const { data: reverseLinked } = await supabase
        .from('tasks')
        .select('id')
        .eq('linked_task_id', task.id)
        .is('deleted_at', null)
        .maybeSingle();

      const ids = Array.from(
        new Set([task.id, baseTask?.linked_task_id, reverseLinked?.id].filter(Boolean) as string[])
      );

      const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: nowIso })
        .in("id", ids);

      if (error) throw error;

      toast.success("Task deleted successfully");
      onOpenChange(false);
      onTaskDeleted?.();
    } catch (error: any) {
      console.error("Error deleting task:", error);
      toast.error(error.message || "Failed to delete task");
    } finally {
      setDeleting(false);
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Package className="h-5 w-5 text-primary flex-shrink-0" />
              <span className="truncate">
                {isEditing ? "Edit Task" : task.title}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={isEditing ? "default" : "outline"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                <Edit className="h-4 w-4 mr-1" />
                {isEditing ? "Cancel Edit" : "Edit"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Task</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this task? This will remove all workflow steps, products, and activity logs. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {task.client_name && (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                {task.client_name}
              </Badge>
            )}
            <Badge 
              variant={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'default' : 'secondary'} 
              className="text-xs"
            >
              {task.priority.toUpperCase()}
            </Badge>
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
            {/* Workflow Tab */}
            <TabsContent value="workflow" className="mt-0 space-y-4">
              <TaskWorkflowSteps 
                taskId={task.id} 
                taskTitle={task.title}
                onStepChange={onTaskUpdated}
              />
            </TabsContent>

            {/* Details Tab - Full Edit Form for Admins */}
            <TabsContent value="details" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-medium">Task Title</Label>
                  {isEditing ? (
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Task title"
                      className="h-11"
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">{task.title}</p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">Description</Label>
                  {isEditing ? (
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Task description"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">
                      {task.description || "No description"}
                    </p>
                  )}
                </div>

                {/* Client Name */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <Label htmlFor="client" className="text-sm font-medium">Client Name</Label>
                  </div>
                  {isEditing ? (
                    <Input
                      id="client"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Client name"
                      className="h-11"
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">
                      {task.client_name || "Not specified"}
                    </p>
                  )}
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Priority</Label>
                  {isEditing ? (
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge 
                      variant={task.priority === 'urgent' ? 'destructive' : task.priority === 'high' ? 'default' : 'secondary'}
                    >
                      {task.priority.toUpperCase()}
                    </Badge>
                  )}
                </div>

                {/* Assignment Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <Label htmlFor="assigned-to" className="text-sm font-medium">Assign To</Label>
                  </div>
                  {isEditing ? (
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
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">
                      {operationsUsers.find(u => u.id === task.assigned_to)?.full_name || 
                       operationsUsers.find(u => u.id === task.assigned_to)?.email || 
                       "Unassigned"}
                    </p>
                  )}
                </div>

                {/* Delivery Date */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryDate" className="text-sm font-medium">Delivery Date</Label>
                  </div>
                  {isEditing ? (
                    <Input
                      id="deliveryDate"
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="h-11"
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">
                      {task.due_date ? new Date(task.due_date).toLocaleDateString() : "Not set"}
                    </p>
                  )}
                </div>

                {/* Final Delivery Address */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryAddress" className="text-sm font-medium">Final Delivery Address</Label>
                  </div>
                  {isEditing ? (
                    <Input
                      id="deliveryAddress"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Enter client's delivery address"
                      className="h-11"
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg">
                      {task.delivery_address || "Not specified"}
                    </p>
                  )}
                </div>

                {/* Special Instructions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <Label htmlFor="deliveryInstructions" className="text-sm font-medium">Special Instructions</Label>
                  </div>
                  {isEditing ? (
                    <Textarea
                      id="deliveryInstructions"
                      value={deliveryInstructions}
                      onChange={(e) => setDeliveryInstructions(e.target.value)}
                      placeholder="Any special handling or delivery notes..."
                      rows={4}
                      className="resize-none"
                    />
                  ) : (
                    <p className="text-sm p-3 bg-muted/50 rounded-lg whitespace-pre-wrap">
                      {task.delivery_instructions || "No special instructions"}
                    </p>
                  )}
                </div>

                {isEditing && (
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full h-11"
                  >
                    {loading ? "Saving..." : "Save Changes"}
                  </Button>
                )}
              </form>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="mt-0">
              <TaskProductsManager 
                taskId={task.id} 
                isAdmin={true}
                userRole="admin"
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
                  View all activity logs for this task.
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
