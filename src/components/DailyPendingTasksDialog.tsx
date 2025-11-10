import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  client_name: string | null;
};

type DailyPendingTasksDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DailyPendingTasksDialog = ({ open, onOpenChange }: DailyPendingTasksDialogProps) => {
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPendingTasks();
    }
  }, [open]);

  const fetchPendingTasks = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, client_name")
        .eq("assigned_to", user.id)
        .neq("status", "done")
        .is("deleted_at", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendingTasks(data || []);
    } catch (error: any) {
      console.error("Error fetching pending tasks:", error);
    } finally {
      setLoading(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-primary" />
            Daily Pending Tasks
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : pendingTasks.length === 0 ? (
          <div className="text-center p-8">
            <p className="text-muted-foreground">No pending tasks! Great work! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You have {pendingTasks.length} pending task{pendingTasks.length !== 1 ? 's' : ''}
            </p>
            {pendingTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-medium text-sm flex-1">{task.title}</h4>
                  <Badge
                    variant="secondary"
                    className={`text-xs capitalize ${getPriorityColor(task.priority)}`}
                  >
                    {task.priority}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">Status: {task.status}</span>
                  {task.client_name && <span>• Client: {task.client_name}</span>}
                  {task.due_date && (
                    <span>• Due: {format(new Date(task.due_date), "MMM d, yyyy")}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
