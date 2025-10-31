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
  assigned_by: string | null;
  client_name: string | null;
  supplier_name: string | null;
  type: string;
};

type TaskCardProps = {
  task: Task;
  isDragging?: boolean;
  onEdit?: (task: Task) => void;
  isAdminView?: boolean;
  onTaskUpdated?: () => void;
  userRole?: string;
};

export const TaskCard = ({ task, isDragging, onEdit, isAdminView, onTaskUpdated, userRole }: TaskCardProps) => {
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
    console.log("TaskCard - Getting pipelines for role:", role);
    let allPipelines: { value: string; label: string }[] = [];
    
    switch (role?.toLowerCase()) {
      case "estimation":
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "estimation", label: "Estimation" },
          { value: "design", label: "Design" },
          { value: "supplier_quotes", label: "Supplier Quotes" },
          { value: "client_approval", label: "Client Approval" },
          { value: "admin_approval", label: "Admin Cost Approval" },
          { value: "quotation_bill", label: "Quotation Bill" },
        ];
        break;
      case "designer":
        allPipelines = [
          { value: "design", label: "Design" },
          { value: "mockup_pending", label: "Mockup Pending" },
          { value: "client_approval", label: "Client Approval" },
        ];
        break;
      case "operations":
        allPipelines = [
          { value: "production", label: "Production" },
          { value: "final_invoice", label: "Final Invoice" },
          { value: "production_pending", label: "Production Pending" },
          { value: "with_client", label: "With Client" },
          { value: "approval", label: "Approval" },
          { value: "delivery", label: "Delivery" },
          { value: "done", label: "Done" },
        ];
        break;
      default:
        // Default to operations for unknown roles
        console.warn("Unknown role, defaulting to operations:", role);
        allPipelines = [
          { value: "production", label: "Production" },
          { value: "final_invoice", label: "Final Invoice" },
          { value: "production_pending", label: "Production Pending" },
          { value: "with_client", label: "With Client" },
          { value: "approval", label: "Approval" },
          { value: "delivery", label: "Delivery" },
          { value: "done", label: "Done" },
        ];
        break;
    }
    
    // Filter out the current pipeline the task is in
    return allPipelines.filter(pipeline => pipeline.value !== task.status);
  };

  const pipelines = getRolePipelines(userRole || "operations");
  console.log("TaskCard - Task:", task.title, "| Role:", userRole, "| Current status:", task.status, "| Available pipelines:", pipelines.length);

  const handleMoveTask = async (newStatus: string) => {
    if (newStatus === task.status || isMoving) return;

    setIsMoving(true);
    try {
      // Special handling for admin approval - convert "approved" to "quotation_bill"
      let finalStatus = newStatus;
      if (newStatus === 'approved' && task.status === 'admin_approval') {
        finalStatus = 'quotation_bill';
        console.log('✅ Admin approval: Converting "approved" to "quotation_bill" for estimation');
      }

      const { error } = await supabase
        .from("tasks")
        .update({
          status: finalStatus as any,
          previous_status: task.status as any,
          status_changed_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;

      const successMessage = finalStatus === 'quotation_bill' && newStatus === 'approved'
        ? "Task approved! Moved to Quotation Bill in estimation's panel"
        : "Task moved successfully";
      
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
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg"
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
