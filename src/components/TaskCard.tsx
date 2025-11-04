import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, GripVertical, Edit2, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  status_changed_at: string;
  created_by: string;
  assigned_to: string | null;
  assigned_by: string | null;
  client_name: string | null;
  supplier_name: string | null;
  type: string;
  my_status: string;
  assigned_user_role?: string | null;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
};

type TaskCardProps = {
  task: Task;
  isDragging?: boolean;
  onEdit?: (task: Task) => void;
  isAdminView?: boolean;
  onTaskUpdated?: () => void;
  userRole?: string;
  isAdminOwnPanel?: boolean;
};

export const TaskCard = ({ task, isDragging, onEdit, isAdminView, onTaskUpdated, userRole, isAdminOwnPanel }: TaskCardProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-priority-urgent text-white";
      case "high":
        return "bg-priority-high text-white";
      case "medium":
        return "bg-priority-medium text-white";
      case "low":
        return "bg-priority-low text-white";
      default:
        return "bg-muted";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "quotation":
        return "bg-purple-500 text-white hover:bg-purple-600";
      case "invoice":
        return "bg-green-500 text-white hover:bg-green-600";
      case "general":
        return "bg-gray-500 text-white hover:bg-gray-600";
      default:
        return "bg-muted";
    }
  };

  const getRolePipelines = (role: string) => {
    console.log("TaskCard - Getting pipelines for role:", role, "| isAdminOwnPanel:", isAdminOwnPanel);
    let allPipelines: { value: string; label: string }[] = [];
    
    // Special case: Tasks in admin_approval status - only show "Approved" option
    if (task.status === "admin_approval") {
      console.log("Task in admin_approval - only showing Approved option");
      return [{ value: "approved", label: "Approved" }];
    }
    
    // Special case: Tasks in with_client status for DESIGNER role - only show "Approved" option for admin
    if (task.status === "with_client" && isAdminOwnPanel && role?.toLowerCase() === "designer") {
      console.log("Designer task in with_client (admin panel) - only showing Approved option");
      return [{ value: "approved_designer", label: "Approved" }];
    }
    
    switch (role?.toLowerCase()) {
      case "estimation":
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "supplier_quotes", label: "Supplier Quotes" },
          { value: "client_approval", label: "Client Approval" },
          { value: "admin_approval", label: "Admin Cost Approval" },
          { value: "quotation_bill", label: "Quotation Bill" },
          { value: "production", label: "Production" },
          { value: "final_invoice", label: "Final Invoice" },
          { value: "done", label: "Done" },
          { value: "send_to_designer_mockup", label: "→ Send to Designer Mockup" },
        ];
        break;
      case "designer":
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "design", label: "Design" },
          { value: "mockup", label: "MOCKUP" },
          { value: "client_approval", label: "Client Approval" },
          { value: "production_file", label: "PRODUCTION FILE" },
          { value: "with_client", label: "With Client" },
          { value: "done", label: "Done" },
        ];
        // Add option to send mockup back to estimation if task was sent from estimation
        if (task.sent_to_designer_mockup && task.status === "mockup") {
          allPipelines.push({ value: "return_to_estimation", label: "→ Return to Estimation (Mockup Done)" });
        }
        break;
      case "operations":
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "approval", label: "Approval" },
          { value: "production", label: "Production" },
          { value: "delivery", label: "Delivery" },
          { value: "done", label: "Done" },
        ];
        break;
      case "technical_head":
        allPipelines = [
          { value: "todo", label: "To-Do" },
          { value: "developing", label: "Developing" },
          { value: "testing", label: "Testing" },
          { value: "under_review", label: "Under Review" },
          { value: "deployed", label: "Deployed" },
          { value: "trial_and_error", label: "Trial and Error" },
          { value: "done", label: "Done" },
        ];
        break;
      default:
        // Default to operations for unknown roles
        console.warn("Unknown role, defaulting to operations:", role);
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "approval", label: "Approval" },
          { value: "production", label: "Production" },
          { value: "delivery", label: "Delivery" },
          { value: "done", label: "Done" },
        ];
        break;
    }
    
    // Filter out the current pipeline the task is in
    return allPipelines.filter(pipeline => pipeline.value !== task.status);
  };

  const pipelines = getRolePipelines(task.assigned_user_role || userRole || "operations");
  console.log("TaskCard - Task:", task.title, "| Assigned User Role:", task.assigned_user_role, "| Viewing Role:", userRole, "| Current status:", task.status, "| Available pipelines:", pipelines.length);

  const handleMoveTask = async (newStatus: string) => {
    if (newStatus === task.status || isMoving) return;

    setIsMoving(true);
    try {
      let finalStatus = newStatus;
      let updateData: any = {
        status: finalStatus as any,
        previous_status: task.status as any,
        status_changed_at: new Date().toISOString(),
      };

      // Special handling for admin approval - convert "approved" to "quotation_bill"
      if (newStatus === 'approved' && task.status === 'admin_approval') {
        finalStatus = 'quotation_bill';
        updateData.status = finalStatus;
        console.log('✅ Admin approval: Converting "approved" to "quotation_bill" for estimation');
      }
      
      // Handle designer approval from with_client
      if (newStatus === 'approved_designer' && task.status === 'with_client') {
        finalStatus = 'done';
        updateData.status = finalStatus;
        console.log('✅ Designer approved: Moving task to done');
      }
      
      // Handle sending task to designer mockup
      if (newStatus === 'send_to_designer_mockup') {
        // Get designer user
        const { data: designerUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'designer')
          .limit(1);
        
        if (!designerUsers || designerUsers.length === 0) {
          toast.error('No designer found');
          setIsMoving(false);
          return;
        }

        updateData = {
          status: 'mockup',
          assigned_to: designerUsers[0].user_id,
          sent_to_designer_mockup: true,
          mockup_completed_by_designer: false,
          previous_status: task.status,
          status_changed_at: new Date().toISOString(),
        };
        console.log('✅ Sending task to designer mockup');
      }
      
      // Handle returning task from designer to estimation
      if (newStatus === 'return_to_estimation') {
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
          status: 'todo',
          assigned_to: originalAssignedTo, // Restore original estimation user
          mockup_completed_by_designer: true,
          previous_status: task.status,
          status_changed_at: new Date().toISOString(),
        };
        console.log('✅ Returning task to estimation user:', originalAssignedTo);
      }

      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", task.id);

      if (error) throw error;

      let successMessage = "Task moved successfully";
      if (finalStatus === 'quotation_bill' && newStatus === 'approved') {
        successMessage = "Task approved! Moved to Quotation Bill in estimation's panel";
      } else if (newStatus === 'send_to_designer_mockup') {
        successMessage = "Task sent to designer's mockup pipeline";
      } else if (newStatus === 'return_to_estimation') {
        successMessage = "Task returned to estimation with mockup completed";
      } else if (newStatus === 'approved_designer' && task.status === 'with_client') {
        successMessage = "Designer work approved! Task marked as done";
      }
      
      toast.success(successMessage);
      setPopoverOpen(false);
      onTaskUpdated?.();
    } catch (error: any) {
      console.error("Error moving task:", error);
      toast.error(error.message || "Failed to move task");
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg",
        task.mockup_completed_by_designer && "border-2 border-green-500 bg-green-50 dark:bg-green-950/20"
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-medium text-sm line-clamp-2 flex-1">{task.title}</h4>
              <div className="flex gap-1">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-accent"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2 bg-card border z-50" align="end">
                    <div className="space-y-1">
                      <p className="text-xs font-medium mb-2 px-2">Move to Pipeline</p>
                      {pipelines.map((pipeline) => (
                        <Button
                          key={pipeline.value}
                          variant={task.status === pipeline.value ? "secondary" : "ghost"}
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => handleMoveTask(pipeline.value)}
                          disabled={isMoving || task.status === pipeline.value}
                        >
                          {pipeline.label}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {onEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(task);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {task.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className={cn("text-xs capitalize", getPriorityColor(task.priority))}
              >
                {task.priority}
              </Badge>
              <Badge
                variant="secondary"
                className={cn("text-xs uppercase", getTypeColor(task.type))}
              >
                {task.type}
              </Badge>
              {task.mockup_completed_by_designer && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 animate-pulse"
                >
                  ✓ Mockup Ready
                </Badge>
              )}
              {task.assigned_by && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  Assigned by {task.assigned_by}
                </Badge>
              )}
              {task.supplier_name && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  Supplier: {task.supplier_name}
                </Badge>
              )}
              {task.due_date && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{format(new Date(task.due_date), "MMM d")}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(task.status_changed_at), { addSuffix: true })}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
