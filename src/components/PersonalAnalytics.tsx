import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertCircle, TrendingUp, FileText, Send } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type PersonalStats = {
  total: number;
  pending: number;
  done: number;
  urgent: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  // Estimation specific
  rfqsReceived?: number;
  quotationsSent?: number;
};

type PersonalAnalyticsProps = {
  userId: string;
  userRole: string;
};

export const PersonalAnalytics = ({ userId, userRole }: PersonalAnalyticsProps) => {
  const [stats, setStats] = useState<PersonalStats>({
    total: 0,
    pending: 0,
    done: 0,
    urgent: 0,
    byStatus: {},
    byPriority: {},
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [userId]);

  const fetchStats = async () => {
    try {
      // Fetch tasks assigned to or created by the user
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("*")
        .is("deleted_at", null)
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`);

      if (error) throw error;

      const taskStats: PersonalStats = {
        total: tasks?.length || 0,
        pending: tasks?.filter((t) => t.status !== "done").length || 0,
        done: tasks?.filter((t) => t.status === "done").length || 0,
        urgent: tasks?.filter((t) => t.priority === "urgent").length || 0,
        byStatus: {},
        byPriority: {},
      };

      // Calculate by status and priority
      tasks?.forEach((task) => {
        taskStats.byStatus[task.status] = (taskStats.byStatus[task.status] || 0) + 1;
        taskStats.byPriority[task.priority] = (taskStats.byPriority[task.priority] || 0) + 1;
      });

      // Estimation-specific analytics
      if (userRole === "estimation") {
        // RFQs: quotation type tasks in first 3 pipelines (todo, estimation, design)
        const rfqs = tasks?.filter(
          (t) => t.type === "quotation" && ["todo", "estimation", "design"].includes(t.status)
        ).length || 0;

        // Quotations Sent: quotation type tasks that reached done
        const quotationsSent = tasks?.filter(
          (t) => t.type === "quotation" && t.status === "done"
        ).length || 0;

        taskStats.rfqsReceived = rfqs;
        taskStats.quotationsSent = quotationsSent;
      }

      setStats(taskStats);
    } catch (error) {
      console.error("Error fetching personal stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const completionRate = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.done}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.urgent}</div>
          </CardContent>
        </Card>
      </div>

      {/* Estimation Specific Metrics */}
      {userRole === "estimation" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">RFQs Received</CardTitle>
              <FileText className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{stats.rfqsReceived || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Quotations in To Do, Estimation, Design
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quotations Sent</CardTitle>
              <Send className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{stats.quotationsSent || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Quotations completed and sent
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Completion Rate</CardTitle>
          <CardDescription>Overall task completion progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Progress value={completionRate} className="h-2" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{stats.done} completed</span>
              <span className="font-medium">{completionRate}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Status</CardTitle>
            <CardDescription>Distribution across workflow stages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.byStatus).map(([status, count]) => {
                const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={status} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">{status.replace(/_/g, " ")}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks by Priority</CardTitle>
            <CardDescription>Priority distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.byPriority)
                .sort(([priorityA], [priorityB]) => {
                  const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
                  return (priorityOrder[priorityB] || 0) - (priorityOrder[priorityA] || 0);
                })
                .map(([priority, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  const priorityColors: Record<string, string> = {
                    urgent: "bg-destructive",
                    high: "bg-orange-500",
                    medium: "bg-yellow-500",
                    low: "bg-blue-500",
                  };
                  return (
                    <div key={priority} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">{priority}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full ${priorityColors[priority.toLowerCase()] || "bg-primary"}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
