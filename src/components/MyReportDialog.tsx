import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, Clock } from "lucide-react";

type MyReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  my_status: string;
  due_date: string | null;
};

export const MyReportDialog = ({ open, onOpenChange }: MyReportDialogProps) => {
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchMyTasks();
    }
  }, [open]);

  const fetchMyTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch pending tasks (not done status, pending my_status)
      const { data: pendingData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, my_status, due_date")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .is("deleted_at", null)
        .eq("my_status", "pending")
        .neq("status", "done");

      // Fetch done from my side tasks (including tasks with status = done)
      const { data: doneData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, my_status, due_date")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .is("deleted_at", null)
        .eq("my_status", "done_from_my_side");

      setPendingTasks(pendingData || []);
      setDoneTasks(doneData || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My Task Report</DialogTitle>
        </DialogHeader>
        
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-500" />
                Pending Tasks ({pendingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : pendingTasks.length === 0 ? (
                <p className="text-muted-foreground">No pending tasks</p>
              ) : (
                pendingTasks.map(task => (
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
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Done From My Side ({doneTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : doneTasks.length === 0 ? (
                <p className="text-muted-foreground">No completed tasks</p>
              ) : (
                doneTasks.map(task => (
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
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
