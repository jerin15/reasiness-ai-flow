import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, Search, FileText, TrendingUp, Paintbrush, Phone } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";

type ActivityMetric = {
  user_id: string;
  user_name: string;
  rfqs_sent: number;
  mockups_created: number;
  follow_ups: number;
  tasks_completed: number;
  status_changes: number;
};

type ActivityLog = {
  id: string;
  action: string;
  task_title: string;
  user_name: string;
  created_at: string;
  details: any;
};

const Analytics = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>(format(startOfWeek(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState<string>(format(endOfWeek(new Date()), "yyyy-MM-dd"));
  const [searchQuery, setSearchQuery] = useState("");
  const [metrics, setMetrics] = useState<ActivityMetric[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [activityType, setActivityType] = useState<string>("all");

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAnalytics();
  }, [selectedUser, dateFrom, dateTo, activityType]);

  const checkAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
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

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Build date range filters
      const fromDate = startOfDay(new Date(dateFrom)).toISOString();
      const toDate = endOfDay(new Date(dateTo)).toISOString();

      // Fetch task activity logs
      let activityQuery = supabase
        .from("task_activity_log")
        .select(`
          id,
          action,
          details,
          created_at,
          user_id,
          task_id,
          tasks!inner(title, status, type)
        `)
        .gte("created_at", fromDate)
        .lte("created_at", toDate)
        .order("created_at", { ascending: false });

      if (selectedUser !== "all") {
        activityQuery = activityQuery.eq("user_id", selectedUser);
      }

      if (activityType !== "all") {
        activityQuery = activityQuery.eq("action", activityType);
      }

      const { data: activityData, error: activityError } = await activityQuery;
      if (activityError) throw activityError;

      // Fetch all user profiles
      const userIds = Array.from(new Set((activityData || []).map((log: any) => log.user_id)));
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      if (profileError) throw profileError;

      // Create a map of user profiles for quick lookup
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Process activities
      const processedActivities: ActivityLog[] = (activityData || []).map((log: any) => {
        const profile = profileMap.get(log.user_id);
        return {
          id: log.id,
          action: log.action,
          task_title: log.tasks?.title || "Unknown Task",
          user_name: profile?.full_name || profile?.email || "Unknown",
          created_at: log.created_at,
          details: log.details,
        };
      });

      setActivities(processedActivities);

      // Calculate metrics per user
      const userMetricsMap = new Map<string, ActivityMetric>();

      (activityData || []).forEach((log: any) => {
        const userId = log.user_id;
        const profile = profileMap.get(userId);
        const userName = profile?.full_name || profile?.email || "Unknown";

        if (!userMetricsMap.has(userId)) {
          userMetricsMap.set(userId, {
            user_id: userId,
            user_name: userName,
            rfqs_sent: 0,
            mockups_created: 0,
            follow_ups: 0,
            tasks_completed: 0,
            status_changes: 0,
          });
        }

        const metric = userMetricsMap.get(userId)!;

        // Count specific actions
        if (log.action === "sent_to_designer_mockup" || log.action === "created" && log.tasks?.type === "quotation") {
          metric.rfqs_sent++;
        }

        if (log.action === "mockup_completed" || log.action === "designer_completed_mockup") {
          metric.mockups_created++;
        }

        if (log.action === "follow_up" || log.action === "quick_action" && log.details?.action === "follow_up") {
          metric.follow_ups++;
        }

        if (log.action === "completed" || log.action === "status_changed" && log.details?.new_status === "done") {
          metric.tasks_completed++;
        }

        if (log.action === "status_changed") {
          metric.status_changes++;
        }
      });

      setMetrics(Array.from(userMetricsMap.values()).sort((a, b) => 
        (b.rfqs_sent + b.mockups_created + b.follow_ups + b.tasks_completed) - 
        (a.rfqs_sent + a.mockups_created + a.follow_ups + a.tasks_completed)
      ));

    } catch (error) {
      console.error("Error fetching analytics:", error);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    try {
      const headers = [
        "Date/Time",
        "User",
        "Action",
        "Task",
        "Details"
      ];

      const csvRows = [
        headers.join(","),
        ...filteredActivities.map(activity => [
          format(new Date(activity.created_at), "yyyy-MM-dd HH:mm:ss"),
          `"${activity.user_name}"`,
          activity.action.replace(/_/g, " "),
          `"${activity.task_title}"`,
          `"${JSON.stringify(activity.details || {})}"`,
        ].join(","))
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${dateFrom}-to-${dateTo}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Analytics exported successfully");
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Failed to export analytics");
    }
  };

  const filteredActivities = activities.filter(activity => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.user_name.toLowerCase().includes(query) ||
      activity.task_title.toLowerCase().includes(query) ||
      activity.action.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const totalRFQs = metrics.reduce((sum, m) => sum + m.rfqs_sent, 0);
  const totalMockups = metrics.reduce((sum, m) => sum + m.mockups_created, 0);
  const totalFollowUps = metrics.reduce((sum, m) => sum + m.follow_ups, 0);
  const totalCompleted = metrics.reduce((sum, m) => sum + m.tasks_completed, 0);

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
                <p className="text-sm text-muted-foreground">
                  Track team activity and performance
                </p>
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
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label htmlFor="dateFrom">From Date</Label>
                <Input
                  id="dateFrom"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="dateTo">To Date</Label>
                <Input
                  id="dateTo"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <div>
                <Label>Team Member</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Members</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Activity Type</Label>
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Activities</SelectItem>
                    <SelectItem value="created">Task Created</SelectItem>
                    <SelectItem value="status_changed">Status Changed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="sent_to_designer_mockup">Sent to Designer</SelectItem>
                    <SelectItem value="mockup_completed">Mockup Completed</SelectItem>
                    <SelectItem value="follow_up">Follow Up</SelectItem>
                    <SelectItem value="quick_action">Quick Action</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search activities..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom(format(startOfDay(new Date()), "yyyy-MM-dd"));
                  setDateTo(format(endOfDay(new Date()), "yyyy-MM-dd"));
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom(format(startOfWeek(new Date()), "yyyy-MM-dd"));
                  setDateTo(format(endOfWeek(new Date()), "yyyy-MM-dd"));
                }}
              >
                This Week
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">RFQs Sent</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRFQs}</div>
              <p className="text-xs text-muted-foreground">
                Total quotation requests
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mockups Created</CardTitle>
              <Paintbrush className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMockups}</div>
              <p className="text-xs text-muted-foreground">
                Completed by designers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Follow Ups</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalFollowUps}</div>
              <p className="text-xs text-muted-foreground">
                Client follow-ups made
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCompleted}</div>
              <p className="text-xs text-muted-foreground">
                Total tasks finished
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Team Member Metrics */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
            <CardDescription>
              Activity breakdown by team member for selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-center">RFQs</TableHead>
                  <TableHead className="text-center">Mockups</TableHead>
                  <TableHead className="text-center">Follow Ups</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-center">Status Changes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No activity data for selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  metrics.map((metric) => (
                    <TableRow key={metric.user_id}>
                      <TableCell className="font-medium">{metric.user_name}</TableCell>
                      <TableCell className="text-center">{metric.rfqs_sent}</TableCell>
                      <TableCell className="text-center">{metric.mockups_created}</TableCell>
                      <TableCell className="text-center">{metric.follow_ups}</TableCell>
                      <TableCell className="text-center">{metric.tasks_completed}</TableCell>
                      <TableCell className="text-center">{metric.status_changes}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
            <CardDescription>
              Detailed activity timeline - {filteredActivities.length} activities found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Task</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActivities.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No activities found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredActivities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(activity.created_at), "MMM dd, yyyy HH:mm")}
                        </TableCell>
                        <TableCell>{activity.user_name}</TableCell>
                        <TableCell className="capitalize">
                          {activity.action.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="max-w-md truncate">
                          {activity.task_title}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Analytics;
