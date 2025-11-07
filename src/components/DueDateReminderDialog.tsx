import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Calendar, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "./ui/badge";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string;
  reminder_sent: boolean;
};

type DueDateReminderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
};

export const DueDateReminderDialog = ({ open, onOpenChange, userId }: DueDateReminderDialogProps) => {
  const [dueTasks, setDueTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && userId) {
      checkUserRoleAndFetch();
    }
  }, [open, userId]);

  const checkUserRoleAndFetch = async () => {
    try {
      const { data: userRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      // Only fetch and show reminders for non-admin users
      if (userRole && userRole.role !== "admin") {
        fetchDueTasks();
        playNotificationSound();
      }
    } catch (error) {
      console.error("Error checking user role:", error);
    }
  };

  const playNotificationSound = () => {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const fetchDueTasks = async () => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
        .lte("due_date", new Date().toISOString())
        .not("status", "in", `(done,quotation,pending_invoices,quotation_bill)`)
        .is("deleted_at", null)
        .eq("reminder_sent", false)
        .order("due_date", { ascending: true });

      if (error) throw error;
      setDueTasks(data || []);

      // Mark reminders as sent
      if (data && data.length > 0) {
        await supabase
          .from("tasks")
          .update({ reminder_sent: true })
          .in("id", data.map(t => t.id));
      }
    } catch (error) {
      console.error("Error fetching due tasks:", error);
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

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="h-6 w-6 text-yellow-500" />
            Due Date Reminders
          </DialogTitle>
          <DialogDescription>
            You have tasks that are due or overdue. Please review them below.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : dueTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No due or overdue tasks at the moment.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dueTasks.map((task) => (
              <div
                key={task.id}
                className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">{task.title}</h4>
                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={getPriorityColor(task.priority)}
                      >
                        {task.priority}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {task.status.replace(/_/g, " ")}
                      </Badge>
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        <span className={isOverdue(task.due_date) ? "text-red-500 font-semibold" : ""}>
                          {format(new Date(task.due_date), "MMM d, yyyy")}
                        </span>
                        {isOverdue(task.due_date) && (
                          <Badge variant="destructive" className="ml-1">
                            OVERDUE
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button onClick={() => onOpenChange(false)}>
            Got it!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};