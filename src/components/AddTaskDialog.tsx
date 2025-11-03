import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  user_roles?: { role: string }[];
};

type AddTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskAdded: () => void;
  defaultAssignedTo?: string;
  viewingUserRole?: string;
};

export const AddTaskDialog = ({ open, onOpenChange, onTaskAdded, defaultAssignedTo, viewingUserRole }: AddTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [myStatus, setMyStatus] = useState("pending");
  const [taskType, setTaskType] = useState("general");
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>(defaultAssignedTo || "");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [selectedPipeline, setSelectedPipeline] = useState("todo");

  useEffect(() => {
    if (open) {
      fetchTeamMembers();
      checkUserRole();
    }
  }, [open]);

  useEffect(() => {
    if (defaultAssignedTo) {
      setSelectedMember(defaultAssignedTo);
    }
  }, [defaultAssignedTo]);

  const checkUserRole = async () => {
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

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, user_roles(role)')
        .order('full_name');

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

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
        status: (currentUserRole === 'admin' || currentUserRole === 'technical_head') 
          ? selectedPipeline 
          : "todo" as const,
        assigned_by: assignedBy || null,
        client_name: clientName || null,
        supplier_name: supplierName || null,
        my_status: myStatus as "pending" | "done_from_my_side",
        type: taskType as "quotation" | "invoice" | "design" | "general" | "production",
      };

      // Admin and technical_head can assign to selected member, others create self-assigned tasks
      if ((currentUserRole === 'admin' || currentUserRole === 'technical_head') && selectedMember) {
        taskData.assigned_to = selectedMember;
      } else if (defaultAssignedTo) {
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
      setTaskType("general");
      setSelectedMember(defaultAssignedTo || "");
      setSelectedPipeline("todo");
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
          {(currentUserRole === 'admin' || currentUserRole === 'technical_head') && (
            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assign To *</Label>
              <Select value={selectedMember} onValueChange={setSelectedMember} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => {
                    const role = member.user_roles?.[0]?.role || 'No role';
                    const formattedRole = role === 'technical_head' ? 'Technical Head' : 
                                         role === 'No role' ? 'No role' :
                                         role.charAt(0).toUpperCase() + role.slice(1);
                    return (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name || member.email} ({formattedRole})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          {(currentUserRole === 'admin' || currentUserRole === 'technical_head') && selectedMember && (
            <div className="space-y-2">
              <Label htmlFor="pipeline">Pipeline *</Label>
              <Select value={selectedPipeline} onValueChange={setSelectedPipeline} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const memberRole = teamMembers.find(m => m.id === selectedMember)?.user_roles?.[0]?.role;
                    
                    if (memberRole === 'designer') {
                      return (
                        <>
                          <SelectItem value="todo">To-Do List</SelectItem>
                          <SelectItem value="production_file">PRODUCTION FILE</SelectItem>
                          <SelectItem value="mockup">MOCKUP</SelectItem>
                        </>
                      );
                    } else if (memberRole === 'estimation') {
                      return (
                        <>
                          <SelectItem value="todo">To-Do List</SelectItem>
                          <SelectItem value="supplier_quotes">SUPPLIER QUOTES</SelectItem>
                          <SelectItem value="done">DONE</SelectItem>
                        </>
                      );
                    } else if (memberRole === 'operations') {
                      return (
                        <>
                          <SelectItem value="production">PRODUCTION</SelectItem>
                          <SelectItem value="delivery">DELIVERY</SelectItem>
                          <SelectItem value="done">DONE</SelectItem>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <SelectItem value="todo">To-Do List</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </>
                      );
                    }
                  })()}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="myStatus">My Status</Label>
              <Select value={myStatus} onValueChange={setMyStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="done_from_my_side">Done From My Side</SelectItem>
                  {(currentUserRole === 'designer' || viewingUserRole === 'designer') && (
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taskType">Type</Label>
              <Select value={taskType} onValueChange={setTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quotation">QUOTATION</SelectItem>
                  <SelectItem value="invoice">INVOICE</SelectItem>
                  <SelectItem value="design">DESIGN</SelectItem>
                  <SelectItem value="general">GENERAL</SelectItem>
                  <SelectItem value="production">PRODUCTION</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
