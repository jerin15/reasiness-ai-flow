import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Truck, Users, ClipboardList, Package } from "lucide-react";

interface CreateTaskChooserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseOperations: () => void;
  onChooseGeneral: () => void;
}

export function CreateTaskChooserDialog({
  open,
  onOpenChange,
  onChooseOperations,
  onChooseGeneral,
}: CreateTaskChooserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Create Task
          </DialogTitle>
          <DialogDescription>
            What type of task would you like to create?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Operations Task */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary hover:bg-primary/5"
            onClick={() => {
              onOpenChange(false);
              onChooseOperations();
            }}
          >
            <div className="flex items-center gap-3 w-full">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <Truck className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">Operations Task</p>
                <p className="text-xs text-muted-foreground">
                  For Melvin/Jigeesh - with workflow steps, supplier pickups, and deliveries
                </p>
              </div>
            </div>
            <div className="flex gap-2 ml-13 pl-13">
              <span className="inline-flex items-center text-xs text-muted-foreground">
                <Package className="h-3 w-3 mr-1" /> Workflow Steps
              </span>
            </div>
          </Button>

          {/* General Task */}
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:border-primary hover:bg-primary/5"
            onClick={() => {
              onOpenChange(false);
              onChooseGeneral();
            }}
          >
            <div className="flex items-center gap-3 w-full">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">General Task</p>
                <p className="text-xs text-muted-foreground">
                  For estimation, designers, or other team members
                </p>
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
