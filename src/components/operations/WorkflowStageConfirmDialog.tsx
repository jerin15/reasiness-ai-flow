import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Check, Package, Truck, Factory, CheckCircle2, MapPin, Calendar, Box } from "lucide-react";
import { format } from "date-fns";
import { type WorkflowStage, type OperationsWorkflowItem } from "./OperationsWorkflowCard";
import { cn } from "@/lib/utils";

interface WorkflowStageConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  item: OperationsWorkflowItem | null;
  nextStage: WorkflowStage | null;
}

const stageDetails: Record<WorkflowStage, {
  title: string;
  description: string;
  icon: typeof Package;
  color: string;
  bgColor: string;
  buttonColor: string;
}> = {
  collect: {
    title: '📥 Confirm Collection',
    description: 'Mark items as collected from supplier',
    icon: Package,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100 dark:bg-blue-950',
    buttonColor: 'bg-blue-600 hover:bg-blue-700'
  },
  sent_for_production: {
    title: '🚚 Sent for Production',
    description: 'Items delivered to production supplier',
    icon: Truck,
    color: 'text-amber-600',
    bgColor: 'bg-amber-100 dark:bg-amber-950',
    buttonColor: 'bg-amber-600 hover:bg-amber-700'
  },
  at_production: {
    title: '🏭 At Production',
    description: 'Items are now being processed',
    icon: Factory,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100 dark:bg-purple-950',
    buttonColor: 'bg-purple-600 hover:bg-purple-700'
  },
  production_done: {
    title: '✅ Production Complete',
    description: 'Production finished, ready for collection',
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100 dark:bg-emerald-950',
    buttonColor: 'bg-emerald-600 hover:bg-emerald-700'
  },
  collect_for_delivery: {
    title: '📦 Collected for Delivery',
    description: 'Items collected from production, ready to deliver',
    icon: Package,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100 dark:bg-cyan-950',
    buttonColor: 'bg-cyan-600 hover:bg-cyan-700'
  },
  deliver: {
    title: '🚚 Confirm Delivery',
    description: 'Items delivered to client',
    icon: Truck,
    color: 'text-green-600',
    bgColor: 'bg-green-100 dark:bg-green-950',
    buttonColor: 'bg-green-600 hover:bg-green-700'
  }
};

export const WorkflowStageConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  item,
  nextStage
}: WorkflowStageConfirmDialogProps) => {
  if (!item || !nextStage) return null;

  const config = stageDetails[nextStage];
  const Icon = config.icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-3 rounded-full", config.bgColor)}>
              <Icon className={cn("h-6 w-6", config.color)} />
            </div>
            <div>
              <AlertDialogTitle className="text-lg">{config.title}</AlertDialogTitle>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>
          
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left">
              {/* Task Info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{item.taskTitle}</span>
                </div>
                
                {/* Supplier Info */}
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    {nextStage === 'deliver' 
                      ? `Delivering to: ${item.clientName || 'Client'}`
                      : nextStage === 'sent_for_production' || nextStage === 'at_production'
                        ? `Production at: ${item.toSupplier || item.supplierName}`
                        : `From: ${item.fromSupplier || item.supplierName}`
                    }
                  </span>
                </div>

                {/* Due Date */}
                {item.dueDate && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Due: {format(new Date(item.dueDate), 'EEE, MMM d, h:mm a')}</span>
                  </div>
                )}
              </div>

              {/* Products */}
              {item.products.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    PRODUCTS ({item.products.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {item.products.slice(0, 6).map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {p.name} {p.qty && `(${p.qty}${p.unit ? ` ${p.unit}` : ''})`}
                      </Badge>
                    ))}
                    {item.products.length > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{item.products.length - 6} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              {item.address && (
                <div className="text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">ADDRESS</p>
                  <p className="text-muted-foreground">{item.address}</p>
                </div>
              )}

              {/* Timestamp */}
              <div className="text-xs text-center text-muted-foreground pt-2 border-t">
                📅 {format(new Date(), 'EEEE, MMMM d, yyyy')} at {format(new Date(), 'h:mm a')}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className={cn("w-full sm:w-auto text-white", config.buttonColor)}
          >
            <Check className="h-4 w-4 mr-2" />
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
