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
import { toast } from "sonner";
import reaLogo from "@/assets/rea_logo_h.jpg";
import { PersonalAnalytics } from "@/components/PersonalAnalytics";
import { IncomingCallNotification } from "@/components/IncomingCallNotification";
import { ProminentMessageNotification } from "@/components/ProminentMessageNotification";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { AddTaskDialog } from "@/components/AddTaskDialog";
import { CreateUserDialog } from "@/components/CreateUserDialog";
import { EstimationQuotaTracker } from "@/components/EstimationQuotaTracker";
import { EstimationMockupTracker } from "@/components/EstimationMockupTracker";
import { OperationsDailyRouting } from "@/components/OperationsDailyRouting";
import { OperationsDashboard } from "@/components/OperationsDashboard";

const Dashboard = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [userAvatar, setUserAvatar] = useState<string>("");
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
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showDailyRouting, setShowDailyRouting] = useState(false);
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*, user_roles(*)")
        .eq("id", session.user.id)
        .single();

      if (profileError) {
        console.error("Error fetching profile:", profileError);
        toast.error("Failed to load profile");
        return;
      }

      setUserName(profile.full_name || profile.email);
      setUserAvatar(profile.avatar_url || "");
      const role = profile.user_roles?.[0]?.role || "operations";
      setUserRole(role);
      setSelectedUserRole(role);

      if (role === "admin" || role === "technical_head") {
        fetchTeamMembers();
      }
    } catch (error) {
      console.error("Error checking auth:", error);
      toast.error("Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      console.log('👥 Dashboard: Starting fetchTeamMembers...');
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, user_roles(*)")
        .order("full_name");

      if (error) {
        console.error('❌ Dashboard: Error fetching team members:', error);
        throw error;
      }
      
      console.log('✅ Dashboard: Team members fetched:', data?.length || 0);
      setTeamMembers(data || []);
    } catch (error) {
      console.error("❌ Dashboard: fetchTeamMembers failed:", error);
      toast.error("Failed to load team members");
      // Don't let this block the dashboard from loading
      setTeamMembers([]);
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
    if (role === 'client_service') return 'Client Service Executive';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  console.log('🎯 Dashboard render:', { loading, userRole, selectedUserId, currentUserId });

  if (loading) {
    console.log('⏳ Dashboard: Still loading...');
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  console.log('✅ Dashboard: Loading complete, rendering main UI');

  // Show admin dashboard only for admin users viewing their own tasks
  if (userRole === 'admin' && selectedUserId === currentUserId) {
    console.log('👑 Dashboard: Rendering AdminDashboard');
    return (
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <DashboardSidebar
            userRole={userRole}
            currentUserId={currentUserId}
            selectedUserId={selectedUserId}
            teamMembers={teamMembers}
            unreadCount={unreadCount}
            onUserChange={handleUserChange}
            onAnalyticsClick={() => navigate("/analytics")}
            onMyReportClick={() => setShowMyReport(true)}
            onTeamReportClick={() => setShowTeamReport(true)}
            onEstimationReportClick={() => setShowEstimationReport(true)}
            onAdminTaskReportClick={() => {}}
            onChatClick={() => setShowChatList(true)}
            onPersonalAnalyticsClick={() => {}}
            onCreateTaskClick={() => setShowAddTask(true)}
            onSignOut={handleSignOut}
            getSelectedUserName={getSelectedUserName}
            formatRole={formatRole}
          />

          <div className="flex-1 flex flex-col">
            <header className="border-b bg-card shadow-sm sticky top-0 z-[5]">
              <div className="container mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="lg:hidden">
                      <Menu className="h-5 w-5" />
                    </SidebarTrigger>
                    <img src={reaLogo} alt="REAHUB - ANIMA Tech" className="h-12 w-auto" />
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={userAvatar} alt={userName} />
                        <AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">Welcome, {userName}</p>
                        <p className="text-xs text-muted-foreground">{formatRole(userRole)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>
            
            <main className="flex-1">
              <AdminDashboard />
            </main>
          </div>
        </div>

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
      <AddTaskDialog 
        open={showAddTask} 
        onOpenChange={setShowAddTask}
        onTaskAdded={() => {}}
        defaultAssignedTo={currentUserId}
      />
      
      <IncomingCallNotification />
      <ProminentMessageNotification />
      </SidebarProvider>
    );
  }

  console.log('📋 Dashboard: Rendering KanbanBoard view');
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <DashboardSidebar
          userRole={userRole}
          currentUserId={currentUserId}
          selectedUserId={selectedUserId}
          teamMembers={teamMembers}
          unreadCount={unreadCount}
          onUserChange={handleUserChange}
          onAnalyticsClick={() => navigate("/analytics")}
          onMyReportClick={() => setShowMyReport(true)}
          onTeamReportClick={() => setShowTeamReport(true)}
          onEstimationReportClick={() => setShowEstimationReport(true)}
          onAdminTaskReportClick={() => setShowAdminTaskReport(true)}
          onChatClick={() => setShowChat(true)}
          onPersonalAnalyticsClick={() => setShowPersonalAnalytics(!showPersonalAnalytics)}
          onCreateTaskClick={() => setShowAddTask(true)}
          onCreateUserClick={userRole === "admin" ? () => setShowCreateUser(true) : undefined}
          onDailyRoutingClick={() => setShowDailyRouting(!showDailyRouting)}
          onSignOut={handleSignOut}
          showPersonalAnalytics={showPersonalAnalytics}
          showDailyRouting={showDailyRouting}
          getSelectedUserName={getSelectedUserName}
          formatRole={formatRole}
        />

        <div className="flex-1 flex flex-col">
          <header className="border-b bg-card shadow-sm sticky top-0 z-[5]">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </SidebarTrigger>
                  <img src={reaLogo} alt="REAHUB - ANIMA Tech" className="h-12 w-auto" />
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={userAvatar} alt={userName} />
                      <AvatarFallback>{userName.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">Welcome, {userName}</p>
                      <p className="text-xs text-muted-foreground">{formatRole(userRole)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="container mx-auto px-4 py-6 relative">
            {userRole === "estimation" && (
              <div className="space-y-6 mb-6">
                <EstimationQuotaTracker />
                <EstimationMockupTracker />
              </div>
            )}
            {showPersonalAnalytics && userRole !== "admin" && (
              <div className="mb-6">
                <PersonalAnalytics userId={currentUserId} userRole={userRole} />
              </div>
            )}
            {selectedUserRole === "operations" ? (
              <OperationsDashboard userId={selectedUserId} />
            ) : (
              <KanbanBoard 
                userRole={userRole} 
                viewingUserId={selectedUserId}
                isAdmin={userRole === "admin" || userRole === "technical_head"}
                viewingUserRole={selectedUserRole}
              />
            )}
          </main>
        </div>

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
      <AddTaskDialog 
        open={showAddTask} 
        onOpenChange={setShowAddTask}
        onTaskAdded={() => {}}
        defaultAssignedTo={currentUserId}
      />
      
      <CreateUserDialog 
        open={showCreateUser}
        onOpenChange={setShowCreateUser}
      />
      
      <IncomingCallNotification />
      <ProminentMessageNotification />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
