import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "./ui/badge";
import { AlertCircle } from "lucide-react";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  my_status: string;
};

type PendingTasksDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSignOut: () => void;
};

export const PendingTasksDialog = ({ open, onOpenChange, onConfirmSignOut }: PendingTasksDialogProps) => {
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchPendingTasks();
    }
  }, [open]);

  const fetchPendingTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, my_status")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .eq("my_status", "pending")
        .neq("status", "done")
        .is("deleted_at", null);

      if (tasks) {
        setPendingTasks(tasks as Task[]);
      }
    } catch (error) {
      console.error("Error fetching pending tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Pending Tasks Summary
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : pendingTasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">All tasks are done from your side! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have {pendingTasks.length} pending task{pendingTasks.length > 1 ? 's' : ''}.
            </p>
            {pendingTasks.map(task => (
              <div key={task.id} className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">{task.title}</h4>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs capitalize">
                    {task.priority}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {task.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Stay
          </Button>
          <Button onClick={onConfirmSignOut}>
            Sign Out Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
