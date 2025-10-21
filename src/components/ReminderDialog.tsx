import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock } from "lucide-react";

type ReminderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onReminderSet: () => void;
};

export const ReminderDialog = ({ 
  open, 
  onOpenChange, 
  taskId, 
  taskTitle,
  onReminderSet 
}: ReminderDialogProps) => {
  const [minutes, setMinutes] = useState<number>(30);
  const [loading, setLoading] = useState(false);

  const handleSetReminder = async () => {
    if (!minutes || minutes <= 0) {
      toast.error("Please enter a valid number of minutes");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const reminderTime = new Date();
      reminderTime.setMinutes(reminderTime.getMinutes() + minutes);

      const { error } = await supabase.from("task_reminders").insert({
        task_id: taskId,
        user_id: user.id,
        reminder_time: reminderTime.toISOString(),
      });

      if (error) throw error;

      toast.success(`Reminder set for ${minutes} minutes from now`);
      onReminderSet();
      onOpenChange(false);
      setMinutes(30);
    } catch (error: any) {
      console.error("Error setting reminder:", error);
      toast.error(error.message || "Failed to set reminder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Set Reminder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Set a reminder for task: <span className="font-medium">{taskTitle}</span>
          </p>
          <div className="space-y-2">
            <Label htmlFor="minutes">Reminder in (minutes)</Label>
            <Input
              id="minutes"
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value))}
              placeholder="Enter minutes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={handleSetReminder} disabled={loading}>
            {loading ? "Setting..." : "Set Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
