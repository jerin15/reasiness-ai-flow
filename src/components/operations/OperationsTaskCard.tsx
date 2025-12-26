import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Calendar, 
  MapPin, 
  Truck, 
  User, 
  Package,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  Edit3
} from "lucide-react";
import { format, isToday, isTomorrow, isPast } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type OperationsTask = {
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
};

interface OperationsTaskCardProps {
  task: OperationsTask;
  currentUserId: string;
  onTaskClick: (task: OperationsTask) => void;
  showAssignment?: boolean;
}

const priorityConfig = {
  urgent: {
    color: "bg-destructive/10 border-destructive text-destructive",
    label: "URGENT",
    icon: "🚨"
  },
  high: {
    color: "bg-orange-100 dark:bg-orange-950 border-orange-500 text-orange-700 dark:text-orange-300",
    label: "HIGH",
    icon: "⚠️"
  },
  medium: {
    color: "bg-blue-100 dark:bg-blue-950 border-blue-500 text-blue-700 dark:text-blue-300",
    label: "MEDIUM",
    icon: "📋"
  },
  low: {
    color: "bg-muted border-muted-foreground/30 text-muted-foreground",
    label: "LOW",
    icon: "📝"
  }
};

export const OperationsTaskCard = ({ 
  task, 
  currentUserId, 
  onTaskClick,
  showAssignment = true 
}: OperationsTaskCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState({ completed: 0, total: 0, inProgress: 0 });
  
  // Fetch workflow step progress
  useEffect(() => {
    const fetchProgress = async () => {
      const { data, error } = await supabase
        .from('task_workflow_steps')
        .select('status')
        .eq('task_id', task.id);
      
      if (!error && data) {
        setWorkflowProgress({
          total: data.length,
          completed: data.filter(s => s.status === 'completed').length,
          inProgress: data.filter(s => s.status === 'in_progress').length
        });
      }
    };
    fetchProgress();
  }, [task.id]);
  
  const hasDeliveryInfo = task.delivery_address || task.suppliers?.length || workflowProgress.total > 0;
  const isAssignedToMe = task.assigned_to === currentUserId;
  const assignedUserName = task.assigned_profile?.full_name || task.assigned_profile?.email || 'Unassigned';
  const lastUpdatedByName = task.last_updated_profile?.full_name || task.last_updated_profile?.email;
  const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
  const isUrgent = task.priority === 'urgent' || task.priority === 'high';
  
  // Date status
  const dueDate = task.due_date ? new Date(task.due_date) : null;
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const isDueToday = dueDate && isToday(dueDate);
  const isDueTomorrow = dueDate && isTomorrow(dueDate);

  return (
    <Card 
      className={cn(
        "transition-all duration-200 overflow-hidden",
        "border-l-4",
        isUrgent && "border-l-destructive shadow-lg",
        !isUrgent && isAssignedToMe && "border-l-primary",
        !isUrgent && !isAssignedToMe && "border-l-muted-foreground/30",
        !hasDeliveryInfo && "bg-amber-50/50 dark:bg-amber-950/10",
        isOverdue && "ring-2 ring-destructive/50"
      )}
    >
      <CardContent className="p-0">
        {/* Main Card Content - Always Visible */}
        <div 
          className="p-4 cursor-pointer active:bg-muted/50 transition-colors"
          onClick={() => onTaskClick(task)}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base leading-tight line-clamp-2 mb-1">
                {task.title}
              </h3>
              {task.client_name && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {task.client_name}
                </p>
              )}
            </div>
            
            {/* Priority Badge */}
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs font-bold border-2 shrink-0",
                priority.color
              )}
            >
              {priority.icon} {priority.label}
            </Badge>
          </div>

          {/* Quick Info Row */}
          <div className="flex flex-wrap gap-2 mb-3">
            {showAssignment && (
              task.assigned_to ? (
                <Badge 
                  variant={isAssignedToMe ? "default" : "secondary"} 
                  className="text-xs"
                >
                  {isAssignedToMe ? '👤 You' : `👤 ${assignedUserName.split(' ')[0]}`}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs border-dashed border-amber-500 text-amber-700">
                  ⚠️ Unassigned
                </Badge>
              )
            )}
            
            {!hasDeliveryInfo && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700">
                📝 Info Needed
              </Badge>
            )}

            {workflowProgress.total > 0 && (
              <Badge variant="outline" className={cn(
                "text-xs",
                workflowProgress.completed === workflowProgress.total && "bg-green-100 border-green-500 text-green-700",
                workflowProgress.inProgress > 0 && workflowProgress.completed < workflowProgress.total && "bg-blue-100 border-blue-500 text-blue-700"
              )}>
                {workflowProgress.completed === workflowProgress.total ? (
                  <>
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Completed
                  </>
                ) : workflowProgress.inProgress > 0 ? (
                  <>
                    <Clock className="h-3 w-3 mr-1 animate-pulse" />
                    In Progress
                  </>
                ) : (
                  <>
                    <Circle className="h-3 w-3 mr-1" />
                    Pending
                  </>
                )}
                <span className="ml-1">({workflowProgress.completed}/{workflowProgress.total})</span>
              </Badge>
            )}

            {task.suppliers && task.suppliers.length > 0 && workflowProgress.total === 0 && (
              <Badge variant="outline" className="text-xs">
                <Truck className="h-3 w-3 mr-1" />
                {task.suppliers.length} stop{task.suppliers.length > 1 ? 's' : ''}
              </Badge>
            )}

            {lastUpdatedByName && (
              <Badge variant="outline" className="text-xs bg-violet-50 dark:bg-violet-950 border-violet-300 text-violet-700 dark:text-violet-300">
                <Edit3 className="h-3 w-3 mr-1" />
                Updated by {lastUpdatedByName.split(' ')[0]}
              </Badge>
            )}
          </div>

          {/* Delivery Date - Prominent */}
          {dueDate && (
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg font-medium",
              isOverdue && "bg-destructive/10 border border-destructive text-destructive",
              isDueToday && !isOverdue && "bg-orange-100 dark:bg-orange-950 border border-orange-500 text-orange-700 dark:text-orange-300",
              isDueTomorrow && "bg-blue-100 dark:bg-blue-950 border border-blue-500 text-blue-700 dark:text-blue-300",
              !isOverdue && !isDueToday && !isDueTomorrow && "bg-muted border border-border"
            )}>
              <Calendar className="h-5 w-5 shrink-0" />
              <div className="flex-1">
                <div className="text-xs opacity-80">
                  {isOverdue ? 'Overdue!' : isDueToday ? 'Due Today' : isDueTomorrow ? 'Due Tomorrow' : 'Delivery Date'}
                </div>
                <div className="text-sm font-semibold">
                  {format(dueDate, 'EEE, MMM d, yyyy')}
                </div>
              </div>
              {(isOverdue || isDueToday) && (
                <AlertTriangle className="h-5 w-5 animate-pulse" />
              )}
            </div>
          )}

          {/* Delivery Address Preview */}
          {task.delivery_address && (
            <div className="flex items-start gap-2 mt-3 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
              <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-sm text-primary line-clamp-1">
                {task.delivery_address}
              </span>
            </div>
          )}
        </div>

        {/* Expandable Section */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full h-10 rounded-none border-t flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  <span className="text-xs">Show Less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  <span className="text-xs">Show Details</span>
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <div className="p-4 pt-0 space-y-3 border-t bg-muted/30">
              {/* Supplier Route */}
              {task.suppliers && task.suppliers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Truck className="h-4 w-4 text-primary" />
                    Supplier Route
                  </div>
                  <div className="pl-6 space-y-1.5">
                    {task.suppliers.map((supplier, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">
                          {idx + 1}
                        </div>
                        <span>{supplier}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Delivery Address */}
              {task.delivery_address && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-primary" />
                    Final Delivery
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {task.delivery_address}
                  </p>
                </div>
              )}

              {/* Special Instructions */}
              {task.delivery_instructions && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4 text-amber-600" />
                    Special Instructions
                  </div>
                  <p className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap">
                    {task.delivery_instructions}
                  </p>
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Description
                  </div>
                  <p className="text-sm text-muted-foreground pl-6 line-clamp-3">
                    {task.description}
                  </p>
                </div>
              )}

              {/* Open Full Details Button */}
              <Button 
                variant="default" 
                className="w-full mt-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskClick(task);
                }}
              >
                Open Full Details
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};
