import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TaskProductsManager } from "./TaskProductsManager";
import { enrichLatestAuditLog } from "@/lib/enrichAuditLog";
import { logTaskAction } from "@/lib/auditLogger";
import { TaskActivityTimeline } from "./TaskActivityTimeline";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_date: string | null;
  status: string;
  assigned_by: string | null;
  assigned_to: string | null;
  client_name: string | null;
  supplier_name: string | null;
  my_status: string;
  type: string;
  came_from_designer_done?: boolean;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
  sent_back_to_designer?: boolean;
  admin_remarks?: string | null;
};

type EditTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  onTaskUpdated: () => void;
  onTaskDeleted?: () => void;
  isAdmin?: boolean;
  viewingUserRole?: string;
  isAdminDashboard?: boolean;
};

export const EditTaskDialog = ({ 
  open, 
  onOpenChange, 
  task, 
  onTaskUpdated,
  onTaskDeleted,
  isAdmin,
  viewingUserRole,
  isAdminDashboard
}: EditTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignedBy, setAssignedBy] = useState("");
  const [clientName, setClientName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [myStatus, setMyStatus] = useState("pending");
  const [taskType, setTaskType] = useState("general");
  const [status, setStatus] = useState("todo");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

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
      setTaskType(task.type || "general");
      setStatus(task.status || "todo");
      setAdminRemarks(task.admin_remarks || "");
      setAssignedTo(task.assigned_to || "");
    }
  }, [task]);

  useEffect(() => {
    if (open) {
      checkUserRole();
      fetchTeamMembers();
    }
  }, [open]);

  // Auto-select appropriate pipeline when assignee changes
  useEffect(() => {
    if (assignedTo && teamMembers.length > 0) {
      const assignee = teamMembers.find(m => m.id === assignedTo);
      const assigneeRole = assignee?.user_roles?.[0]?.role;
      
      // Set default status based on assignee's role
      if (assigneeRole === 'client_service' && status !== 'new_calls' && status !== 'follow_up' && status !== 'quotation' && status !== 'done') {
        setStatus('new_calls');
      } else if (assigneeRole === 'designer' && status !== 'todo' && status !== 'mockup' && status !== 'with_client' && status !== 'production' && status !== 'done') {
        setStatus('todo');
      } else if (assigneeRole === 'estimation' && !['todo', 'supplier_quotes', 'client_approval', 'admin_approval', 'quotation_bill', 'production', 'final_invoice', 'done'].includes(status)) {
        setStatus('todo');
      } else if (assigneeRole === 'operations' && !['todo', 'approval', 'production', 'delivery', 'done'].includes(status)) {
        setStatus('todo');
      } else if (assigneeRole === 'technical_head' && !['todo', 'developing', 'testing', 'under_review', 'deployed', 'trial_and_error', 'done'].includes(status)) {
        setStatus('todo');
      }
    }
  }, [assignedTo, teamMembers]);

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
    if (!task) return;

    setLoading(true);
    try {
      // Check if assignment changed
      const assignmentChanged = assignedTo && assignedTo !== task.assigned_to;
      
      // If task is being reassigned, get the assignee's role and set appropriate pipeline
      let newStatus = status as any;
      if (assignmentChanged && (currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation')) {
        const { data: assigneeData } = await supabase
          .from('profiles')
          .select('user_roles(role)')
          .eq('id', assignedTo)
          .single();
        
        const assigneeRole = assigneeData?.user_roles?.[0]?.role;
        
        // Set status to assignee's default pipeline
        if (assigneeRole === 'client_service') {
          newStatus = 'new_calls';
        } else if (assigneeRole === 'designer') {
          newStatus = 'todo';
        } else if (assigneeRole === 'estimation') {
          newStatus = 'todo';
        } else if (assigneeRole === 'operations') {
          newStatus = 'production';
        } else if (assigneeRole === 'technical_head') {
          newStatus = 'under_review';
        }
      }
      
      // Check if status changed (either manually or due to reassignment)
      const statusChanged = newStatus !== task.status;
      
      let updateData: any = {
        title,
        description: description || null,
        priority: priority as "low" | "medium" | "high" | "urgent",
        due_date: dueDate || null,
        assigned_by: assignedBy || null,
        client_name: clientName || null,
        supplier_name: supplierName || null,
        my_status: myStatus as "pending" | "done_from_my_side",
        type: taskType as "quotation" | "invoice" | "design" | "general" | "production",
        status: newStatus,
        admin_remarks: adminRemarks || null,
        ...(statusChanged && {
          previous_status: task.status as any,
          status_changed_at: new Date().toISOString(),
        }),
        // Allow admin, technical_head, and estimation to reassign tasks
        ...(assignedTo && (currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') && {
          assigned_to: assignedTo
        }),
      };

      // Handle sending task to designer mockup from edit dialog
      if (status === 'send_to_designer_mockup') {
        // Get designer user
        const { data: designerUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'designer')
          .limit(1);
        
        if (!designerUsers || designerUsers.length === 0) {
          toast.error('No designer found');
          setLoading(false);
          return;
        }

        updateData = {
          ...updateData,
          status: 'mockup',
          assigned_to: designerUsers[0].user_id,
          sent_to_designer_mockup: true,
          mockup_completed_by_designer: false,
          previous_status: task.status,
          status_changed_at: new Date().toISOString(),
        };
      }

      // Handle returning task from designer to estimation
      if (status === 'return_to_estimation') {
        // Find the original estimation user from audit log
        const { data: auditLog } = await supabase
          .from('task_audit_log')
          .select('old_values')
          .eq('task_id', task.id)
          .eq('action', 'status_changed')
          .order('created_at', { ascending: false })
          .limit(10);
        
        // Find the last assigned_to before it was sent to designer
        let originalAssignedTo = task.assigned_to;
        if (auditLog && auditLog.length > 0) {
          for (const log of auditLog) {
            const oldValues = log.old_values as any;
            if (oldValues?.status !== 'mockup' && oldValues?.status !== 'designer_mockup' && oldValues?.assigned_to) {
              originalAssignedTo = oldValues.assigned_to;
              break;
            }
          }
        }

        updateData = {
          ...updateData,
          status: 'todo',
          assigned_to: originalAssignedTo,
          mockup_completed_by_designer: true,
          previous_status: task.status,
          status_changed_at: new Date().toISOString(),
        };
      }
      
      // Log the action with device tracking
      await logTaskAction({
        task_id: task.id,
        action: statusChanged ? 'status_changed' : 'updated',
        old_values: task,
        new_values: updateData,
      });

      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", task.id);

      if (error) throw error;

      if (status === 'send_to_designer_mockup') {
        toast.success("Task sent to designer's mockup pipeline");
      } else if (status === 'return_to_estimation') {
        toast.success("Task returned to estimation with mockup completed");
      } else if (statusChanged) {
        toast.success("Task updated and moved to new pipeline");
      } else {
        toast.success("Task updated successfully");
      }
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
      // Log the deletion with device tracking
      await logTaskAction({
        task_id: task.id,
        action: 'deleted',
        old_values: task,
        new_values: null,
      });

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
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Task
            {task.sent_to_designer_mockup && task.status === 'mockup' && (
              <Badge className="bg-amber-500 text-white animate-pulse">
                🎨 Mockup Pipeline
              </Badge>
            )}
            {task.mockup_completed_by_designer && (
              <Badge className="bg-green-500 text-white">
                ✓ Mockup Done
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="edit" className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edit">Edit Task</TabsTrigger>
            <TabsTrigger value="activity">Activity Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="h-full overflow-hidden">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 h-full overflow-hidden">
              <div className="space-y-4 overflow-y-auto pr-2 max-h-[calc(90vh-16rem)]">
              {/* ... keep existing form fields ... */}
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
              onChange={(e) => {
                setDescription(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              placeholder="Add task details"
              className="min-h-[200px] resize-y"
              style={{ height: 'auto' }}
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

          {/* Admin Remarks - Show for admins or if task has been sent back */}
          {(isAdmin || currentUserRole === 'admin' || task.sent_back_to_designer || task.status === 'designer_done_production') && (
            <div className="space-y-2">
              <Label htmlFor="edit-adminRemarks" className="flex items-center gap-2">
                Admin Remarks for Designer
                {task.sent_back_to_designer && (
                  <Badge variant="destructive" className="text-xs">Task Sent Back</Badge>
                )}
              </Label>
              <Textarea
                id="edit-adminRemarks"
                value={adminRemarks}
                onChange={(e) => setAdminRemarks(e.target.value)}
                placeholder="Enter detailed remarks for the designer about what needs to be changed or reviewed..."
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                These remarks will be visible to the designer when they view this task.
              </p>
            </div>
          )}

          {/* Products Manager */}
          <div className="border-t pt-4 mt-4">
            <TaskProductsManager 
              taskId={task.id} 
              isAdmin={isAdmin || currentUserRole === 'admin' || currentUserRole === 'technical_head'}
              userRole={viewingUserRole || currentUserRole}
              readOnly={false}
            />
          </div>

          {/* Assign To field - always visible for admins, estimation, and technical_head */}
          {(currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') && (
            <div className="space-y-2">
              <Label htmlFor="edit-assignedTo">
                {currentUserRole === 'admin' ? 'Assign/Reassign To Anyone' : 'Assign To'}
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => {
                    const role = member.user_roles?.[0]?.role || 'No role';
                    const formattedRole = role === 'technical_head' ? 'Technical Head' : 
                                         role === 'client_service' ? 'Client Service Executive' :
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-myStatus">My Status</Label>
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
              <Label htmlFor="edit-taskType">Type</Label>
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
          <div className="space-y-2">
            <Label htmlFor="edit-status">Move to Pipeline</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  // PRIORITY: If opened from Admin Dashboard - ONLY show admin-specific columns
                  // This takes precedence over all other role checks
                  if (isAdminDashboard === true) {
                    return (
                      <>
                        <SelectItem value="admin_approval">Admin Cost Approval</SelectItem>
                        <SelectItem value="approved">Approve</SelectItem>
                        <SelectItem value="with_client">With Client</SelectItem>
                        <SelectItem value="approved_designer">Approved (Designer)</SelectItem>
                      </>
                    );
                  }
                  
                  // ADMINS SEE ALL PIPELINES - they can move tasks anywhere (but NOT from admin dashboard)
                  if ((currentUserRole === 'admin' || viewingUserRole === 'admin') && !isAdminDashboard) {
                    return (
                      <>
                        <SelectItem value="todo">To-Do List (GENERAL)</SelectItem>
                        <SelectItem value="supplier_quotes">Supplier Quotes</SelectItem>
                        <SelectItem value="client_approval">Client Approval</SelectItem>
                        <SelectItem value="admin_approval">Admin Cost Approval</SelectItem>
                        <SelectItem value="quotation_bill">Quotation Bill</SelectItem>
                        <SelectItem value="mockup">MOCKUP (Designer)</SelectItem>
                        <SelectItem value="with_client">With Client (Designer)</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="final_invoice">Final Invoice</SelectItem>
                        <SelectItem value="approval">Approval (Operations)</SelectItem>
                        <SelectItem value="delivery">Delivery (Operations)</SelectItem>
                        <SelectItem value="developing">Developing (Tech)</SelectItem>
                        <SelectItem value="testing">Testing (Tech)</SelectItem>
                        <SelectItem value="under_review">Under Review (Tech)</SelectItem>
                        <SelectItem value="deployed">Deployed (Tech)</SelectItem>
                        <SelectItem value="trial_and_error">Trial and Error (Tech)</SelectItem>
                        <SelectItem value="new_calls">New Calls (Client Service)</SelectItem>
                        <SelectItem value="follow_up">Follow Up (Client Service)</SelectItem>
                        <SelectItem value="quotation">Quotation (Client Service)</SelectItem>
                        <SelectItem value="send_to_designer_mockup">→ Send to Designer Mockup</SelectItem>
                        <SelectItem value="return_to_estimation">→ Return to Estimation (Mockup Done)</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </>
                    );
                  }
                  
                  // For non-admins: Show pipeline based on assignee's role if set, otherwise current user's role
                  let roleToUse = viewingUserRole || currentUserRole;
                  
                  if (assignedTo && teamMembers.length > 0) {
                    const assignee = teamMembers.find(m => m.id === assignedTo);
                    if (assignee?.user_roles?.[0]?.role) {
                      roleToUse = assignee.user_roles[0].role;
                    }
                  }
                  
                  if (roleToUse === 'estimation') {
                    return (
                      <>
                        <SelectItem value="todo">To-Do List</SelectItem>
                        <SelectItem value="supplier_quotes">Supplier Quotes</SelectItem>
                        <SelectItem value="client_approval">Client Approval</SelectItem>
                        <SelectItem value="admin_approval">Admin Cost Approval</SelectItem>
                        <SelectItem value="quotation_bill">Quotation Bill</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="final_invoice">Final Invoice</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="send_to_designer_mockup">→ Send to Designer Mockup</SelectItem>
                      </>
                    );
                  } else if (roleToUse === 'designer') {
                    return (
                      <>
                        <SelectItem value="todo">To-Do List</SelectItem>
                        <SelectItem value="mockup">MOCKUP</SelectItem>
                        <SelectItem value="with_client">With Client</SelectItem>
                        <SelectItem value="production">PRODUCTION</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                        <SelectItem value="return_to_estimation">→ Return to Estimation (Mockup Done)</SelectItem>
                      </>
                    );
                  } else if (roleToUse === 'client_service') {
                    return (
                      <>
                        <SelectItem value="new_calls">New Calls</SelectItem>
                        <SelectItem value="follow_up">Follow Up</SelectItem>
                        <SelectItem value="quotation">Quotation</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </>
                    );
                  } else if (roleToUse === 'operations') {
                    return (
                      <>
                        <SelectItem value="todo">To-Do List</SelectItem>
                        <SelectItem value="approval">Approval</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </>
                    );
                  } else if (roleToUse === 'technical_head') {
                    return (
                      <>
                        <SelectItem value="todo">To-Do</SelectItem>
                        <SelectItem value="developing">Developing</SelectItem>
                        <SelectItem value="testing">Testing</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="deployed">Deployed</SelectItem>
                        <SelectItem value="trial_and_error">Trial and Error</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </>
                    );
                  } else {
                    // Admin or default - show all pipelines including client_service
                    return (
                      <>
                        <SelectItem value="todo">To-Do List</SelectItem>
                        <SelectItem value="supplier_quotes">Supplier Quotes</SelectItem>
                        <SelectItem value="client_approval">Client Approval</SelectItem>
                        <SelectItem value="admin_approval">Admin Cost Approval</SelectItem>
                        <SelectItem value="quotation_bill">Quotation Bill</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                        <SelectItem value="final_invoice">Final Invoice</SelectItem>
                        <SelectItem value="mockup">MOCKUP</SelectItem>
                        <SelectItem value="with_client">With Client</SelectItem>
                        <SelectItem value="approval">Approval</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="developing">Developing</SelectItem>
                        <SelectItem value="testing">Testing</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="deployed">Deployed</SelectItem>
                        <SelectItem value="trial_and_error">Trial and Error</SelectItem>
                        <SelectItem value="new_calls">New Calls</SelectItem>
                        <SelectItem value="follow_up">Follow Up</SelectItem>
                        <SelectItem value="quotation">Quotation</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </>
                    );
                  }
                })()}
              </SelectContent>
            </Select>
          </div>
          </div>
          <DialogFooter className="flex justify-between items-center pt-4 border-t">
            <div>
              {(isAdmin || currentUserRole === 'admin') && (
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
          </TabsContent>

          <TabsContent value="activity" className="h-full overflow-hidden mt-4">
            <TaskActivityTimeline taskId={task.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
