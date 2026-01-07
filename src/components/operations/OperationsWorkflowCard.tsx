import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Package, 
  Truck, 
  Factory, 
  MapPin, 
  Calendar,
  Clock,
  User,
  Box,
  Check,
  ChevronRight,
  Navigation,
  Edit2,
  Trash2,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isPast, isTomorrow, differenceInDays, differenceInHours } from 'date-fns';

export type WorkflowStage = 
  | 'collect'           // Step 1: Collect from supplier
  | 'sent_for_production' // Step 2: Sent to production supplier
  | 'at_production'     // Step 3: Currently in production
  | 'production_done'   // Step 4: Production complete
  | 'collect_for_delivery' // Step 5: Collect from production for delivery
  | 'deliver';          // Step 6: Deliver to client

export interface OperationsWorkflowItem {
  stepId: string;
  taskId: string;
  taskTitle: string;
  clientName: string | null;
  supplierName: string;
  toSupplier?: string | null;
  fromSupplier?: string | null;
  address: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  products: { name: string; qty: number | null; unit: string | null; supplier: string | null }[];
  stepType: string;
  area: string;
  instructions?: string | null;
  assignedTo?: string | null;
  assigneeName?: string | null;
  currentStage: WorkflowStage;
  stageUpdatedAt?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}

interface OperationsWorkflowCardProps {
  item: OperationsWorkflowItem;
  onStageAction: (item: OperationsWorkflowItem, nextStage: WorkflowStage) => void;
  onEdit: (item: OperationsWorkflowItem) => void;
  onAssign: (item: OperationsWorkflowItem) => void;
  onDelete: (item: OperationsWorkflowItem) => void;
  onNavigate: (address: string) => void;
  isProcessing?: boolean;
  isAdmin?: boolean;
  // Swipe support
  onSwipeStart?: (itemId: string) => void;
  swipingItemId?: string | null;
  swipeOffset?: number;
}

const stageConfig: Record<WorkflowStage, {
  label: string;
  icon: typeof Package;
  color: string;
  bgColor: string;
  borderColor: string;
  nextStage?: WorkflowStage;
  nextAction?: string;
}> = {
  collect: {
    label: 'Collect',
    icon: Package,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-l-blue-500',
    nextStage: 'sent_for_production',
    nextAction: 'Mark Collected'
  },
  sent_for_production: {
    label: 'Send for Production',
    icon: Truck,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-l-amber-500',
    nextStage: 'at_production',
    nextAction: 'Sent to Production'
  },
  at_production: {
    label: 'At Production',
    icon: Factory,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-l-purple-500',
    nextStage: 'production_done',
    nextAction: 'Production Complete'
  },
  production_done: {
    label: 'Production Done',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-l-emerald-500',
    nextStage: 'collect_for_delivery',
    nextAction: 'Collect for Delivery'
  },
  collect_for_delivery: {
    label: 'Collect for Delivery',
    icon: Package,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/30',
    borderColor: 'border-l-cyan-500',
    nextStage: 'deliver',
    nextAction: 'Collected'
  },
  deliver: {
    label: 'Deliver',
    icon: Truck,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-l-green-500',
    nextAction: 'Mark Delivered'
  }
};

const priorityConfig = {
  urgent: { color: 'bg-red-500', textColor: 'text-red-700', label: 'URGENT' },
  high: { color: 'bg-orange-500', textColor: 'text-orange-700', label: 'HIGH' },
  medium: { color: 'bg-blue-500', textColor: 'text-blue-700', label: 'MEDIUM' },
  low: { color: 'bg-gray-400', textColor: 'text-gray-600', label: 'LOW' }
};

export const OperationsWorkflowCard = ({
  item,
  onStageAction,
  onEdit,
  onAssign,
  onDelete,
  onNavigate,
  isProcessing = false,
  isAdmin = false,
  swipingItemId,
  swipeOffset = 0
}: OperationsWorkflowCardProps) => {
  const config = stageConfig[item.currentStage];
  const priority = priorityConfig[item.priority] || priorityConfig.medium;
  const StageIcon = config.icon;
  
  const isActive = swipingItemId === item.stepId;
  const totalQty = item.products.reduce((sum, p) => sum + (p.qty || 0), 0);

  // Due date calculations
  const getDueStatus = () => {
    if (!item.dueDate) return { label: 'No Due Date', color: 'text-red-600 bg-red-50 dark:bg-red-950/50', urgent: true, icon: AlertTriangle };
    const date = new Date(item.dueDate);
    const now = new Date();
    
    if (isPast(date) && !isToday(date)) {
      const daysOverdue = differenceInDays(now, date);
      return { 
        label: `OVERDUE ${daysOverdue}d`, 
        color: 'text-red-600 bg-red-50 dark:bg-red-950/50 animate-pulse', 
        urgent: true,
        icon: AlertTriangle 
      };
    }
    if (isToday(date)) {
      const hoursLeft = differenceInHours(date, now);
      return { 
        label: hoursLeft > 0 ? `TODAY (${hoursLeft}h left)` : 'DUE NOW', 
        color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/50', 
        urgent: true,
        icon: Clock 
      };
    }
    if (isTomorrow(date)) {
      return { label: 'Tomorrow', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50', urgent: false, icon: Calendar };
    }
    const daysUntil = differenceInDays(date, now);
    return { 
      label: daysUntil <= 3 ? `${daysUntil}d left` : format(date, 'MMM d'), 
      color: 'text-muted-foreground bg-muted', 
      urgent: false,
      icon: Calendar 
    };
  };

  const dueStatus = getDueStatus();
  const DueIcon = dueStatus.icon;

  return (
    <div className="relative overflow-hidden rounded-lg mb-3">
      {/* Swipe reveal background */}
      <div className={cn(
        "absolute inset-y-0 left-0 flex items-center justify-center px-4 transition-all",
        item.currentStage === 'deliver' ? 'bg-green-600' : 'bg-primary',
        isActive && swipeOffset > 0 ? "opacity-100" : "opacity-0"
      )} style={{ width: swipeOffset }}>
        <Check className="h-6 w-6 text-white" />
      </div>

      {/* Main Card */}
      <Card
        className={cn(
          "border-l-4 transition-transform touch-pan-y",
          config.borderColor,
          config.bgColor,
          dueStatus.urgent && 'ring-1 ring-red-300 dark:ring-red-800'
        )}
        style={{ transform: isActive ? `translateX(${swipeOffset}px)` : 'translateX(0)' }}
      >
        <CardContent className="p-3">
          {isProcessing ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Header: Priority + Stage + Due Date */}
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", priority.color)} />
                  <Badge variant="outline" className={cn("text-[10px] font-bold", config.color, config.bgColor)}>
                    <StageIcon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                </div>
                <Badge variant="outline" className={cn("text-[10px] font-semibold shrink-0 gap-1", dueStatus.color)}>
                  <DueIcon className="h-3 w-3" />
                  {dueStatus.label}
                </Badge>
              </div>

              {/* Supplier Name (Key Component) */}
              <div className="flex items-start gap-2 mb-2">
                <div className={cn("p-1.5 rounded-md shrink-0", config.bgColor)}>
                  <StageIcon className={cn("h-4 w-4", config.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-base truncate">
                    {item.currentStage === 'deliver' 
                      ? (item.clientName || 'Client') 
                      : (item.fromSupplier || item.supplierName)}
                  </h3>
                  {item.toSupplier && item.fromSupplier && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span>→ {item.toSupplier}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Task Title + Client */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2 flex-wrap">
                <span className="font-medium truncate max-w-[150px]">{item.taskTitle}</span>
                {item.clientName && item.currentStage !== 'deliver' && (
                  <>
                    <span className="mx-1">•</span>
                    <User className="h-3 w-3" />
                    <span className="truncate">{item.clientName}</span>
                  </>
                )}
              </div>

              {/* Assignee Badge */}
              {item.assigneeName && (
                <Badge variant="secondary" className="text-[10px] h-5 mb-2">
                  <User className="h-3 w-3 mr-1" />
                  {item.assigneeName}
                </Badge>
              )}

              {/* Products Section */}
              <div className="bg-white/70 dark:bg-black/20 rounded-lg p-2 border border-border/50 mb-2">
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    <Box className="h-3 w-3" />
                    PRODUCTS ({item.products.length}{totalQty > 0 && `, ${totalQty} qty`})
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-2 text-[10px] text-primary hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(item);
                    }}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.products.slice(0, 4).map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px] h-5">
                      {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ''})`}
                    </Badge>
                  ))}
                  {item.products.length > 4 && (
                    <Badge variant="outline" className="text-[10px]">+{item.products.length - 4}</Badge>
                  )}
                  {item.products.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No products listed</span>
                  )}
                </div>
              </div>

              {/* Notes/Instructions */}
              {item.instructions && (
                <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded p-2 text-xs mb-2">
                  <span className="font-semibold">📝 </span>{item.instructions}
                </div>
              )}

              {/* Address + Navigate */}
              {item.address && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-9 text-xs justify-between mb-2"
                  onClick={() => onNavigate(item.address!)}
                >
                  <div className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0 text-primary" />
                    <span className="truncate text-left">{item.address}</span>
                  </div>
                  <Navigation className="h-3.5 w-3.5 shrink-0 ml-2 text-primary" />
                </Button>
              )}

              {/* Due Date Display */}
              {item.dueDate && (
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground bg-muted/50 rounded py-1 mb-2">
                  <Calendar className="h-3 w-3" />
                  <span>Due: {format(new Date(item.dueDate), 'EEE, MMM d, h:mm a')}</span>
                </div>
              )}

              {/* Stage Updated Info */}
              {item.stageUpdatedAt && (
                <div className="text-[10px] text-muted-foreground text-center mb-2">
                  Updated: {format(new Date(item.stageUpdatedAt), 'MMM d, h:mm a')}
                  {item.completedByName && ` by ${item.completedByName}`}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                {/* Main Action Button */}
                {config.nextAction && (
                  <Button
                    size="sm"
                    className={cn(
                      "flex-1 h-10 text-xs font-semibold",
                      item.currentStage === 'deliver' ? 'bg-green-600 hover:bg-green-700' :
                      item.currentStage === 'at_production' ? 'bg-emerald-600 hover:bg-emerald-700' :
                      item.currentStage === 'sent_for_production' ? 'bg-purple-600 hover:bg-purple-700' :
                      item.currentStage === 'production_done' ? 'bg-cyan-600 hover:bg-cyan-700' :
                      item.currentStage === 'collect_for_delivery' ? 'bg-cyan-600 hover:bg-cyan-700' :
                      'bg-blue-600 hover:bg-blue-700'
                    )}
                    onClick={() => config.nextStage 
                      ? onStageAction(item, config.nextStage)
                      : onStageAction(item, 'deliver') // Final delivery
                    }
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    {config.nextAction}
                  </Button>
                )}

                {/* Assign Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 px-2"
                  onClick={() => onAssign(item)}
                >
                  <UserPlus className="h-4 w-4" />
                </Button>

                {/* Delete Button (Admin only) */}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Swipe hint (mobile) */}
              <p className="text-[10px] text-muted-foreground opacity-60 flex items-center gap-1 mt-2 md:hidden">
                <ChevronRight className="h-3 w-3" />
                Swipe right to complete
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
