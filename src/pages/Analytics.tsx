import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Users, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TaskStats = {
  total: number;
  completed: number;
  inProgress: number;
  urgent: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
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

  const fetchStats = async () => {
    try {
      let query = supabase.from("tasks").select("*").is("deleted_at", null);

      if (selectedUser !== "all") {
        query = query.or(`created_by.eq.${selectedUser},assigned_to.eq.${selectedUser}`);
      }

      const { data: tasks, error } = await query;

      if (error) throw error;

      const taskStats: TaskStats = {
        total: tasks?.length || 0,
        completed: tasks?.filter((t) => t.status === "done").length || 0,
        inProgress: tasks?.filter((t) => t.status !== "done").length || 0,
        urgent: tasks?.filter((t) => t.priority === "urgent").length || 0,
        byStatus: {},
        byPriority: {},
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

      // Create CSV content
      const headers = [
        "Title",
        "Description",
        "Status",
        "Priority",
        "Created By",
        "Due Date",
        "Created At",
        "Completed At",
      ];

      const csvRows = [
        headers.join(","),
        ...(tasks || []).map((task) =>
          [
            `"${task.title}"`,
            `"${task.description || ""}"`,
            task.status,
            task.priority,
            `"${task.profiles?.full_name || task.profiles?.email || ""}"`,
            task.due_date || "",
            task.created_at,
            task.completed_at || "",
          ].join(",")
        ),
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
            <Button onClick={exportToCSV} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                {Object.entries(stats.byPriority).map(([priority, count]) => (
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
      </main>
    </div>
  );
};

export default Analytics;
