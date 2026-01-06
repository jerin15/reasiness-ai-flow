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
import { Check, AlertTriangle, Factory, Package, Truck } from "lucide-react";

export type ActionType = 'collect' | 'deliver' | 'production' | 'sent_for_production' | 'production_done' | 'collect_for_delivery';

interface SwipeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  actionType: ActionType;
}

export const SwipeConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  actionType
}: SwipeConfirmDialogProps) => {
  const getActionColor = () => {
    switch (actionType) {
      case 'collect': return 'bg-blue-600 hover:bg-blue-700';
      case 'deliver': return 'bg-green-600 hover:bg-green-700';
      case 'production': return 'bg-amber-600 hover:bg-amber-700';
      case 'sent_for_production': return 'bg-purple-600 hover:bg-purple-700';
      case 'production_done': return 'bg-emerald-600 hover:bg-emerald-700';
      case 'collect_for_delivery': return 'bg-cyan-600 hover:bg-cyan-700';
    }
  };

  const getActionLabel = () => {
    switch (actionType) {
      case 'collect': return 'Confirm Collection';
      case 'deliver': return 'Confirm Delivery';
      case 'production': return 'Confirm Sent to Production';
      case 'sent_for_production': return 'Confirm Sent for Production';
      case 'production_done': return 'Confirm Production Complete';
      case 'collect_for_delivery': return 'Confirm Collected for Delivery';
    }
  };

  const getIconBg = () => {
    switch (actionType) {
      case 'collect': return 'bg-blue-100 dark:bg-blue-950';
      case 'deliver': return 'bg-green-100 dark:bg-green-950';
      case 'production': return 'bg-amber-100 dark:bg-amber-950';
      case 'sent_for_production': return 'bg-purple-100 dark:bg-purple-950';
      case 'production_done': return 'bg-emerald-100 dark:bg-emerald-950';
      case 'collect_for_delivery': return 'bg-cyan-100 dark:bg-cyan-950';
    }
  };

  const getIconColor = () => {
    switch (actionType) {
      case 'collect': return 'text-blue-600';
      case 'deliver': return 'text-green-600';
      case 'production': return 'text-amber-600';
      case 'sent_for_production': return 'text-purple-600';
      case 'production_done': return 'text-emerald-600';
      case 'collect_for_delivery': return 'text-cyan-600';
    }
  };

  const getIcon = () => {
    switch (actionType) {
      case 'collect':
      case 'collect_for_delivery':
        return Package;
      case 'deliver':
        return Truck;
      case 'production':
      case 'sent_for_production':
      case 'production_done':
        return Factory;
    }
  };

  const Icon = getIcon();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${getIconBg()}`}>
              <Icon className={`h-5 w-5 ${getIconColor()}`} />
            </div>
            <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left mt-2 whitespace-pre-line">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className={`w-full sm:w-auto ${getActionColor()} text-white`}
          >
            <Check className="h-4 w-4 mr-2" />
            {getActionLabel()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
