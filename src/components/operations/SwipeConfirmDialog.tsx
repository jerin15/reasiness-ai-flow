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
import { Check, AlertTriangle } from "lucide-react";

interface SwipeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  actionType: 'collect' | 'deliver' | 'production';
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
    }
  };

  const getActionLabel = () => {
    switch (actionType) {
      case 'collect': return 'Confirm Collection';
      case 'deliver': return 'Confirm Delivery';
      case 'production': return 'Confirm Sent to Production';
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${actionType === 'collect' ? 'bg-blue-100' : actionType === 'deliver' ? 'bg-green-100' : 'bg-amber-100'}`}>
              <AlertTriangle className={`h-5 w-5 ${actionType === 'collect' ? 'text-blue-600' : actionType === 'deliver' ? 'text-green-600' : 'text-amber-600'}`} />
            </div>
            <AlertDialogTitle className="text-lg">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left mt-2">
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
