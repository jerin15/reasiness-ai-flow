import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "./ui/badge";
import { Calendar, AlertCircle } from "lucide-react";
import { format, isToday, isBefore } from "date-fns";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string;
};

type DueRemindersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DueRemindersDialog = ({ open, onOpenChange }: DueRemindersDialogProps) => {
  const [dueTasks, setDueTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchDueTasks();
    }
  }, [open]);

  const fetchDueTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      // Don't fetch tasks for admins
      if (userRole && userRole.role === "admin") {
        setLoading(false);
        return;
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .not("due_date", "is", null)
        .lte("due_date", today.toISOString())
        .neq("status", "done")
        .is("deleted_at", null);

      if (tasks) {
        setDueTasks(tasks as Task[]);
      }
    } catch (error) {
      console.error("Error fetching due tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOverdueStatus = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isBefore(date, new Date()) && !isToday(date)) {
      return { text: "Overdue", color: "text-red-500" };
    }
    return { text: "Due Today", color: "text-orange-500" };
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Due Date Reminders
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : dueTasks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No tasks due today! 🎉</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dueTasks.map(task => {
              const overdueStatus = getOverdueStatus(task.due_date);
              return (
                <div key={task.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{task.title}</h4>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs capitalize">
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {task.status.replace(/_/g, " ")}
                        </Badge>
                        <div className="flex items-center gap-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          <span className={overdueStatus.color}>
                            {format(new Date(task.due_date), "MMM d, yyyy")} - {overdueStatus.text}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
