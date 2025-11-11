import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AITaskInput } from "./AITaskInput";
import { TaskProductsManager } from "./TaskProductsManager";
import { enrichLatestAuditLog } from "@/lib/enrichAuditLog";

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
  const [showAIInput, setShowAIInput] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [originalInput, setOriginalInput] = useState<string | null>(null);
  const [tempProducts, setTempProducts] = useState<any[]>([]);

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

  const handleAITaskParsed = (taskData: any) => {
    // Pre-fill form with AI-parsed data
    if (taskData.title) setTitle(taskData.title);
    if (taskData.description) setDescription(taskData.description);
    if (taskData.client_name) setClientName(taskData.client_name);
    if (taskData.supplier_name) setSupplierName(taskData.supplier_name);
    if (taskData.priority) setPriority(taskData.priority);
    if (taskData.type) setTaskType(taskData.type);
    if (taskData.due_date) {
      const date = new Date(taskData.due_date);
      setDueDate(date.toISOString().split('T')[0]);
    }
    
    setAiGenerated(taskData.ai_generated || false);
    setAiConfidence(taskData.ai_confidence_score || null);
    setOriginalInput(taskData.original_input || null);
    setShowAIInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate priority value
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        throw new Error(`Invalid priority value: ${priority}`);
      }

      const taskData: any = {
        title,
        description: description || null,
        priority: priority,
        due_date: dueDate || null,
        created_by: user.id,
        status: (currentUserRole === 'admin' || currentUserRole === 'technical_head') 
          ? selectedPipeline 
          : "todo",
        assigned_by: assignedBy || null,
        client_name: clientName || null,
        supplier_name: supplierName || null,
        my_status: myStatus,
        type: taskType,
        ai_generated: aiGenerated,
        ai_confidence_score: aiConfidence,
        original_input: originalInput,
      };

      // Admin and technical_head can assign to selected member, others create self-assigned tasks
      if ((currentUserRole === 'admin' || currentUserRole === 'technical_head') && selectedMember) {
        taskData.assigned_to = selectedMember;
      } else if (defaultAssignedTo) {
        taskData.assigned_to = defaultAssignedTo;
      } else {
        taskData.assigned_to = user.id; // Self-assigned task
      }

      const { data: insertedTask, error } = await supabase
        .from("tasks")
        .insert(taskData)
        .select()
        .single();

      if (error) {
        console.error('Task creation error:', error);
        console.error('Task data sent:', taskData);
        throw error;
      }

      // Enrich the audit log with device information
      if (insertedTask) {
        await enrichLatestAuditLog(insertedTask.id);
      }

      // If there are products to add, insert them now
      if (tempProducts.length > 0 && insertedTask) {
        const productsToInsert = tempProducts.map((product, index) => {
          const { id, ...productData } = product; // Remove temp ID
          return {
            ...productData,
            task_id: insertedTask.id,
            position: index
          };
        });

        const { error: productsError } = await supabase
          .from('task_products')
          .insert(productsToInsert);

        if (productsError) {
          console.error('Error adding products:', productsError);
          toast.error('Task created but failed to add products');
        } else {
          toast.success(`Task created successfully with ${tempProducts.length} product(s)`);
        }
      } else {
        toast.success("Task created successfully");
      }

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
      setAiGenerated(false);
      setAiConfidence(null);
      setOriginalInput(null);
      setTempProducts([]);
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error(error.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AITaskInput
        open={showAIInput}
        onOpenChange={setShowAIInput}
        onTaskParsed={handleAITaskParsed}
      />
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Create New Task</span>
              {aiGenerated && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  AI Generated
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAIInput(true)}
            className="w-full"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create with AI Assistant
          </Button>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-hidden">
            <div className="space-y-4 overflow-y-auto pr-2 max-h-[calc(90vh-16rem)]">
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

            {/* Products Manager for new task */}
            <div className="border-t pt-4 mt-4">
              <TaskProductsManager 
                isAdmin={currentUserRole === 'admin' || currentUserRole === 'technical_head'}
                userRole={currentUserRole}
                onProductsChange={(products) => setTempProducts(products)}
                readOnly={false}
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
                            <SelectItem value="mockup">MOCKUP</SelectItem>
                            <SelectItem value="with_client">With Client</SelectItem>
                            <SelectItem value="production">PRODUCTION</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </>
                        );
                      } else if (memberRole === 'estimation') {
                        return (
                          <>
                            <SelectItem value="todo">To-Do (RFQ/GENERAL)</SelectItem>
                            <SelectItem value="supplier_quotes">Supplier Quotes</SelectItem>
                            <SelectItem value="client_approval">Client Approval</SelectItem>
                            <SelectItem value="admin_approval">Admin Cost Approval</SelectItem>
                            <SelectItem value="quotation_bill">Quotation Bill</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                            <SelectItem value="final_invoice">Final Invoice</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </>
                        );
                      } else if (memberRole === 'operations') {
                        return (
                          <>
                            <SelectItem value="todo">To-Do List</SelectItem>
                            <SelectItem value="approval">Approval</SelectItem>
                            <SelectItem value="production">Production</SelectItem>
                            <SelectItem value="delivery">Delivery</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </>
                        );
                      } else if (memberRole === 'technical_head') {
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
                        return (
                          <>
                            <SelectItem value="todo">To-Do List</SelectItem>
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
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
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
    </>
  );
};