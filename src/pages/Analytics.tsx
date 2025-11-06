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
  byStatus: Record<string, { count: number; tasks: TaskWithDetails[] }>;
  byPriority: Record<string, { count: number; tasks: TaskWithDetails[] }>;
  avgTimeByStatus: Record<string, number>;
  avgCompletionTime: number;
  teamMemberEfficiency: TeamMemberEfficiency[];
  pipelineTransitions: PipelineTransition[];
};

type TaskWithDetails = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string;
  assignee_name?: string;
  creator_name?: string;
  is_personal_admin_task: boolean;
};

type TeamMemberEfficiency = {
  user_id: string;
  user_name: string;
  total_tasks: number;
  completed_tasks: number;
  avg_completion_time_hours: number;
  pending_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  on_time_completion_rate: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  avgTimeByStage: Record<string, number>;
};

type PipelineTransition = {
  from_status: string;
  to_status: string;
  avg_time_hours: number;
  count: number;
};

type TaskWithTiming = {
  id: string;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at: string | null;
  profiles?: { full_name: string; email: string };
  timeInEachStage: Record<string, number>;
  totalTime: number;
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
    avgCompletionTime: 0,
    teamMemberEfficiency: [],
    pipelineTransitions: [],
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
      if (role !== "admin" && role !== "technical_head") {
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
      let query = supabase
        .from("tasks")
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(full_name, email),
          creator:profiles!tasks_created_by_fkey(full_name, email)
        `)
        .is("deleted_at", null);

      // If a specific user is selected
      if (selectedUser !== "all") {
        // Check if selected user is an admin
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", selectedUser)
          .single();

        if (userRoles?.role === "admin") {
          // For admins, show only personal tasks
          query = query.eq("is_personal_admin_task", true).eq("created_by", selectedUser);
        } else {
          // For non-admins, show tasks they created or are assigned to
          query = query.or(`created_by.eq.${selectedUser},assigned_to.eq.${selectedUser}`);
        }
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

      // Calculate average completion time for completed tasks
      const completedTasks = tasks?.filter(t => t.status === "done" && t.completed_at) || [];
      const avgCompletionTime = completedTasks.length > 0
        ? completedTasks.reduce((sum, task) => {
            const created = new Date(task.created_at).getTime();
            const completed = new Date(task.completed_at!).getTime();
            return sum + (completed - created) / (1000 * 60); // minutes
          }, 0) / completedTasks.length
        : 0;

      // Calculate team member efficiency with detailed breakdown
      const userEfficiencyMap = new Map<string, any>();
      tasks?.forEach((task) => {
        const userId = task.assigned_to || task.created_by;
        const userName = task.assignee?.full_name || task.assignee?.email || task.creator?.full_name || task.creator?.email || "Unknown";
        
        if (!userEfficiencyMap.has(userId)) {
          userEfficiencyMap.set(userId, {
            user_id: userId,
            user_name: userName,
            total_tasks: 0,
            completed_tasks: 0,
            total_completion_time: 0,
            pending_tasks: 0,
            in_progress_tasks: 0,
            overdue_tasks: 0,
            on_time_completions: 0,
            byStatus: {},
            byPriority: {},
            stageTimes: {},
          });
        }

        const userStats = userEfficiencyMap.get(userId);
        userStats.total_tasks++;

        // Count by status
        userStats.byStatus[task.status] = (userStats.byStatus[task.status] || 0) + 1;
        
        // Count by priority
        userStats.byPriority[task.priority] = (userStats.byPriority[task.priority] || 0) + 1;

        // Check if overdue
        if (task.due_date && task.status !== "done") {
          const now = new Date().getTime();
          const dueDate = new Date(task.due_date).getTime();
          if (now > dueDate) {
            userStats.overdue_tasks++;
          }
        }

        if (task.status === "done") {
          userStats.completed_tasks++;
          if (task.completed_at) {
            const created = new Date(task.created_at).getTime();
            const completed = new Date(task.completed_at).getTime();
            userStats.total_completion_time += (completed - created) / (1000 * 60 * 60); // hours
            
            // Check if completed on time
            if (task.due_date) {
              const dueDate = new Date(task.due_date).getTime();
              if (completed <= dueDate) {
                userStats.on_time_completions++;
              }
            } else {
              userStats.on_time_completions++; // No due date = on time
            }
          }
        } else if (task.status === "todo" || task.status === "admin_approval") {
          userStats.pending_tasks++;
        } else {
          userStats.in_progress_tasks++;
        }

        // Calculate time in each stage for this user (only for specific task types)
        const trackableTypes = ['quotation', 'invoice', 'design', 'production'];
        if (task.type && trackableTypes.includes(task.type.toLowerCase())) {
          const taskHistory = allHistory?.filter(h => h.task_id === task.id) || [];
          const { timeInEachStage } = calculateTaskTimings(task, taskHistory);
          Object.entries(timeInEachStage).forEach(([stage, time]) => {
            if (!userStats.stageTimes[stage]) {
              userStats.stageTimes[stage] = { total: 0, count: 0 };
            }
            userStats.stageTimes[stage].total += time;
            userStats.stageTimes[stage].count++;
          });
        }
      });

      const teamMemberEfficiency: TeamMemberEfficiency[] = Array.from(userEfficiencyMap.values()).map(stats => {
        const avgTimeByStage: Record<string, number> = {};
        Object.entries(stats.stageTimes).forEach(([stage, data]: [string, any]) => {
          avgTimeByStage[stage] = data.count > 0 ? (data.total / data.count) / 60 : 0; // Convert to hours
        });

        return {
          user_id: stats.user_id,
          user_name: stats.user_name,
          total_tasks: stats.total_tasks,
          completed_tasks: stats.completed_tasks,
          avg_completion_time_hours: stats.completed_tasks > 0 ? stats.total_completion_time / stats.completed_tasks : 0,
          pending_tasks: stats.pending_tasks,
          in_progress_tasks: stats.in_progress_tasks,
          overdue_tasks: stats.overdue_tasks,
          on_time_completion_rate: stats.completed_tasks > 0 ? (stats.on_time_completions / stats.completed_tasks) * 100 : 0,
          byStatus: stats.byStatus,
          byPriority: stats.byPriority,
          avgTimeByStage,
        };
      });

      // Calculate pipeline transitions
      const transitionMap = new Map<string, { total_time: number; count: number }>();
      
      allHistory?.forEach((entry) => {
        if (entry.old_status && entry.new_status) {
          const key = `${entry.old_status}->${entry.new_status}`;
          const task = tasks?.find(t => t.id === entry.task_id);
          
          if (task) {
            const taskHistory = allHistory.filter(h => h.task_id === task.id);
            const sortedHistory = [...taskHistory].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            // Find the time between this status change
            const currentIndex = sortedHistory.findIndex(h => h.id === entry.id);
            if (currentIndex > 0) {
              const prevEntry = sortedHistory[currentIndex - 1];
              const timeDiff = (new Date(entry.created_at).getTime() - new Date(prevEntry.created_at).getTime()) / (1000 * 60 * 60); // hours
              
              if (!transitionMap.has(key)) {
                transitionMap.set(key, { total_time: 0, count: 0 });
              }
              const transition = transitionMap.get(key)!;
              transition.total_time += timeDiff;
              transition.count++;
            }
          }
        }
      });

      const pipelineTransitions: PipelineTransition[] = Array.from(transitionMap.entries()).map(([key, data]) => {
        const [from_status, to_status] = key.split("->>");
        return {
          from_status,
          to_status,
          avg_time_hours: data.count > 0 ? data.total_time / data.count : 0,
          count: data.count,
        };
      });

      // Build byStatus and byPriority with task details
      const byStatus: Record<string, { count: number; tasks: TaskWithDetails[] }> = {};
      const byPriority: Record<string, { count: number; tasks: TaskWithDetails[] }> = {};

      tasks?.forEach((task) => {
        const taskDetail: TaskWithDetails = {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          created_at: task.created_at,
          completed_at: task.completed_at,
          assigned_to: task.assigned_to,
          created_by: task.created_by,
          assignee_name: task.assignee?.full_name || task.assignee?.email,
          creator_name: task.creator?.full_name || task.creator?.email,
          is_personal_admin_task: task.is_personal_admin_task || false,
        };

        if (!byStatus[task.status]) {
          byStatus[task.status] = { count: 0, tasks: [] };
        }
        byStatus[task.status].count++;
        byStatus[task.status].tasks.push(taskDetail);

        if (!byPriority[task.priority]) {
          byPriority[task.priority] = { count: 0, tasks: [] };
        }
        byPriority[task.priority].count++;
        byPriority[task.priority].tasks.push(taskDetail);
      });

      const taskStats: TaskStats = {
        total: tasks?.length || 0,
        completed: tasks?.filter((t) => t.status === "done").length || 0,
        inProgress: tasks?.filter((t) => t.status !== "done").length || 0,
        urgent: tasks?.filter((t) => t.priority === "urgent").length || 0,
        byStatus,
        byPriority,
        avgTimeByStatus,
        avgCompletionTime,
        teamMemberEfficiency,
        pipelineTransitions,
      };

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

        {/* Team Member Detailed Breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Team Member Performance Overview</CardTitle>
            <CardDescription>
              Comprehensive breakdown showing who's efficient, who needs attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {stats.teamMemberEfficiency
                .sort((a, b) => b.on_time_completion_rate - a.on_time_completion_rate)
                .map((member) => {
                  return (
                    <div key={member.user_id} className="border rounded-lg p-4 space-y-4">
                      {/* Header with name */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{member.user_name}</h3>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{member.total_tasks}</div>
                          <div className="text-xs text-muted-foreground">Total Tasks</div>
                        </div>
                      </div>

                      {/* Key metrics grid */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="text-center p-2 bg-success/10 rounded">
                          <div className="text-lg font-bold text-success">{member.completed_tasks}</div>
                          <div className="text-xs text-muted-foreground">Completed</div>
                        </div>
                        <div className="text-center p-2 bg-primary/10 rounded">
                          <div className="text-lg font-bold text-primary">{member.in_progress_tasks}</div>
                          <div className="text-xs text-muted-foreground">In Progress</div>
                        </div>
                        <div className="text-center p-2 bg-muted rounded">
                          <div className="text-lg font-bold">{member.pending_tasks}</div>
                          <div className="text-xs text-muted-foreground">Pending</div>
                        </div>
                        <div className={`text-center p-2 rounded ${member.overdue_tasks > 0 ? "bg-destructive/10" : "bg-muted"}`}>
                          <div className={`text-lg font-bold ${member.overdue_tasks > 0 ? "text-destructive" : ""}`}>
                            {member.overdue_tasks}
                          </div>
                          <div className="text-xs text-muted-foreground">Overdue</div>
                        </div>
                        <div className="text-center p-2 bg-muted rounded">
                          <div className="text-lg font-bold">{member.on_time_completion_rate.toFixed(0)}%</div>
                          <div className="text-xs text-muted-foreground">On-Time Rate</div>
                        </div>
                      </div>

                      {/* Tasks by Status breakdown */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tasks by Status</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(member.byStatus).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between text-xs p-2 bg-muted/50 rounded">
                              <span className="capitalize">{status.replace(/_/g, " ")}</span>
                              <span className="font-bold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Tasks by Priority breakdown */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Tasks by Priority</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(member.byPriority).map(([priority, count]) => (
                            <div key={priority} className={`flex items-center justify-between text-xs p-2 rounded ${
                              priority === "urgent" ? "bg-destructive/10 text-destructive" :
                              priority === "high" ? "bg-orange-500/10 text-orange-600" :
                              priority === "medium" ? "bg-yellow-500/10 text-yellow-600" :
                              "bg-muted/50"
                            }`}>
                              <span className="capitalize">{priority}</span>
                              <span className="font-bold">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Average time by stage */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">Average Time per Stage</h4>
                        <div className="space-y-1">
                          {Object.entries(member.avgTimeByStage).map(([stage, hours]) => (
                            <div key={stage} className="flex items-center justify-between text-xs">
                              <span className="capitalize text-muted-foreground">{stage.replace(/_/g, " ")}</span>
                              <span className="font-medium">{hours.toFixed(1)}h</span>
                            </div>
                          ))}
                          {Object.keys(member.avgTimeByStage).length === 0 && (
                            <div className="text-xs text-muted-foreground text-center py-2">No stage data yet</div>
                          )}
                        </div>
                      </div>

                      {/* Completion time */}
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Avg Completion Time</span>
                        <span className="text-sm font-bold">
                          {member.avg_completion_time_hours > 0 
                            ? `${member.avg_completion_time_hours.toFixed(1)} hours` 
                            : "N/A"}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Tasks by Status</CardTitle>
              <CardDescription>Distribution across workflow stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(stats.byStatus).map(([status, data]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full"
                          style={{
                            width: `${stats.total > 0 ? (data.count / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{data.count}</span>
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
                  .map(([priority, data]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <span className="text-sm capitalize">{priority}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-accent h-full"
                          style={{
                            width: `${stats.total > 0 ? (data.count / stats.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{data.count}</span>
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
