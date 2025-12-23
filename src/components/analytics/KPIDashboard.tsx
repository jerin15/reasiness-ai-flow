import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UserKPIData, TimePeriod, useKPIAnalytics } from "@/hooks/useKPIAnalytics";
import { RoleKPISection } from "./RoleKPISection";
import { IndividualPerformance } from "./IndividualPerformance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Download,
  Search,
  Calendar,
  Users,
  FileText,
  Paintbrush,
  Truck,
  Phone,
  Crown,
  TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Role = 'admin' | 'estimation' | 'designer' | 'operations' | 'client_service';

const roleIcons: Record<Role, any> = {
  admin: Crown,
  estimation: FileText,
  designer: Paintbrush,
  operations: Truck,
  client_service: Phone,
};

export const KPIDashboard = () => {
  const navigate = useNavigate();
  const { fetchAllUsersKPIs, fetchRoleKPIs, loading, getDateRange } = useKPIAnalytics();
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [activeRole, setActiveRole] = useState<Role | 'all'>('all');
  const [allUsers, setAllUsers] = useState<UserKPIData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserKPIData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    loadData();
  }, [period, activeRole]);

  useEffect(() => {
    filterUsers();
  }, [allUsers, searchQuery, activeRole]);

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

  const loadData = async () => {
    let users: UserKPIData[];
    if (activeRole === 'all') {
      users = await fetchAllUsersKPIs(period);
    } else {
      users = await fetchRoleKPIs(activeRole, period);
    }
    setAllUsers(users);
  };

  const filterUsers = () => {
    let filtered = allUsers;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.userName.toLowerCase().includes(query) ||
        u.userEmail.toLowerCase().includes(query)
      );
    }

    if (activeRole !== 'all') {
      filtered = filtered.filter(u => u.userRole === activeRole);
    }

    setFilteredUsers(filtered);
  };

  const exportReport = () => {
    try {
      const headers = [
        "Name",
        "Email",
        "Role",
        "Tasks Completed",
        "Status Changes",
        "Avg Completion Time (h)",
        "Efficiency Score",
        "Current Streak",
        "Badges Earned"
      ];

      const csvRows = [
        headers.join(","),
        ...filteredUsers.map(user => [
          `"${user.userName}"`,
          `"${user.userEmail}"`,
          user.userRole,
          user.kpis.tasksCompleted,
          user.kpis.statusChanges,
          user.kpis.avgCompletionTimeHours,
          user.efficiencyScore,
          user.streak,
          user.badges.filter(b => b.earnedAt).length,
        ].join(","))
      ];

      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kpi-report-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Report exported successfully");
    } catch (error) {
      console.error("Error exporting:", error);
      toast.error("Failed to export report");
    }
  };

  // Group users by role
  const usersByRole = {
    estimation: filteredUsers.filter(u => u.userRole === 'estimation'),
    designer: filteredUsers.filter(u => u.userRole === 'designer'),
    operations: filteredUsers.filter(u => u.userRole === 'operations'),
    client_service: filteredUsers.filter(u => u.userRole === 'client_service'),
    admin: filteredUsers.filter(u => u.userRole === 'admin' || u.userRole === 'technical_head'),
  };

  // Calculate totals
  const totalTasksCompleted = filteredUsers.reduce((sum, u) => sum + u.kpis.tasksCompleted, 0);

  const dateRange = getDateRange(period);

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
                <h1 className="text-2xl font-bold">📊 KPI Analytics Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  Comprehensive team performance metrics & achievements
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={period} onValueChange={(v) => setPeriod(v as TimePeriod)}>
                <SelectTrigger className="w-[140px]">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={exportReport} size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Date range indicator */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')}
          </div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-[200px]"
            />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border-blue-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Team Members</p>
                  <p className="text-3xl font-bold text-blue-600">{filteredUsers.length}</p>
                </div>
                <Users className="h-10 w-10 text-blue-500/40" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-200/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tasks Done</p>
                  <p className="text-3xl font-bold text-green-600">{totalTasksCompleted}</p>
                </div>
                <TrendingUp className="h-10 w-10 text-green-500/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger 
                value="all" 
                onClick={() => setActiveRole('all')}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                All Teams
              </TabsTrigger>
              {(['estimation', 'designer', 'operations', 'client_service'] as Role[]).map(role => {
                const Icon = roleIcons[role];
                const count = usersByRole[role]?.length || 0;
                return (
                  <TabsTrigger 
                    key={role}
                    value={role}
                    onClick={() => setActiveRole(role)}
                    className="flex items-center gap-2 capitalize"
                  >
                    <Icon className="h-4 w-4" />
                    {role.replace('_', ' ')}
                    <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="all" className="space-y-6">
              {usersByRole.estimation.length > 0 && (
                <RoleKPISection role="estimation" users={usersByRole.estimation} period={period} />
              )}
              {usersByRole.designer.length > 0 && (
                <RoleKPISection role="designer" users={usersByRole.designer} period={period} />
              )}
              {usersByRole.operations.length > 0 && (
                <RoleKPISection role="operations" users={usersByRole.operations} period={period} />
              )}
              {usersByRole.client_service.length > 0 && (
                <RoleKPISection role="client_service" users={usersByRole.client_service} period={period} />
              )}
            </TabsContent>

            {(['estimation', 'designer', 'operations', 'client_service'] as Role[]).map(role => (
              <TabsContent key={role} value={role} className="space-y-4">
                <RoleKPISection role={role} users={usersByRole[role]} period={period} />
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Team Member List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              Click on a team member to view their detailed performance report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map(user => (
                <div
                  key={user.userId}
                  onClick={() => setSelectedUserId(user.userId)}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <Avatar>
                    <AvatarImage src={user.avatarUrl} />
                    <AvatarFallback>
                      {user.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.userName}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {user.userRole.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {user.kpis.tasksCompleted} tasks
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {user.streak > 0 && (
                      <span className="text-sm" title={`${user.streak} day streak`}>🔥</span>
                    )}
                    {user.badges.filter(b => b.earnedAt).slice(0, 2).map(badge => (
                      <span key={badge.id} className="text-sm" title={badge.name}>
                        {badge.icon}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Individual Performance Dialog */}
      <Dialog open={!!selectedUserId} onOpenChange={() => setSelectedUserId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Performance Report</DialogTitle>
          </DialogHeader>
          {selectedUserId && (
            <IndividualPerformance 
              userId={selectedUserId} 
              onClose={() => setSelectedUserId(null)} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KPIDashboard;
