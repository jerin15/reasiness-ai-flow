import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, Clock } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";

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
  type: string;
  client_name: string | null;
};

type TasksByStatus = {
  [key: string]: Task[];
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
        .select("id, title, status, priority, my_status, due_date, type, client_name")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .is("deleted_at", null)
        .eq("my_status", "pending")
        .neq("status", "done")
        .order("status");

      // Fetch done from my side tasks (including tasks with status = done)
      const { data: doneData } = await supabase
        .from("tasks")
        .select("id, title, status, priority, my_status, due_date, type, client_name")
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
        .is("deleted_at", null)
        .eq("my_status", "done_from_my_side")
        .order("status");

      setPendingTasks(pendingData || []);
      setDoneTasks(doneData || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const groupTasksByStatus = (tasks: Task[]): TasksByStatus => {
    const grouped: TasksByStatus = {
      todo: [],
      estimation: [],
      design: [],
      production: [],
    };

    tasks.forEach(task => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      } else {
        // If status doesn't match expected ones, add to todo
        grouped.todo.push(task);
      }
    });

    return grouped;
  };

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      todo: "To Do",
      estimation: "Estimation",
      design: "Design",
      production: "Production",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      todo: "bg-slate-100 text-slate-800",
      estimation: "bg-blue-100 text-blue-800",
      design: "bg-purple-100 text-purple-800",
      production: "bg-orange-100 text-orange-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string): string => {
    const colors: Record<string, string> = {
      urgent: "bg-red-100 text-red-800 border-red-300",
      high: "bg-orange-100 text-orange-800 border-orange-300",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
      low: "bg-blue-100 text-blue-800 border-blue-300",
    };
    return colors[priority.toLowerCase()] || "bg-gray-100 text-gray-800";
  };

  const pendingByStatus = groupTasksByStatus(pendingTasks);
  const totalPending = pendingTasks.length;

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
                Pending Tasks ({totalPending})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : totalPending === 0 ? (
                <p className="text-muted-foreground">No pending tasks</p>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(pendingByStatus).map(([status, tasks]) => 
                    tasks.length > 0 && (
                      <AccordionItem key={status} value={status}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Badge className={`${getStatusColor(status)} text-xs`}>
                              {getStatusLabel(status)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              ({tasks.length} tasks)
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pt-2">
                            {tasks.map(task => (
                              <div key={task.id} className={`p-3 border rounded-lg ${getPriorityColor(task.priority)}`}>
                                <h4 className="font-medium text-sm">{task.title}</h4>
                                {task.client_name && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Client: {task.client_name}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    {task.priority}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs capitalize">
                                    {task.type}
                                  </Badge>
                                  {task.due_date && (
                                    <Badge variant="outline" className="text-xs">
                                      Due: {new Date(task.due_date).toLocaleDateString()}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  )}
                </Accordion>
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
                  <div key={task.id} className="p-3 border rounded-lg bg-green-50">
                    <h4 className="font-medium text-sm">{task.title}</h4>
                    {task.client_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Client: {task.client_name}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs capitalize">
                        {task.priority}
                      </Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {task.type}
                      </Badge>
                      <Badge className={`${getStatusColor(task.status)} text-xs`}>
                        {getStatusLabel(task.status)}
                      </Badge>
                      {task.due_date && (
                        <Badge variant="outline" className="text-xs">
                          Due: {new Date(task.due_date).toLocaleDateString()}
                        </Badge>
                      )}
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
