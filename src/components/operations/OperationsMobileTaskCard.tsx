import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Calendar, 
  MapPin, 
  User, 
  Package,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  PlayCircle,
  Truck,
  ArrowRight,
  Edit3
} from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type WorkflowStepProduct = {
  id: string;
  product_name: string;
  quantity: number | null;
  unit: string | null;
  supplier_name: string | null;
};

export type WorkflowStep = {
  id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  location_address: string | null;
  location_notes: string | null;
  notes: string | null;
  due_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_profile?: {
    full_name: string | null;
    email: string;
  };
  products?: WorkflowStepProduct[];
};

export type OperationsTaskWithSteps = {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  suppliers: string[] | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string | null;
  assigned_to: string | null;
  last_updated_by: string | null;
  assigned_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  };
  last_updated_profile?: {
    id: string;
    full_name: string | null;
    email: string;
  };
  workflow_steps?: WorkflowStep[];
};

interface OperationsMobileTaskCardProps {
  task: OperationsTaskWithSteps;
  currentUserId: string;
  onTaskClick: (task: OperationsTaskWithSteps) => void;
  onStepUpdated: () => void;
}

const priorityConfig = {
  urgent: { color: "bg-destructive text-destructive-foreground", label: "URGENT", ring: "ring-2 ring-destructive" },
  high: { color: "bg-orange-500 text-white", label: "HIGH", ring: "ring-2 ring-orange-500" },
  medium: { color: "bg-blue-500 text-white", label: "MEDIUM", ring: "" },
  low: { color: "bg-muted text-muted-foreground", label: "LOW", ring: "" }
};

const stepTypeLabels = {
  collect: { label: 'Collect', icon: Package, color: 'text-blue-600' },
  deliver_to_supplier: { label: 'To Supplier', icon: Truck, color: 'text-amber-600' },
  deliver_to_client: { label: 'Deliver', icon: MapPin, color: 'text-green-600' },
  supplier_to_supplier: { label: 'S→S Transfer', icon: ArrowRight, color: 'text-purple-600' }
};

export const OperationsMobileTaskCard = ({ 
  task, 
  currentUserId, 
  onTaskClick,
  onStepUpdated
}: OperationsMobileTaskCardProps) => {
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  
  const isAssignedToMe = task.assigned_to === currentUserId;
  const lastUpdatedByName = task.last_updated_profile?.full_name || task.last_updated_profile?.email;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const isUrgent = task.priority === 'urgent' || task.priority === 'high';

  // Date status
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);
  const isDueTomorrow = dueDate && isTomorrow(dueDate);

  // Workflow progress
  const steps = task.workflow_steps || [];
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  const hasSteps = totalSteps > 0;
  const allStepsComplete = hasSteps && completedSteps === totalSteps;

  const handleStepToggle = async (step: WorkflowStep, e: React.MouseEvent) => {
    e.stopPropagation();
    setUpdatingStep(step.id);
    
    try {
      let newStatus: WorkflowStep['status'];
      
      if (step.status === 'pending') {
        newStatus = 'in_progress';
      } else if (step.status === 'in_progress') {
        newStatus = 'completed';
      } else {
        newStatus = 'pending';
      }

      const updates: any = { status: newStatus };
      const nowIso = new Date().toISOString();
      
      if (newStatus === 'in_progress') {
        updates.started_at = nowIso;
      } else if (newStatus === 'completed') {
        updates.completed_at = nowIso;
        updates.completed_by = currentUserId;
      } else {
        updates.started_at = null;
        updates.completed_at = null;
        updates.completed_by = null;
      }

      const { error } = await supabase
        .from('task_workflow_steps')
        .update(updates)
        .eq('id', step.id);

      if (error) throw error;

      // Create notification for step completion
      if (newStatus === 'completed') {
        const stepConfig = stepTypeLabels[step.step_type];
        const { data: currentUserProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', currentUserId)
          .single();
        
        const completedByName = currentUserProfile?.full_name || 'Team member';
        
        // Insert notification for admins/operations
        await supabase
          .from('urgent_notifications')
          .insert({
            sender_id: currentUserId,
            recipient_id: null, // broadcast
            is_broadcast: true,
            title: `✅ Step Completed: ${stepConfig.label}`,
            message: `${completedByName} completed "${stepConfig.label}" step for task "${task.title}".\n\nSupplier: ${step.supplier_name || 'N/A'}\nCompleted at: ${format(new Date(), 'MMM d, yyyy h:mm a')}`,
            priority: 'medium',
            is_acknowledged: false
          });
      }

      toast.success(`Step marked as ${newStatus.replace('_', ' ')}`);
      onStepUpdated();
    } catch (error: any) {
      console.error('Error updating step:', error);
      toast.error('Failed to update step');
    } finally {
      setUpdatingStep(null);
    }
  };

  const getStepIcon = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'in_progress': return <PlayCircle className="h-5 w-5 text-blue-600 animate-pulse" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-200 overflow-hidden touch-manipulation",
        isUrgent && priority.ring,
        isOverdue && "border-destructive",
        allStepsComplete && "opacity-60"
      )}
    >
      <CardContent className="p-0">
        {/* Main Content - Clickable */}
        <div 
          className="p-4 active:bg-muted/50 transition-colors"
          onClick={() => onTaskClick(task)}
        >
          {/* Top Row: Priority + Due Date */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge className={cn("text-xs font-bold", priority.color)}>
              {priority.label}
            </Badge>
            
            {dueDate && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full",
                isOverdue && "bg-destructive/10 text-destructive",
                isDueToday && !isOverdue && "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
                isDueTomorrow && "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
                !isOverdue && !isDueToday && !isDueTomorrow && "bg-muted text-muted-foreground"
              )}>
                {isOverdue && <AlertTriangle className="h-3 w-3" />}
                <Calendar className="h-3 w-3" />
                {format(dueDate, isDueToday || isDueTomorrow ? 'h:mm a' : 'MMM d')}
              </div>
            )}
          </div>

          {/* Title + Client */}
          <div className="mb-3">
            <h3 className="font-semibold text-base leading-tight line-clamp-2">
              {task.title}
            </h3>
            {task.client_name && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                <User className="h-3.5 w-3.5" />
                {task.client_name}
              </p>
            )}
          </div>

          {/* Assignment Badge */}
          <div className="flex items-center justify-between gap-2 mb-3">
            {task.assigned_to ? (
              <Badge variant={isAssignedToMe ? "default" : "secondary"} className="text-xs">
                {isAssignedToMe ? '👤 Assigned to you' : `👤 ${task.assigned_profile?.full_name?.split(' ')[0] || 'Team'}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-dashed border-amber-500 text-amber-700">
                ⚠️ Unassigned
              </Badge>
            )}

            {hasSteps && (
              <Badge variant="outline" className={cn(
                "text-xs",
                allStepsComplete && "bg-green-100 border-green-500 text-green-700"
              )}>
                {completedSteps}/{totalSteps} done
              </Badge>
            )}
          </div>

          {/* Last Updated By Badge */}
          {lastUpdatedByName && (
            <div className="mb-3">
              <Badge variant="outline" className="text-xs bg-violet-50 dark:bg-violet-950 border-violet-300 text-violet-700 dark:text-violet-300">
                <Edit3 className="h-3 w-3 mr-1" />
                Updated by {lastUpdatedByName.split(' ')[0]}
              </Badge>
            </div>
          )}

          {/* Delivery Address Preview */}
          {task.delivery_address && (
            <div className="flex items-start gap-2 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-primary line-clamp-1">
                {task.delivery_address}
              </span>
              <ChevronRight className="h-4 w-4 text-primary ml-auto shrink-0" />
            </div>
          )}
        </div>

        {/* Workflow Steps - Interactive */}
        {hasSteps && (
          <div className="border-t bg-muted/30">
            <div className="px-4 py-2 flex items-center gap-2 border-b bg-muted/50">
              <Truck className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Workflow Steps</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="divide-y">
              {steps.slice(0, 5).map((step, idx) => {
                const stepConfig = stepTypeLabels[step.step_type];
                const StepTypeIcon = stepConfig.icon;
                const isUpdating = updatingStep === step.id;
                
                return (
                  <div 
                    key={step.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors",
                      step.status === 'completed' && "bg-green-50/50 dark:bg-green-950/10",
                      step.status === 'in_progress' && "bg-blue-50/50 dark:bg-blue-950/10"
                    )}
                    onClick={(e) => handleStepToggle(step, e)}
                  >
                    {/* Step Status Icon - Tappable */}
                    <div className={cn(
                      "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      step.status === 'completed' && "bg-green-100 border-green-500",
                      step.status === 'in_progress' && "bg-blue-100 border-blue-500",
                      step.status === 'pending' && "bg-background border-muted-foreground/30"
                    )}>
                      {isUpdating ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        getStepIcon(step.status)
                      )}
                    </div>

                    {/* Step Info - Full Details */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Header with step type and status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <StepTypeIcon className={cn("h-4 w-4", stepConfig.color)} />
                        <span className="text-sm font-bold">
                          {stepConfig.label}
                        </span>
                        <Badge 
                          variant={step.status === 'completed' ? 'default' : step.status === 'in_progress' ? 'secondary' : 'outline'}
                          className="text-xs capitalize shrink-0 ml-auto"
                        >
                          {step.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      {/* Due Date - Date only, no time */}
                      {step.due_date && (
                        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-semibold">
                          <Calendar className="h-3 w-3" />
                          <span>Due: {format(new Date(step.due_date), 'MMM d')}</span>
                        </div>
                      )}

                      {/* COLLECT FROM Section - Only for collect steps */}
                      {step.step_type === 'collect' && step.supplier_name && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md px-2.5 py-2">
                          <div className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 mb-1">
                            <Package className="h-3 w-3" />
                            📦 COLLECT FROM:
                          </div>
                          <div className="text-sm font-semibold">
                            {step.supplier_name}
                          </div>
                          {step.location_address && (
                            <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{step.location_address}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Supplier to Supplier Transfer - Just show the destination */}
                      {step.step_type === 'supplier_to_supplier' && step.supplier_name && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-2">
                          <div className="text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                            <Truck className="h-3 w-3" />
                            🚚 TRANSFER TO:
                          </div>
                          <div className="text-sm font-semibold">
                            {step.supplier_name}
                          </div>
                          {step.location_address && (
                            <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{step.location_address}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* DELIVER TO Section - For deliver steps only */}
                      {(step.step_type === 'deliver_to_supplier' || step.step_type === 'deliver_to_client') && (
                        <div className={cn(
                          "border rounded-md px-2.5 py-2",
                          step.step_type === 'deliver_to_client' 
                            ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                            : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                        )}>
                          <div className={cn(
                            "text-xs font-bold flex items-center gap-1.5 mb-1",
                            step.step_type === 'deliver_to_client'
                              ? "text-green-700 dark:text-green-300"
                              : "text-amber-700 dark:text-amber-300"
                          )}>
                            <Truck className="h-3 w-3" />
                            🚚 DELIVER TO:
                          </div>
                          <div className="text-sm font-semibold">
                            {step.supplier_name || (step.step_type === 'deliver_to_client' ? 'Client' : 'Supplier')}
                          </div>
                          {step.location_address && (
                            <div className="text-xs text-muted-foreground flex items-start gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                              <span>{step.location_address}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Products List - FULL DETAILS */}
                      {step.products && step.products.length > 0 && (
                        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-md px-2.5 py-2">
                          <div className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5 mb-1.5">
                            <Package className="h-3 w-3" />
                            📋 PRODUCTS ({step.products.length}):
                          </div>
                          <div className="space-y-1">
                            {step.products.map((product) => (
                              <div key={product.id} className="text-sm flex items-start gap-2 bg-background/50 rounded px-2 py-1">
                                <span className="font-bold text-primary min-w-[50px]">
                                  {product.quantity || 1} {product.unit || 'pcs'}
                                </span>
                                <span className="flex-1 font-medium">{product.product_name}</span>
                                {product.supplier_name && (
                                  <span className="text-xs text-muted-foreground">from {product.supplier_name}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* General Notes */}
                      {step.notes && (
                        <div className="text-xs text-blue-600 dark:text-blue-400 italic bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1">
                          📝 {step.notes}
                        </div>
                      )}

                      {/* Completed by audit */}
                      {step.status === 'completed' && step.completed_at && (
                        <div className="flex items-center gap-1.5 text-xs bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded px-2 py-1.5 border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-3 w-3 shrink-0" />
                          <span>
                            Completed by{' '}
                            <span className="font-semibold">
                              {step.completed_by_profile?.full_name || step.completed_by_profile?.email || 'Team member'}
                            </span>
                            {' '}at {format(new Date(step.completed_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      )}
                      
                      {/* No details fallback */}
                      {!step.supplier_name && !step.location_address && !step.notes && (!step.products || step.products.length === 0) && step.status !== 'completed' && (
                        <p className="text-xs text-muted-foreground italic">No details added yet</p>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {steps.length > 5 && (
                <div 
                  className="px-4 py-2 text-center text-xs text-primary font-medium"
                  onClick={() => onTaskClick(task)}
                >
                  +{steps.length - 5} more steps →
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
