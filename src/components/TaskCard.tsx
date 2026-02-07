import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Calendar, GripVertical, Edit2, Clock, ArrowRight, Package, RotateCcw, Truck, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { TaskAgingIndicator } from "./TaskAgingIndicator";
import { EstimationTaskTimer } from "./EstimationTaskTimer";
import { useTaskActivity } from "@/hooks/useTaskActivity";
import { DesignerSendBackButton } from "./DesignerSendBackButton";
import { OperationsTaskDetails } from "./OperationsTaskDetails";
import { SupplierQuotesCheckInDialog } from "./SupplierQuotesCheckInDialog";

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
  suppliers: string[] | null;
  delivery_instructions: string | null;
  delivery_address: string | null;
  type: string;
  my_status: string;
  assigned_user_role?: string | null;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
  came_from_designer_done?: boolean;
  sent_back_to_designer?: boolean;
  admin_remarks?: string | null;
  last_activity_at?: string;
  source_app?: string | null;
  external_task_id?: string | null;
  revision_notes?: string | null;
  is_mockup_task?: boolean; // Flag for tasks from mockup_tasks table
  design_type?: string | null;
  source_origin?: string | null;
  task_type?: string | null;
  origin_label?: string | null;
  category?: string | null;
};

type TaskCardProps = {
  task: Task;
  isDragging?: boolean;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  isAdminView?: boolean;
  onTaskUpdated?: () => void;
  userRole?: string;
  isAdminOwnPanel?: boolean;
  showFullCrud?: boolean;
  onSendBack?: (task: Task) => void;
  onSendToProduction?: (task: Task) => void;
};

export const TaskCard = ({ task, isDragging, onEdit, onDelete, isAdminView, onTaskUpdated, userRole, isAdminOwnPanel, showFullCrud, onSendBack, onSendToProduction }: TaskCardProps) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [productsStats, setProductsStats] = useState<{ total: number; approved: number } | null>(null);
  const [showOperationsDetails, setShowOperationsDetails] = useState(false);
  const [assignedByName, setAssignedByName] = useState<string | null>(null);
  const [showSupplierQuotesCheckIn, setShowSupplierQuotesCheckIn] = useState(false);
  const [pendingMoveStatus, setPendingMoveStatus] = useState<string | null>(null);
  const { logActivity } = useTaskActivity();

  // Debug logging for delete button visibility
  useEffect(() => {
    if (isAdminView) {
      console.log(`🔍 TaskCard [${task.title}]: onDelete=${!!onDelete}, isAdminView=${isAdminView}, showFullCrud=${showFullCrud}, shouldShowDelete=${isAdminView && onDelete && !showFullCrud}`);
    }
  }, [isAdminView, onDelete, showFullCrud, task.title]);

  useEffect(() => {
    fetchProductStats();
    fetchAssignedByName();
    // Log task view
    logActivity(task.id, 'viewed');
  }, [task.id]);
  
  // Fetch the name of the person who assigned the task (if assigned_by is a UUID)
  const fetchAssignedByName = async () => {
    if (!task.assigned_by) {
      setAssignedByName(null);
      return;
    }
    
    // Check if assigned_by is a UUID (36 chars with dashes)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.assigned_by);
    
    if (isUUID) {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', task.assigned_by)
        .single();
      
      setAssignedByName(data?.full_name || task.assigned_by);
    } else {
      // It's already a name string
      setAssignedByName(task.assigned_by);
    }
  };

  const fetchProductStats = async () => {
    const { data } = await supabase
      .from('task_products')
      .select('approval_status')
      .eq('task_id', task.id);

    if (data && data.length > 0) {
      setProductsStats({
        total: data.length,
        approved: data.filter((p: any) => p.approval_status === 'approved').length
      });
    }
  };

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
    
    // PRIORITY: Special cases for Admin Dashboard - check these FIRST
    // Special case: Tasks in admin_approval status - only show "Approved" option
    if (task.status === "admin_approval" && isAdminOwnPanel) {
      console.log("Admin Dashboard - Task in admin_approval - only showing Approved option");
      return [{ value: "approved", label: "Approved" }];
    }
    
    // Special case: Tasks in with_client status - only show "Approved" option for admin panel
    if (task.status === "with_client" && isAdminOwnPanel) {
      console.log("Admin Dashboard - Designer task in with_client - only showing Approved option");
      return [{ value: "approved_designer", label: "Approved" }];
    }
    
    // ADMINS SEE ALL PIPELINES in their own task panel (not admin dashboard)
    if ((role?.toLowerCase() === 'admin' || isAdminOwnPanel) && !isAdminView) {
      console.log("Admin own panel - showing all pipelines");
      return [
        { value: "todo", label: "To-Do List (GENERAL)" },
        { value: "supplier_quotes", label: "Supplier Quotes" },
        { value: "client_approval", label: "Client Approval" },
        { value: "admin_approval", label: "Admin Cost Approval" },
        { value: "quotation_bill", label: "Quotation Bill" },
        { value: "mockup", label: "MOCKUP (Designer)" },
        { value: "with_client", label: "With Client (Designer)" },
        { value: "production", label: "Production" },
        { value: "final_invoice", label: "PENDING INVOICES" },
        { value: "approval", label: "Approval (Operations)" },
        { value: "delivery", label: "Delivery (Operations)" },
        { value: "developing", label: "Developing (Tech)" },
        { value: "testing", label: "Testing (Tech)" },
        { value: "under_review", label: "Under Review (Tech)" },
        { value: "deployed", label: "Deployed (Tech)" },
        { value: "trial_and_error", label: "Trial and Error (Tech)" },
        { value: "new_calls", label: "New Calls (Client Service)" },
        { value: "follow_up", label: "Follow Up (Client Service)" },
        { value: "quotation", label: "Quotation (Client Service)" },
        { value: "send_to_designer_mockup", label: "→ Send to Designer Mockup" },
        { value: "return_to_estimation", label: "→ Return to Estimation" },
        { value: "done", label: "Done" },
      ].filter(pipeline => pipeline.value !== task.status);
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
          { value: "final_invoice", label: "PENDING INVOICES" },
          { value: "done", label: "Done" },
          { value: "send_to_designer_mockup", label: "→ Send to Designer Mockup" },
        ];
        break;
      case "designer":
        allPipelines = [
          { value: "todo", label: "To-Do List" },
          { value: "mockup", label: "MOCKUP" },
          { value: "with_client", label: "With Client" },
          { value: "production", label: "PRODUCTION" },
          { value: "done", label: "Done" },
        ];
        // Add option to send mockup back to estimation if task was sent from estimation
        if (task.sent_to_designer_mockup) {
          allPipelines.push({ value: "return_to_estimation", label: "→ Return to Estimation (Mockup Done)" });
        }
        break;
      case "client_service":
        allPipelines = [
          { value: "new_calls", label: "New Calls" },
          { value: "follow_up", label: "Follow Up" },
          { value: "quotation", label: "Quotation" },
          { value: "done", label: "Done" },
        ];
        break;
      case "operations":
        allPipelines = [
          { value: "production", label: "PRODUCTION" },
          { value: "done", label: "DONE" },
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
          { value: "production", label: "PRODUCTION" },
          { value: "done", label: "DONE" },
        ];
        break;
    }
    
    // Filter out the current pipeline the task is in
    return allPipelines.filter(pipeline => pipeline.value !== task.status);
  };

  const pipelines = getRolePipelines(userRole || task.assigned_user_role || "operations");
  console.log("TaskCard - Task:", task.title, "| Viewing Role:", userRole, "| Assigned User Role:", task.assigned_user_role, "| Current status:", task.status, "| Available pipelines:", pipelines.length);

  const handleMoveTask = async (newStatus: string) => {
    if (newStatus === task.status || isMoving) return;

    // For supplier_quotes, show check-in dialog first (for quotation tasks only)
    if (newStatus === 'supplier_quotes' && task.type === 'quotation') {
      setPendingMoveStatus(newStatus);
      setShowSupplierQuotesCheckIn(true);
      setPopoverOpen(false);
      return;
    }

    // Otherwise, execute move directly
    await executeMove(newStatus);
  };

  const executeMove = async (newStatus: string) => {
    setIsMoving(true);
    try {
      let finalStatus = newStatus;
      let updateData: any = {
        status: finalStatus as any,
        previous_status: task.status as any,
        status_changed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      };

      // Special handling for admin approval - convert "approved" to "quotation_bill"
      if (newStatus === 'approved' && task.status === 'admin_approval') {
        finalStatus = 'quotation_bill';
        updateData.status = finalStatus;
        console.log('✅ Admin approval: Converting "approved" to "quotation_bill" for estimation');
      }
      
      // Handle designer approval from with_client
      if (newStatus === 'approved_designer' && task.status === 'with_client') {
        finalStatus = 'production';
        updateData.status = finalStatus;
        console.log('✅ Designer approved: Moving task to production');
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

        // Get current user ID
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        updateData = {
          status: 'mockup',
          assigned_to: designerUsers[0].user_id,
          assigned_by: currentUser?.id, // Store current estimator's ID
          sent_to_designer_mockup: true,
          mockup_completed_by_designer: false,
          previous_status: task.status,
          status_changed_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
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
          last_activity_at: new Date().toISOString(),
        };
        console.log('✅ Returning task to estimation user:', originalAssignedTo);
      }

      // Handle mockup tasks from mockup_tasks table differently
      if ((task as any).is_mockup_task) {
        // Map status for mockup_tasks table
        let mockupStatus = finalStatus;
        if (finalStatus === 'mockup') mockupStatus = 'pending';
        else if (finalStatus === 'with_client') mockupStatus = 'review';
        else if (finalStatus === 'done') mockupStatus = 'completed';
        else if (finalStatus === 'production') mockupStatus = 'in_progress';

        const { error } = await supabase
          .from("mockup_tasks")
          .update({ 
            status: mockupStatus,
            updated_at: new Date().toISOString()
          })
          .eq("id", task.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tasks")
          .update(updateData)
          .eq("id", task.id);

        if (error) throw error;
      }

      let successMessage = "Task moved successfully";
      if (finalStatus === 'quotation_bill' && newStatus === 'approved') {
        successMessage = "Task approved! Moved to Quotation Bill in estimation's panel";
      } else if (newStatus === 'send_to_designer_mockup') {
        successMessage = "Task sent to designer's mockup pipeline";
      } else if (newStatus === 'return_to_estimation') {
        successMessage = "Task returned to estimation with mockup completed";
      } else if (newStatus === 'approved_designer' && task.status === 'with_client') {
        successMessage = "Designer work approved! Task marked as done";
      } else if (newStatus === 'supplier_quotes') {
        successMessage = "Task moved to Supplier Quotes - Timer started!";
      }
      
      toast.success(successMessage);
      setPopoverOpen(false);
      setPendingMoveStatus(null);
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
        task.sent_to_designer_mockup && task.status === 'mockup' && "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 shadow-lg shadow-amber-500/50 animate-pulse",
        task.mockup_completed_by_designer && "border-2 border-green-500 bg-green-50 dark:bg-green-950/20 shadow-lg shadow-green-500/50",
        task.came_from_designer_done && task.status === 'production' && "border-2 border-purple-500 bg-purple-50 dark:bg-purple-950/20 shadow-lg shadow-purple-500/50",
        task.came_from_designer_done && task.status === 'todo' && "border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 shadow-lg shadow-emerald-500/50 ring-2 ring-emerald-400/50",
        task.sent_back_to_designer && task.status === 'todo' && "border-2 border-red-500 bg-red-50 dark:bg-red-950/20 shadow-lg shadow-red-500/50 animate-pulse",
        (task as any).is_mockup_task && "border-2 border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 shadow-lg shadow-indigo-500/30"
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
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-sm line-clamp-2">{task.title}</h4>
                  {/* CRM source badge - differentiate quotation_request vs direct_rfq */}
                  {task.source_app && task.task_type === 'quotation_request' && (
                    <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 font-semibold shadow-sm" title={task.origin_label || 'CRM Lead Pipeline'}>
                      📥 CRM Pipeline
                    </Badge>
                  )}
                  {task.source_app && task.task_type === 'direct_rfq' && (
                    <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 font-semibold shadow-sm" title={task.origin_label || 'Direct RFQ by SREERAJ'}>
                      📋 Direct RFQ
                    </Badge>
                  )}
                  {/* Fallback CRM badge when no task_type is set */}
                  {task.source_app && !task.task_type && (
                    <Badge className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] px-1.5 py-0.5 font-semibold shadow-sm">
                      📥 CRM
                    </Badge>
                  )}
                </div>
                
                {/* Origin label subtitle */}
                {task.source_app && task.origin_label && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 italic">
                    {task.origin_label}
                  </p>
                )}

                {/* Category badge */}
                {task.category && (
                  <Badge variant="outline" className="mt-1 text-[10px] border-muted-foreground/30 capitalize">
                    {task.category}
                  </Badge>
                )}
                
                {/* CRM Revision Notes */}
                {task.source_app && task.revision_notes && (
                  <div className="mt-1.5 p-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200 dark:border-indigo-800 rounded-md">
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-0.5">
                      📝 CRM Revision Notes:
                    </p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 whitespace-pre-wrap">
                      {task.revision_notes}
                    </p>
                  </div>
                )}
                {(task as any).is_mockup_task && (
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <Badge className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-[10px] px-1.5 py-0.5 font-semibold shadow-sm">
                      🎨 REA FLOW Mockup
                    </Badge>
                    {(task as any).design_type && (
                      <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700 dark:border-indigo-700 dark:text-indigo-300">
                        {(task as any).design_type}
                      </Badge>
                    )}
                  </div>
                )}
                
                {task.sent_to_designer_mockup && task.status === 'mockup' && (
                  <Badge className="mt-1 bg-amber-500 text-white animate-pulse">
                    🎨 Mockup Pipeline
                  </Badge>
                )}
                {task.mockup_completed_by_designer && (
                  <Badge className="mt-1 bg-green-500 text-white">
                    ✓ Mockup Completed
                  </Badge>
                )}
                {task.came_from_designer_done && task.status === 'todo' && (
                  <div className="mt-1.5 space-y-1">
                    <Badge className="bg-emerald-600 text-white font-semibold shadow-md">
                      ✨ MOCKUP READY - Designer Completed
                    </Badge>
                    {task.admin_remarks && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded border border-emerald-300 dark:border-emerald-700">
                        💬 Designer: {task.admin_remarks}
                      </p>
                    )}
                  </div>
                )}
                {task.sent_back_to_designer && task.status === 'todo' && !task.came_from_designer_done && (
                  <Badge className="mt-1 bg-red-500 text-white animate-pulse">
                    ⚠️ SENT BACK - NEEDS REDO
                  </Badge>
                )}
              </div>
              <div className="flex gap-1">
                {/* Show Send to Production button for admin in FOR PRODUCTION pipeline */}
                {userRole === 'admin' && task.status === 'done' && onSendToProduction && (
                  <Button
                    variant="default"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendToProduction(task);
                    }}
                    disabled={isMoving}
                  >
                    Send
                  </Button>
                )}
                
                {/* Send Back to Designer button for admin in FOR PRODUCTION and WITH CLIENT pipelines */}
                {userRole === 'admin' && (task.status === 'done' || task.status === 'with_client') && onSendBack && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] bg-amber-500 hover:bg-amber-600 text-white border-amber-600 font-medium shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendBack(task);
                    }}
                    disabled={isMoving}
                    title="Send back to designer"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                
                {/* Send Back to Estimator button for designer after completing mockup */}
                {userRole === 'designer' && task.sent_to_designer_mockup && (
                  <DesignerSendBackButton
                    taskId={task.id}
                    taskTitle={task.title}
                    assignedBy={task.assigned_by}
                    createdBy={task.created_by}
                    onSuccess={onTaskUpdated}
                  />
                )}
                
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
                {/* Delete button for admins viewing team member pipelines */}
                {isAdminView && onDelete && !showFullCrud && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                        onDelete(task.id);
                      }
                    }}
                    title="Delete task"
                  >
                    ✕
                  </Button>
                )}

                {/* Delete button for designers/admins for REA FLOW mockup tasks only */}
                {!isAdminView && onDelete && !showFullCrud && (task as any).is_mockup_task && (userRole === 'designer' || userRole === 'admin') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this REA FLOW mockup? This action cannot be undone.')) {
                        onDelete(task.id);
                      }
                    }}
                    title="Delete mockup"
                  >
                    ✕
                  </Button>
                )}
                {/* Remove button for FOR PRODUCTION pipeline */}
                {showFullCrud && onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Remove this task from FOR PRODUCTION? (It will remain in designer\'s pipeline)')) {
                        onDelete(task.id);
                      }
                    }}
                  >
                    ✕
                  </Button>
                )}
              </div>
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {task.description}
              </p>
            )}
            
            {/* OPERATIONS TEAM: Prominent Task Details Section */}
            {userRole === 'operations' && task.status === 'production' && (
              <div className="mb-3 p-3 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-lg border-2 border-orange-300 dark:border-orange-700 shadow-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-bold text-orange-900 dark:text-orange-100">
                      OPERATIONS DETAILS
                    </span>
                  </div>
                  {(!task.suppliers || task.suppliers.length === 0) && (
                    <Badge variant="destructive" className="animate-pulse">
                      ⚠️ Required
                    </Badge>
                  )}
                </div>
                
                {/* Show existing details or prompt to add */}
                {task.suppliers && task.suppliers.length > 0 ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-start gap-1">
                      <Truck className="h-3 w-3 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-medium">Route: </span>
                        {task.suppliers.map((s, i) => (
                          <span key={i}>
                            {i > 0 && ' → '}
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    {task.delivery_address && (
                      <div className="flex items-start gap-1">
                        <MapPin className="h-3 w-3 text-orange-600 mt-0.5" />
                        <span className="font-medium">Deliver: </span>
                        <span>{task.delivery_address}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-orange-700 dark:text-orange-300 mb-2">
                    ⚠️ Add supplier route, delivery address & instructions
                  </p>
                )}
                
                <Button
                  size="sm"
                  variant="default"
                  className="w-full h-8 mt-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOperationsDetails(true);
                  }}
                >
                  <Package className="h-4 w-4 mr-2" />
                  {task.suppliers && task.suppliers.length > 0 ? 'Edit' : 'Add'} Operations Details
                </Button>
              </div>
            )}
            
            {task.sent_back_to_designer && task.admin_remarks && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded p-2 mb-2">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                  Admin Remarks:
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                  {task.admin_remarks}
                </p>
              </div>
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
              {task.last_activity_at && (
                <TaskAgingIndicator 
                  lastActivityAt={task.last_activity_at}
                  priority={task.priority}
                />
              )}
              {task.last_activity_at && task.type === 'quotation' && (
                <EstimationTaskTimer
                  lastActivityAt={task.last_activity_at}
                  status={task.status}
                  type={task.type}
                />
              )}
              {task.mockup_completed_by_designer && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 animate-pulse"
                >
                  ✓ Mockup Ready
                </Badge>
              )}
              {task.came_from_designer_done && task.status === 'production' && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-600 hover:to-violet-600 animate-pulse"
                >
                  🎨 From Designer Done
                </Badge>
              )}
              {assignedByName && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-blue-500 text-white hover:bg-blue-600"
                >
                  Assigned by {assignedByName}
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
              {productsStats && productsStats.total > 0 && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-xs flex items-center gap-1",
                    productsStats.approved === productsStats.total
                      ? "bg-green-500 text-white hover:bg-green-600"
                      : "bg-amber-500 text-white hover:bg-amber-600"
                  )}
                >
                  <Package className="h-3 w-3" />
                  {productsStats.approved}/{productsStats.total} Approved
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
            
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
              <Badge variant="outline" className="text-xs font-normal">
                Created: {format(new Date(task.created_at), "MMM d, yyyy 'at' h:mm a")}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
      
      {showOperationsDetails && (
        <OperationsTaskDetails
          open={showOperationsDetails}
          onOpenChange={setShowOperationsDetails}
          task={task}
          onTaskUpdated={() => {
            onTaskUpdated?.();
            fetchProductStats();
          }}
        />
      )}
      
      {showSupplierQuotesCheckIn && pendingMoveStatus && (
        <SupplierQuotesCheckInDialog
          open={showSupplierQuotesCheckIn}
          onOpenChange={(open) => {
            setShowSupplierQuotesCheckIn(open);
            if (!open) setPendingMoveStatus(null);
          }}
          taskId={task.id}
          taskTitle={task.title}
          onComplete={() => {
            // After check-in, complete the move
            executeMove(pendingMoveStatus);
          }}
        />
      )}
    </Card>
  );
};
