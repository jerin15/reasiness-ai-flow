import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";
import { Bell, Clock } from "lucide-react";

type Reminder = {
  id: string;
  task_id: string;
  reminder_time: string;
  is_snoozed: boolean;
  is_dismissed: boolean;
  tasks: {
    title: string;
    status: string;
  };
};

export const ReminderNotification = () => {
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState<number>(10);
  const [showSnoozeDialog, setShowSnoozeDialog] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const userIsAdmin = roleData?.role === 'admin' || (roleData?.role as string) === 'technical_head';
      setIsAdmin(userIsAdmin);
      
      // Only check reminders if not admin/technical_head
      if (!userIsAdmin) {
        checkReminders();
        checkIntervalRef.current = setInterval(checkReminders, 10000);
      }
    };

    checkUserRole();

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      stopAlarm();
    };
  }, []);

  // Play alarm when activeReminder changes
  useEffect(() => {
    if (activeReminder) {
      playAlarm();
    } else {
      stopAlarm();
    }
  }, [activeReminder]);

  const checkReminders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check user role to apply filtering
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      const now = new Date().toISOString();
      
      let query = supabase
        .from("task_reminders")
        .select("*, tasks(title, status)")
        .eq("user_id", user.id)
        .eq("is_dismissed", false)
        .lte("reminder_time", now);

      // For estimation users, only show reminders from supplier_quotes and client_approval
      if (roleData?.role === 'estimation') {
        query = query.in("tasks.status", ["supplier_quotes", "client_approval"]);
      }

      const { data: reminders, error } = await query
        .order("reminder_time", { ascending: true })
        .limit(1);

      if (error) throw error;

      if (reminders && reminders.length > 0) {
        const reminder = reminders[0] as Reminder;
        
        // If the task was deleted, auto-dismiss the reminder
        if (!reminder.tasks) {
          await supabase
            .from("task_reminders")
            .update({ is_dismissed: true })
            .eq("id", reminder.id);
          console.log("Auto-dismissed reminder for deleted task");
          return;
        }
        
        setActiveReminder(reminder);
      }
    } catch (error) {
      console.error("Error checking reminders:", error);
    }
  };

  const playAlarm = () => {
    if (alarmIntervalRef.current) return; // Already playing

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const createBeep = () => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880; // High frequency for attention
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.8, audioContext.currentTime); // Loud volume
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    };

    // Create double beep pattern every second
    const beepPattern = () => {
      createBeep();
      setTimeout(createBeep, 200);
    };

    beepPattern(); // Play immediately
    alarmIntervalRef.current = setInterval(beepPattern, 1000); // Repeat every second
  };

  const stopAlarm = () => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  const handleDismiss = async () => {
    if (!activeReminder) return;

    try {
      const { error } = await supabase
        .from("task_reminders")
        .update({ is_dismissed: true })
        .eq("id", activeReminder.id);

      if (error) throw error;

      setActiveReminder(null);
      toast.success("Reminder dismissed");
    } catch (error: any) {
      console.error("Error dismissing reminder:", error);
      toast.error("Failed to dismiss reminder");
    }
  };

  const handleSnooze = async () => {
    if (!activeReminder || !snoozeMinutes || snoozeMinutes <= 0) {
      toast.error("Please enter a valid number of minutes");
      return;
    }

    try {
      const newReminderTime = new Date();
      newReminderTime.setMinutes(newReminderTime.getMinutes() + snoozeMinutes);

      const { error } = await supabase
        .from("task_reminders")
        .update({ 
          reminder_time: newReminderTime.toISOString(),
          is_snoozed: true 
        })
        .eq("id", activeReminder.id);

      if (error) throw error;

      setActiveReminder(null);
      setShowSnoozeDialog(false);
      toast.success(`Reminder snoozed for ${snoozeMinutes} minutes`);
    } catch (error: any) {
      console.error("Error snoozing reminder:", error);
      toast.error("Failed to snooze reminder");
    }
  };

  // Don't show reminder dialog for admins or if task data is missing
  if (!activeReminder || isAdmin || !activeReminder.tasks) return null;

  return (
    <>
      <Dialog open={!!activeReminder && !showSnoozeDialog} onOpenChange={(open) => !open && handleDismiss()}>
        <DialogContent className="sm:max-w-[425px] border-2 border-priority-urgent">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-priority-urgent">
              <Bell className="h-5 w-5 animate-bounce" />
              Task Reminder!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="font-medium text-lg">{activeReminder.tasks.title}</p>
            <p className="text-sm text-muted-foreground">
              Current status: <span className="capitalize">{activeReminder.tasks.status.replace(/_/g, " ")}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Move this task to the next stage: <span className="font-medium">Admin Cost Approval</span>
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleDismiss}>
              Dismiss
            </Button>
            <Button onClick={() => setShowSnoozeDialog(true)}>
              <Clock className="h-4 w-4 mr-2" />
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSnoozeDialog} onOpenChange={setShowSnoozeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Snooze Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="snooze-minutes">Snooze for (minutes)</Label>
              <Input
                id="snooze-minutes"
                type="number"
                min="1"
                value={snoozeMinutes}
                onChange={(e) => setSnoozeMinutes(parseInt(e.target.value))}
                placeholder="Enter minutes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnoozeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSnooze}>
              Set Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
