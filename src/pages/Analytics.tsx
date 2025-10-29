import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, FileText, Users, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type TaskStats = {
  total: number;
  completed: number;
  inProgress: number;
  urgent: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  avgTimeByStatus: Record<string, number>; // Average time in minutes
};

type TaskWithTiming = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
  profiles?: { full_name: string; email: string };
  timeInEachStage: Record<string, number>; // Time in minutes
  totalTime: number; // Total time in minutes
};

const Analytics = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    inProgress: 0,
    urgent: 0,
    byStatus: {},
    byPriority: {},
    avgTimeByStatus: {},
  });
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [users, setUsers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (userRole === "admin") {
      fetchUsers();
      fetchStats();
    }
  }, [userRole, selectedUser]);

  const checkAccess = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*, user_roles(*)")
        .eq("id", session.user.id)
        .single();

      const role = profile?.user_roles?.[0]?.role;
      if (role !== "admin") {
        toast.error("Access denied. Admin only.");
        navigate("/");
        return;
      }

      setUserRole(role);
    } catch (error) {
      console.error("Error checking access:", error);
      navigate("/");
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const calculateTaskTimings = (task: any, history: any[]) => {
    const timeInEachStage: Record<string, number> = {};
    
    // Sort history by created_at
    const sortedHistory = [...history].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Start with task creation time
    let previousTime = new Date(task.created_at);
    let previousStatus = sortedHistory[0]?.new_status || task.status;

    sortedHistory.forEach((entry) => {
      const currentTime = new Date(entry.created_at);
      const timeSpent = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60); // Convert to minutes
      
      if (entry.old_status) {
        timeInEachStage[entry.old_status] = (timeInEachStage[entry.old_status] || 0) + timeSpent;
      }
      
      previousTime = currentTime;
      previousStatus = entry.new_status;
    });

    // Add time for current status if task is not completed
    if (task.status !== 'done') {
      const currentTime = new Date();
      const timeSpent = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60);
      timeInEachStage[task.status] = (timeInEachStage[task.status] || 0) + timeSpent;
    } else if (task.completed_at) {
      const completedTime = new Date(task.completed_at);
      const timeSpent = (completedTime.getTime() - previousTime.getTime()) / (1000 * 60);
      timeInEachStage[task.status] = (timeInEachStage[task.status] || 0) + timeSpent;
    }

    const totalTime = Object.values(timeInEachStage).reduce((sum, time) => sum + time, 0);
    
    return { timeInEachStage, totalTime };
  };

  const fetchStats = async () => {
    try {
      let query = supabase.from("tasks").select("*").is("deleted_at", null);

      if (selectedUser !== "all") {
        query = query.or(`created_by.eq.${selectedUser},assigned_to.eq.${selectedUser}`);
      }

      const { data: tasks, error } = await query;
      if (error) throw error;

      // Fetch task history for all tasks
      const taskIds = tasks?.map(t => t.id) || [];
      const { data: allHistory } = await supabase
        .from("task_history")
        .select("*")
        .in("task_id", taskIds);

      // Calculate timings for each task
      const statusTimes: Record<string, number[]> = {};
      
      tasks?.forEach((task) => {
        const taskHistory = allHistory?.filter(h => h.task_id === task.id) || [];
        const { timeInEachStage } = calculateTaskTimings(task, taskHistory);
        
        Object.entries(timeInEachStage).forEach(([status, time]) => {
          if (!statusTimes[status]) statusTimes[status] = [];
          statusTimes[status].push(time);
        });
      });

      // Calculate average times
      const avgTimeByStatus: Record<string, number> = {};
      Object.entries(statusTimes).forEach(([status, times]) => {
        avgTimeByStatus[status] = times.reduce((sum, t) => sum + t, 0) / times.length;
      });

      const taskStats: TaskStats = {
        total: tasks?.length || 0,
        completed: tasks?.filter((t) => t.status === "done").length || 0,
        inProgress: tasks?.filter((t) => t.status !== "done").length || 0,
        urgent: tasks?.filter((t) => t.priority === "urgent").length || 0,
        byStatus: {},
        byPriority: {},
        avgTimeByStatus,
      };

      tasks?.forEach((task) => {
        taskStats.byStatus[task.status] = (taskStats.byStatus[task.status] || 0) + 1;
        taskStats.byPriority[task.priority] = (taskStats.byPriority[task.priority] || 0) + 1;
      });

      setStats(taskStats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      let query = supabase
        .from("tasks")
        .select("*, profiles!tasks_created_by_fkey(full_name, email)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (selectedUser !== "all") {
        query = query.or(`created_by.eq.${selectedUser},assigned_to.eq.${selectedUser}`);
      }

      const { data: tasks, error } = await query;
      if (error) throw error;

      // Fetch task history
      const taskIds = tasks?.map(t => t.id) || [];
      const { data: allHistory } = await supabase
        .from("task_history")
        .select("*")
        .in("task_id", taskIds);

      // Create CSV content with timing data
      const headers = [
        "Title",
        "Description",
        "Status",
        "Priority",
        "Created By",
        "Created At",
        "Completed At",
        "Total Time (hours)",
        "Time in To Do (hours)",
        "Time in Estimation (hours)",
        "Time in Design (hours)",
        "Time in Production (hours)",
        "Time in Done (hours)",
      ];

      const csvRows = [
        headers.join(","),
        ...(tasks || []).map((task) => {
          const taskHistory = allHistory?.filter(h => h.task_id === task.id) || [];
          const { timeInEachStage, totalTime } = calculateTaskTimings(task, taskHistory);
          
          return [
            `"${task.title}"`,
            `"${task.description || ""}"`,
            task.status,
            task.priority,
            `"${task.profiles?.full_name || task.profiles?.email || ""}"`,
            task.created_at,
            task.completed_at || "",
            (totalTime / 60).toFixed(2),
            ((timeInEachStage.todo || 0) / 60).toFixed(2),
            ((timeInEachStage.estimation || 0) / 60).toFixed(2),
            ((timeInEachStage.design || 0) / 60).toFixed(2),
            ((timeInEachStage.production || 0) / 60).toFixed(2),
            ((timeInEachStage.done || 0) / 60).toFixed(2),
          ].join(",");
        }),
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tasks-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Tasks exported successfully");
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Failed to export tasks");
    }
  };

  const exportToPDF = async () => {
    try {
      let query = supabase
        .from("tasks")
        .select("*, profiles!tasks_created_by_fkey(full_name, email)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (selectedUser !== "all") {
        query = query.or(`created_by.eq.${selectedUser},assigned_to.eq.${selectedUser}`);
      }

      const { data: tasks, error } = await query;
      if (error) throw error;

      // Fetch task history
      const taskIds = tasks?.map(t => t.id) || [];
      const { data: allHistory } = await supabase
        .from("task_history")
        .select("*")
        .in("task_id", taskIds);

      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(18);
      doc.text("Task Efficiency Report", 14, 20);
      
      // Add date
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
      
      // Add user filter info
      if (selectedUser !== "all") {
        const user = users.find(u => u.id === selectedUser);
        doc.text(`Team Member: ${user?.full_name || user?.email || "Unknown"}`, 14, 37);
      } else {
        doc.text("Team Member: All", 14, 37);
      }

      // Prepare table data with timing
      const tableData = (tasks || []).map((task) => {
        const taskHistory = allHistory?.filter(h => h.task_id === task.id) || [];
        const { totalTime } = calculateTaskTimings(task, taskHistory);
        
        return [
          task.title,
          task.status.replace(/_/g, " "),
          task.priority,
          task.profiles?.full_name || task.profiles?.email || "Unknown",
          (totalTime / 60).toFixed(1) + "h",
          task.completed_at ? new Date(task.completed_at).toLocaleDateString() : "In Progress",
        ];
      });

      // Add table
      autoTable(doc, {
        head: [["Title", "Status", "Priority", "Assigned To", "Total Time", "Completed"]],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [79, 70, 229] },
      });

      // Save the PDF
      doc.save(`tasks-report-${new Date().toISOString().split("T")[0]}.pdf`);

      toast.success("Report exported successfully");
    } catch (error) {
      console.error("Error exporting to PDF:", error);
      toast.error("Failed to export report");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
                <p className="text-sm text-muted-foreground">Admin overview and reports</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={exportToCSV} size="sm" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={exportToPDF} size="sm">
                <FileText className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Team Members</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.completed}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}% completion
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.inProgress}</div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Tasks by Status</CardTitle>
              <CardDescription>Distribution across workflow stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full"
                          style={{
                            width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks by Priority</CardTitle>
              <CardDescription>Priority distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(stats.byPriority)
                  .sort(([priorityA], [priorityB]) => {
                    // Sort by urgency: urgent > high > medium > low
                    const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
                    const orderA = priorityOrder[priorityA.toLowerCase()] || 0;
                    const orderB = priorityOrder[priorityB.toLowerCase()] || 0;
                    return orderB - orderA;
                  })
                  .map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{priority}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-accent h-full"
                          style={{
                            width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Average Time per Stage</CardTitle>
            <CardDescription>How long tasks spend in each workflow stage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.avgTimeByStatus).map(([status, avgMinutes]) => {
                const hours = Math.floor(avgMinutes / 60);
                const minutes = Math.round(avgMinutes % 60);
                return (
                  <div key={status} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm font-medium capitalize">{status.replace(/_/g, " ")}</span>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
                      </div>
                      <div className="text-xs text-muted-foreground">average time</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Analytics;
