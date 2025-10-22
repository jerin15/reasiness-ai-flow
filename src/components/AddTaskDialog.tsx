import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AddTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskAdded: () => void;
  defaultAssignedTo?: string;
};

export const AddTaskDialog = ({ open, onOpenChange, onTaskAdded, defaultAssignedTo }: AddTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [myStatus, setMyStatus] = useState("pending");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const taskData: any = {
        title,
        description: description || null,
        priority: priority as "low" | "medium" | "high" | "urgent",
        due_date: dueDate || null,
        created_by: user.id,
        status: "todo" as const,
        assigned_by: assignedBy || null,
        client_name: clientName || null,
        supplier_name: supplierName || null,
        my_status: myStatus as "pending" | "done_from_my_side",
      };

      // If admin is creating task for another user, assign it
      // If creating task for themselves (or no specific user), assign to themselves
      if (defaultAssignedTo) {
        taskData.assigned_to = defaultAssignedTo;
      } else {
        taskData.assigned_to = user.id; // Self-assigned task
      }

      const { error } = await supabase.from("tasks").insert(taskData);

      if (error) throw error;

      toast.success("Task created successfully");
      onTaskAdded();
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      setAssignedBy("");
      setClientName("");
      setSupplierName("");
      setMyStatus("pending");
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error(error.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add task details"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
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
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assignedBy">Assigned By</Label>
              <Input
                id="assignedBy"
                value={assignedBy}
                onChange={(e) => setAssignedBy(e.target.value)}
                placeholder="Who assigned this task?"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Who is this for?"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierName">Supplier</Label>
            <Input
              id="supplierName"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Supplier name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="myStatus">My Status</Label>
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
