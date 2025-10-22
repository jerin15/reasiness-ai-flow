import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  status: string;
  assigned_by: string | null;
  client_name: string | null;
  supplier_name: string | null;
  my_status: string;
};

type EditTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onTaskUpdated: () => void;
  onTaskDeleted?: () => void;
  isAdmin?: boolean;
};

export const EditTaskDialog = ({ 
  open, 
  onOpenChange, 
  task, 
  onTaskUpdated,
  onTaskDeleted,
  isAdmin 
}: EditTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [myStatus, setMyStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setPriority(task.priority);
      setDueDate(task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : "");
      setAssignedBy(task.assigned_by || "");
      setClientName(task.client_name || "");
      setSupplierName(task.supplier_name || "");
      setMyStatus(task.my_status || "pending");
    }
  }, [task]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          title,
          description: description || null,
          priority: priority as "low" | "medium" | "high" | "urgent",
          due_date: dueDate || null,
          assigned_by: assignedBy || null,
          client_name: clientName || null,
          supplier_name: supplierName || null,
          my_status: myStatus as "pending" | "done_from_my_side",
        })
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Task updated successfully");
      onTaskUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating task:", error);
      toast.error(error.message || "Failed to update task");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    
    if (!confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", task.id);

      if (error) throw error;

      toast.success("Task deleted successfully");
      onTaskDeleted?.();
      onOpenChange(false);
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title *</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add task details"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
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
            <div className="space-y-2">
              <Label htmlFor="edit-dueDate">Due Date</Label>
              <Input
                id="edit-dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-assignedBy">Assigned By</Label>
              <Input
                id="edit-assignedBy"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                placeholder="Who assigned this task?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-clientName">Client Name</Label>
              <Input
                id="edit-clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Who is this for?"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-supplierName">Supplier</Label>
            <Input
              id="edit-supplierName"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Supplier name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-myStatus">My Status</Label>
            <Select value={myStatus} onValueChange={setMyStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="done_from_my_side">Done From My Side</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex justify-between items-center">
            <div>
              {isAdmin && (
                <Button 
                  type="button" 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete Task"}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update Task"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
