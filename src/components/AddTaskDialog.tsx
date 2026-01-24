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
import { DuplicateTaskDialog } from "./DuplicateTaskDialog";

type TeamMember = {
  id: string;
  full_name: string;
  email: string;
  user_roles?: { role: string }[];
};

type SimilarTask = {
  id: string;
  title: string;
  client_name: string | null;
  status: string;
  created_at: string;
  description: string | null;
  type: string | null;
  assigned_to: string | null;
  profiles?: { full_name: string | null; email: string } | null;
};

type AddTaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskAdded: () => void;
  defaultAssignedTo?: string;
  viewingUserRole?: string;
  onEditTask?: (taskId: string) => void;
};

export const AddTaskDialog = ({ open, onOpenChange, onTaskAdded, defaultAssignedTo, viewingUserRole, onEditTask }: AddTaskDialogProps) => {
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
  
  // Duplicate detection state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [similarTasks, setSimilarTasks] = useState<SimilarTask[]>([]);
  const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [inlineSimilarTasks, setInlineSimilarTasks] = useState<SimilarTask[]>([]);

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

  // Auto-select appropriate pipeline when member is selected
  useEffect(() => {
    if (selectedMember && teamMembers.length > 0) {
      const member = teamMembers.find(m => m.id === selectedMember);
      const memberRole = member?.user_roles?.[0]?.role;
      
      // Set default pipeline based on member's role
      if (memberRole === 'client_service') {
        setSelectedPipeline('new_calls');
      } else if (memberRole === 'designer') {
        setSelectedPipeline('todo');
      } else if (memberRole === 'estimation') {
        setSelectedPipeline('todo');
      } else if (memberRole === 'operations') {
        setSelectedPipeline('todo');
      } else if (memberRole === 'technical_head') {
        setSelectedPipeline('todo');
      } else {
        setSelectedPipeline('todo');
      }
    }
  }, [selectedMember, teamMembers]);

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

  // Check for similar tasks by title OR client name
  const checkForSimilarTasks = async (searchTitle: string, searchClientName: string): Promise<SimilarTask[]> => {
    const trimmedTitle = searchTitle.trim();
    const trimmedClientName = searchClientName.trim();
    
    if (!trimmedTitle && !trimmedClientName) return [];
    
    // Build the query - search by title OR client_name
    let query = supabase
      .from('tasks')
      .select('id, title, client_name, status, created_at, description, type, assigned_to')
      .is('deleted_at', null)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(10);

    // Use OR logic: match title OR client_name
    if (trimmedTitle && trimmedClientName) {
      query = query.or(`title.ilike.%${trimmedTitle}%,client_name.ilike.%${trimmedClientName}%`);
    } else if (trimmedTitle) {
      query = query.ilike('title', `%${trimmedTitle}%`);
    } else if (trimmedClientName) {
      query = query.ilike('client_name', `%${trimmedClientName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking for similar tasks:', error);
      return [];
    }

    // Fetch profile info separately for assigned users
    const tasksWithProfiles: SimilarTask[] = [];
    for (const task of data || []) {
      let profile = null;
      if (task.assigned_to) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', task.assigned_to)
          .single();
        profile = profileData;
      }
      tasksWithProfiles.push({
        ...task,
        profiles: profile
      });
    }

    return tasksWithProfiles;
  };

  // Debounced inline duplicate check when title or client name changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if ((title.trim().length >= 3 || clientName.trim().length >= 3) && !skipDuplicateCheck) {
        setIsCheckingDuplicates(true);
        const similar = await checkForSimilarTasks(title, clientName);
        setInlineSimilarTasks(similar);
        setIsCheckingDuplicates(false);
      } else {
        setInlineSimilarTasks([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [title, clientName, skipDuplicateCheck]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for duplicates if title or client name is provided and we haven't skipped the check
    if ((title.trim() || clientName.trim()) && !skipDuplicateCheck) {
      setLoading(true);
      const similar = await checkForSimilarTasks(title, clientName);
      setLoading(false);
      
      if (similar.length > 0) {
        setSimilarTasks(similar);
        setShowDuplicateDialog(true);
        return;
      }
    }
    
    // Proceed with task creation
    await createTask();
  };

  const createTask = async () => {
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
        status: (currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') 
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

      // Admin, technical_head, and estimation can assign to selected member, others create self-assigned tasks
      if ((currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') && selectedMember) {
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
        throw error;
      }

      // Enrich the audit log with device information (fire-and-forget - non-blocking)
      if (insertedTask) {
        enrichLatestAuditLog(insertedTask.id);
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
      setSkipDuplicateCheck(false);
      setSimilarTasks([]);
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.error(error.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  const handleEditExisting = (taskId: string) => {
    setShowDuplicateDialog(false);
    onOpenChange(false);
    if (onEditTask) {
      onEditTask(taskId);
    } else {
      toast.info("Please navigate to the task in your board to edit it");
    }
  };

  const handleCreateNewAnyway = () => {
    setShowDuplicateDialog(false);
    setSkipDuplicateCheck(true);
    // Trigger task creation directly
    createTask();
  };

  return (
    <>
      <DuplicateTaskDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        similarTasks={similarTasks}
        clientName={clientName}
        onEditExisting={handleEditExisting}
        onCreateNew={handleCreateNewAnyway}
      />

      <AITaskInput
        open={showAIInput}
        onOpenChange={setShowAIInput}
        onTaskParsed={handleAITaskParsed}
      />
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
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
            className="w-full flex-shrink-0"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create with AI Assistant
          </Button>

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setSkipDuplicateCheck(false); // Reset skip when title changes
                }}
                placeholder="Enter task title"
                required
              />
              {isCheckingDuplicates && (
                <p className="text-xs text-muted-foreground">Checking for similar tasks...</p>
              )}
            </div>
            
            {/* Inline duplicate warning */}
            {inlineSimilarTasks.length > 0 && !skipDuplicateCheck && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-warning-foreground">
                  ⚠️ Similar task(s) found ({inlineSimilarTasks.length})
                </p>
                <div className="max-h-32 overflow-y-auto space-y-2">
                  {inlineSimilarTasks.slice(0, 3).map((task) => (
                    <div 
                      key={task.id} 
                      className="text-xs bg-background p-2 rounded border cursor-pointer hover:bg-muted"
                      onClick={() => handleEditExisting(task.id)}
                    >
                      <p className="font-medium truncate">{task.title}</p>
                      <p className="text-muted-foreground">
                        {task.client_name && `Client: ${task.client_name} • `}
                        Status: {task.status.replace(/_/g, ' ')}
                        {task.profiles?.full_name && ` • ${task.profiles.full_name}`}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSkipDuplicateCheck(true)}
                    className="text-xs"
                  >
                    Create anyway
                  </Button>
                  <Button 
                    type="button" 
                    variant="default" 
                    size="sm"
                    onClick={() => {
                      setSimilarTasks(inlineSimilarTasks);
                      setShowDuplicateDialog(true);
                    }}
                    className="text-xs"
                  >
                    View all matches
                  </Button>
                </div>
              </div>
            )}
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
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setSkipDuplicateCheck(false); // Reset skip when client name changes
                  }}
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

            {(currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') && (
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
            {(currentUserRole === 'admin' || currentUserRole === 'technical_head' || currentUserRole === 'estimation') && selectedMember && (
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
                      } else if (memberRole === 'client_service') {
                        return (
                          <>
                            <SelectItem value="new_calls">New Calls</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="quotation">Quotation</SelectItem>
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