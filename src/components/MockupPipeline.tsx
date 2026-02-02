import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { Palette, Clock, AlertCircle, User, ExternalLink } from "lucide-react";

interface MockupTask {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  priority: string;
  design_type: string;
  due_date: string | null;
  status: string;
  revision_notes: string | null;
  source_app: string | null;
  created_at: string;
  assigned_to: string | null;
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  review: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

export const MockupPipeline = () => {
  const [tasks, setTasks] = useState<MockupTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from("mockup_tasks")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error && data) {
      setTasks(data as MockupTask[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();

    // Real-time subscription
    const channel = supabase
      .channel("mockup-tasks-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "mockup_tasks",
      }, () => fetchTasks())
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, []);

  const updateStatus = async (id: string, status: string) => {
    await supabase
      .from("mockup_tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const reviewTasks = tasks.filter(t => t.status === 'review');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">JAIRAJ's Mockup Pipeline</CardTitle>
            <Badge variant="secondary" className="ml-auto">
              {tasks.length} total tasks
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Status summary */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-600">{pendingTasks.length}</div>
              <div className="text-xs text-yellow-700 dark:text-yellow-400">Pending</div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{inProgressTasks.length}</div>
              <div className="text-xs text-blue-700 dark:text-blue-400">In Progress</div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{reviewTasks.length}</div>
              <div className="text-xs text-purple-700 dark:text-purple-400">Review</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{completedTasks.length}</div>
              <div className="text-xs text-green-700 dark:text-green-400">Completed</div>
            </div>
          </div>

          {/* Task list */}
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Palette className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No mockup tasks yet</p>
                <p className="text-xs mt-1">Tasks will appear here when sent from REA FLOW</p>
              </div>
            ) : (
              tasks.map((task) => (
                <Card key={task.id} className="border-l-4 border-l-primary hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{task.title}</h3>
                        
                        {task.client_name && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <User className="h-3 w-3" />
                            <span>{task.client_name}</span>
                          </div>
                        )}
                        
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        
                        {task.revision_notes && (
                          <div className="mt-3 p-2 rounded-md bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-200 dark:border-amber-800">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Revision Notes:</span>
                                <p className="text-sm text-amber-800 dark:text-amber-300">{task.revision_notes}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {task.design_type}
                          </Badge>
                          <Badge className={`text-xs ${priorityColors[task.priority] || priorityColors.medium}`}>
                            {task.priority}
                          </Badge>
                          {task.due_date && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {format(new Date(task.due_date), "dd MMM yyyy")}
                            </span>
                          )}
                          {task.source_app && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="h-3 w-3" />
                              {task.source_app}
                            </span>
                          )}
                        </div>
                      </div>

                      <Select 
                        value={task.status} 
                        onValueChange={(v) => updateStatus(task.id, v)}
                      >
                        <SelectTrigger className={`w-[130px] ${statusColors[task.status] || ''}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="review">Review</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
