import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard } from "@/components/KanbanBoard";
import { AdminDashboard } from "@/components/AdminDashboard";
import { MyReportDialog } from "@/components/MyReportDialog";
import { DueRemindersDialog } from "@/components/DueRemindersDialog";
import { DueDateReminderDialog } from "@/components/DueDateReminderDialog";
import { PendingTasksDialog } from "@/components/PendingTasksDialog";
import { DailyPendingTasksDialog } from "@/components/DailyPendingTasksDialog";
import { TeamMemberReportDialog } from "@/components/TeamMemberReportDialog";
import { EstimationTeamReportDialog } from "@/components/EstimationTeamReportDialog";
import { ChatDialog } from "@/components/ChatDialog";
import { ModernChatList } from "@/components/ModernChatList";
import { ReportsDownloadDialog } from "@/components/ReportsDownloadDialog";
import { AdminTaskReportDialog } from "@/components/AdminTaskReportDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, MessageSquare, BarChart3, Users, FileText, Download, Clock } from "lucide-react";
import { toast } from "sonner";
import reaLogo from "@/assets/rea_logo_h.jpg";
import { PersonalAnalytics } from "@/components/PersonalAnalytics";
import { StatusChangeNotification } from "@/components/StatusChangeNotification";
import { WalkieTalkieNotification } from "@/components/WalkieTalkieNotification";
import { IncomingCallNotification } from "@/components/IncomingCallNotification";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

const Dashboard = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserRole, setSelectedUserRole] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMyReport, setShowMyReport] = useState(false);
  const [showDueReminders, setShowDueReminders] = useState(false);
  const [showDueDateReminder, setShowDueDateReminder] = useState(false);
  const [showPendingOnSignOut, setShowPendingOnSignOut] = useState(false);
  const [showDailyPending, setShowDailyPending] = useState(false);
  const [showTeamReport, setShowTeamReport] = useState(false);
  const [showEstimationReport, setShowEstimationReport] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [showReportsDownload, setShowReportsDownload] = useState(false);
  const [showPendingTasks, setShowPendingTasks] = useState(false);
  const [chatRecipientId, setChatRecipientId] = useState("");
  const [chatRecipientName, setChatRecipientName] = useState("");
  const [showAdminTaskReport, setShowAdminTaskReport] = useState(false);
  const [showPersonalAnalytics, setShowPersonalAnalytics] = useState(false);
  const unreadCount = useUnreadMessageCount(currentUserId);

  useEffect(() => {
    checkAuth();
  }, []);

  // Show reminders for all users
  useEffect(() => {
    if (!userRole || !currentUserId) return;
    
    // Show old due reminders on sign in (for non-admins)
    if (userRole !== "admin") {
      const hasSeenReminders = sessionStorage.getItem("hasSeenReminders");
      if (!hasSeenReminders) {
        setTimeout(() => {
          setShowDueReminders(true);
          sessionStorage.setItem("hasSeenReminders", "true");
        }, 1000);
      }
    }

    // Show NEW due date reminder dialog for non-admins only
    if (userRole !== "admin") {
      const today = new Date().toDateString();
      const lastReminderCheck = localStorage.getItem("lastReminderCheck");
      
      if (lastReminderCheck !== today) {
        setTimeout(() => {
          setShowDueDateReminder(true);
          localStorage.setItem("lastReminderCheck", today);
        }, 1500);
      }
    }

    // Show daily pending tasks notification (non-admins only)
    if (userRole !== "admin") {
      const today = new Date().toDateString();
      const lastPendingCheck = localStorage.getItem("lastPendingCheck");
      
      if (lastPendingCheck !== today) {
        setTimeout(() => {
          setShowDailyPending(true);
          localStorage.setItem("lastPendingCheck", today);
        }, 2000);
      }
    }
  }, [userRole, currentUserId]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

      setCurrentUserId(session.user.id);
      setSelectedUserId(session.user.id);

      // Get user profile and role
      const { data: profile } = await supabase
        .from("profiles")
        .select("*, user_roles(*)")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setUserName(profile.full_name || profile.email);
        const role = profile.user_roles?.[0]?.role || "operations";
        setUserRole(role);
        setSelectedUserRole(role);

        // If admin or technical_head, fetch all team members
        if (role === "admin" || role === "technical_head") {
          fetchTeamMembers();
        }
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, user_roles(*)")
        .order("full_name");

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      sessionStorage.removeItem("hasSeenReminders");
      localStorage.removeItem("lastReminderCheck");
      localStorage.removeItem("lastPendingCheck");
      navigate("/auth");
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    }
  };

  const getSelectedUserName = () => {
    if (selectedUserId === currentUserId) return "My Tasks";
    const user = teamMembers.find((u) => u.id === selectedUserId);
    return user ? `${user.full_name || user.email}'s Tasks` : "Tasks";
  };

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    if (userId === currentUserId) {
      setSelectedUserRole(userRole);
    } else {
      const user = teamMembers.find((u) => u.id === userId);
      setSelectedUserRole(user?.user_roles?.[0]?.role || "operations");
    }
  };

  // Helper function to format role names
  const formatRole = (role: string) => {
    if (role === 'technical_head') return 'Technical Head';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show admin dashboard only for admin users viewing their own tasks
  if (userRole === 'admin' && selectedUserId === currentUserId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card shadow-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img src={reaLogo} alt="REA Advertising" className="h-10 w-auto" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Welcome, {userName} ({formatRole(userRole)})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={selectedUserId} onValueChange={handleUserChange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>{getSelectedUserName()}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={currentUserId}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">My Tasks</span>
                      </div>
                    </SelectItem>
                    {teamMembers
                      .filter((user) => user.id !== currentUserId)
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex flex-col items-start">
                            <span>{user.full_name || user.email}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatRole(user.user_roles?.[0]?.role || 'operations')}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/analytics")}
                  >
                    <BarChart3 className="h-3 w-3 mr-1" />
                    Analytics
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowMyReport(true)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    My Reports
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTeamReport(true)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Team
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEstimationReport(true)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Estimation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowChatList(true)}
                  >
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                  <StatusChangeNotification />
                  <WalkieTalkieNotification />
                  <Button variant="destructive" size="sm" onClick={handleSignOut}>
                    <LogOut className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        <AdminDashboard />

        <MyReportDialog open={showMyReport} onOpenChange={setShowMyReport} />
        <ModernChatList
          open={showChatList} 
          onOpenChange={setShowChatList}
          currentUserId={currentUserId}
        />
        {chatRecipientId && (
          <ChatDialog
            open={!!chatRecipientId}
            onOpenChange={(open) => !open && setChatRecipientId(null)}
            recipientId={chatRecipientId}
            recipientName={chatRecipientName}
          />
        )}
        <ReportsDownloadDialog 
          open={showReportsDownload} 
          onOpenChange={setShowReportsDownload} 
        />
        <TeamMemberReportDialog
          open={showTeamReport}
          onOpenChange={setShowTeamReport}
        />
        <EstimationTeamReportDialog
          open={showEstimationReport}
          onOpenChange={setShowEstimationReport}
        />
        <PendingTasksDialog
          open={showPendingTasks}
          onOpenChange={setShowPendingTasks}
          onConfirmSignOut={handleSignOut}
        />
        
        <IncomingCallNotification />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={reaLogo} alt="REA Advertising" className="h-10 w-auto" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Welcome, {userName} ({formatRole(userRole)})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(userRole === "admin" || userRole === "technical_head") && (
                <>
                  <Select value={selectedUserId} onValueChange={handleUserChange}>
                    <SelectTrigger className="w-[240px]">
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <Users className="h-3 w-3" />
                          <span>{getSelectedUserName()}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={currentUserId}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">My Tasks</span>
                        </div>
                      </SelectItem>
                      {teamMembers
                        .filter((user) => user.id !== currentUserId)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex flex-col items-start">
                              <span>{user.full_name || user.email}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatRole(user.user_roles?.[0]?.role || 'operations')}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/analytics")}
                  >
                    <BarChart3 className="h-3 w-3 mr-2" />
                    Analytics
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTeamReport(true)}
                  >
                    <FileText className="h-3 w-3 mr-2" />
                    Team Reports
                  </Button>
                 </>
              )}
              {(userRole !== "admin" && userRole !== "technical_head") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPersonalAnalytics(!showPersonalAnalytics)}
                >
                  <BarChart3 className="h-3 w-3 mr-2" />
                  {showPersonalAnalytics ? "Hide" : "Show"} Analytics
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMyReport(true)}
              >
                <FileText className="h-3 w-3 mr-2" />
                My Report
              </Button>
              {(userRole === "admin" || userRole === "technical_head") && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdminTaskReport(true)}
                  >
                    <FileText className="h-3 w-3 mr-2" />
                    Member Reports
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEstimationReport(true)}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    Estimation Report
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChat(true)}
                className="relative"
              >
                <MessageSquare className="h-3 w-3 mr-2" />
                Team Chat
                {unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
              <StatusChangeNotification />
              <WalkieTalkieNotification />
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-3 w-3 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {showPersonalAnalytics && userRole !== "admin" && (
          <div className="mb-6">
            <PersonalAnalytics userId={currentUserId} userRole={userRole} />
          </div>
        )}
        <KanbanBoard 
          userRole={userRole} 
          viewingUserId={selectedUserId}
          isAdmin={userRole === "admin" || userRole === "technical_head"}
          viewingUserRole={selectedUserRole}
        />
      </main>

      <MyReportDialog open={showMyReport} onOpenChange={setShowMyReport} />
      <DueRemindersDialog open={showDueReminders} onOpenChange={setShowDueReminders} />
      <DueDateReminderDialog 
        open={showDueDateReminder} 
        onOpenChange={setShowDueDateReminder}
        userId={currentUserId}
      />
      <DailyPendingTasksDialog open={showDailyPending} onOpenChange={setShowDailyPending} />
      <PendingTasksDialog 
        open={showPendingOnSignOut} 
        onOpenChange={setShowPendingOnSignOut}
        onConfirmSignOut={handleSignOut}
      />
      <TeamMemberReportDialog
        open={showTeamReport}
        onOpenChange={setShowTeamReport}
      />
      
      <EstimationTeamReportDialog
        open={showEstimationReport}
        onOpenChange={setShowEstimationReport}
      />
      
      <ModernChatList
        open={showChat}
        onOpenChange={setShowChat}
        currentUserId={currentUserId}
      />
      
      {chatRecipientId && (
        <ChatDialog
          open={!!chatRecipientId}
          onOpenChange={(open) => {
            if (!open) {
              setChatRecipientId("");
              setChatRecipientName("");
            }
          }}
          recipientId={chatRecipientId}
          recipientName={chatRecipientName}
        />
      )}

      {(userRole === "admin" || userRole === "technical_head") && (
        <AdminTaskReportDialog
          open={showAdminTaskReport}
          onOpenChange={setShowAdminTaskReport}
          teamMembers={teamMembers}
        />
      )}
      
      <IncomingCallNotification />
    </div>
  );
};

export default Dashboard;
