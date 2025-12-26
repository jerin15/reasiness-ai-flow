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
  ArrowRight
} from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type WorkflowStep = {
  id: string;
  step_order: number;
  step_type: 'collect' | 'deliver_to_supplier' | 'deliver_to_client' | 'supplier_to_supplier';
  supplier_name: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  location_address: string | null;
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
  assigned_to: string | null;
  assigned_profile?: {
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
      
      if (newStatus === 'in_progress') {
        updates.started_at = new Date().toISOString();
      } else if (newStatus === 'completed') {
        updates.completed_at = new Date().toISOString();
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

                    {/* Step Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StepTypeIcon className={cn("h-4 w-4", stepConfig.color)} />
                        <span className="text-sm font-medium">
                          {stepConfig.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {step.supplier_name || step.location_address || 'No details'}
                      </p>
                    </div>

                    {/* Status Badge */}
                    <Badge 
                      variant={step.status === 'completed' ? 'default' : step.status === 'in_progress' ? 'secondary' : 'outline'}
                      className="text-xs capitalize shrink-0"
                    >
                      {step.status.replace('_', ' ')}
                    </Badge>
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
