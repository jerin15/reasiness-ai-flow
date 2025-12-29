import { useState, useEffect } from "react";
import { 
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Package, 
  Truck, 
  MapPin, 
  ClipboardList, 
  Calendar, 
  User, 
  Route,
  AlertTriangle,
  ExternalLink,
  Trash2
} from "lucide-react";
import { TaskWorkflowSteps } from "./TaskWorkflowSteps";
import { OperationsActivityLog } from "../OperationsActivityLog";
import { format, isToday, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import type { OperationsTaskWithSteps } from "./OperationsMobileTaskCard";

interface OperationsUser {
  id: string;
  full_name: string | null;
  email: string;
}

interface OperationsMobileTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: OperationsTaskWithSteps | null;
  operationsUsers: OperationsUser[];
  onTaskUpdated: () => void;
  isAdmin?: boolean;
  onDeleteTask?: (taskId: string) => void;
}

export const OperationsMobileTaskSheet = ({
  open,
  onOpenChange,
  task,
  operationsUsers,
  onTaskUpdated,
  isAdmin = false,
  onDeleteTask
}: OperationsMobileTaskSheetProps) => {
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("workflow");

  useEffect(() => {
    if (task) {
      setDeliveryAddress(task.delivery_address || "");
      setDeliveryDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : "");
      setDeliveryInstructions(task.delivery_instructions || "");
      setAssignedTo(task.assigned_to || "unassigned");
      setActiveTab("workflow");
    }
  }, [task]);

  if (!task) return null;

  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      const previousAssignedTo = task.assigned_to;
      const newAssignedTo = assignedTo === "unassigned" ? null : assignedTo;
      
      const { error } = await supabase
        .from("tasks")
        .update({
          delivery_address: deliveryAddress || null,
          due_date: deliveryDate || null,
          delivery_instructions: deliveryInstructions || null,
          assigned_to: newAssignedTo,
        })
        .eq("id", task.id);

      if (error) throw error;

      // Send notification if assignment changed
      if (newAssignedTo && newAssignedTo !== previousAssignedTo) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: assignerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user?.id)
          .single();
        
        const assignerName = assignerProfile?.full_name || 'Team';
        
        await supabase
          .from('urgent_notifications')
          .insert({
            sender_id: user?.id,
            recipient_id: newAssignedTo,
            title: '📋 Task Assigned to You',
            message: `${assignerName} assigned you: "${task.title}"\n\n${task.client_name ? `Client: ${task.client_name}\n` : ''}${deliveryAddress ? `Delivery: ${deliveryAddress}\n` : ''}${deliveryDate ? `Due: ${new Date(deliveryDate).toLocaleDateString()}` : ''}`,
            is_broadcast: false,
            priority: task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'medium'
          });
      }

      toast.success("Task updated");
      onTaskUpdated();
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  const openInMaps = () => {
    if (deliveryAddress) {
      const encoded = encodeURIComponent(deliveryAddress);
      window.open(`https://maps.google.com/?q=${encoded}`, '_blank');
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="border-b pb-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-left text-base leading-tight line-clamp-2">
                {task.title}
              </DrawerTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                {task.client_name && (
                  <Badge variant="outline" className="text-xs">
                    <User className="h-3 w-3 mr-1" />
                    {task.client_name}
                  </Badge>
                )}
                {dueDate && (
                  <Badge 
                    variant={isOverdue ? "destructive" : isDueToday ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {isOverdue && <AlertTriangle className="h-3 w-3 mr-1" />}
                    <Calendar className="h-3 w-3 mr-1" />
                    {format(dueDate, 'MMM d')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DrawerHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="w-full grid grid-cols-3 h-12 rounded-none border-b px-2 bg-muted/30 shrink-0">
            <TabsTrigger value="workflow" className="text-xs data-[state=active]:bg-background gap-1">
              <Route className="h-4 w-4" />
              Steps
            </TabsTrigger>
            <TabsTrigger value="details" className="text-xs data-[state=active]:bg-background gap-1">
              <MapPin className="h-4 w-4" />
              Info
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs data-[state=active]:bg-background gap-1">
              <ClipboardList className="h-4 w-4" />
              Log
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4 pb-6">
              <TabsContent value="workflow" className="mt-0">
                <TaskWorkflowSteps 
                  taskId={task.id} 
                  taskTitle={task.title}
                  onStepChange={onTaskUpdated}
                />
              </TabsContent>

              <TabsContent value="details" className="mt-0 space-y-4">
                {/* Description */}
                {task.description && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <p className="text-sm mt-1">{task.description}</p>
                  </div>
                )}

                {/* Assignment */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Assigned To
                  </Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent className="z-[100] bg-popover">
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
                  <Label className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    Delivery Date
                  </Label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="h-12"
                  />
                </div>

                {/* Delivery Address */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Delivery Address
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Enter delivery address"
                      className="h-12 flex-1"
                    />
                    {deliveryAddress && (
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-12 w-12 shrink-0"
                        onClick={openInMaps}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Special Instructions */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    Special Instructions
                  </Label>
                  <Textarea
                    value={deliveryInstructions}
                    onChange={(e) => setDeliveryInstructions(e.target.value)}
                    placeholder="Any special handling notes..."
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <Button 
                  onClick={handleSaveDetails}
                  disabled={saving}
                  className="w-full h-12"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </TabsContent>

              <TabsContent value="activity" className="mt-0">
                <OperationsActivityLog taskId={task.id} />
              </TabsContent>
            </div>
          </div>
        </Tabs>

        <DrawerFooter className="border-t pt-4 shrink-0">
          <div className="flex gap-2 w-full">
            {isAdmin && onDeleteTask && (
              <Button 
                variant="destructive" 
                className="h-12"
                onClick={() => onDeleteTask(task.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <DrawerClose asChild>
              <Button variant="outline" className="flex-1 h-12">
                Close
              </Button>
            </DrawerClose>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
