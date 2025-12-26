import { useState, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import reaLogo from "@/assets/rea_logo_h.jpg";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// Lazy load heavy components to reduce initial bundle size
const KanbanBoard = lazy(() => import("@/components/KanbanBoard").then(m => ({ default: m.KanbanBoard })));
const AdminDashboard = lazy(() => import("@/components/AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const OperationsDashboard = lazy(() => import("@/components/OperationsDashboard").then(m => ({ default: m.OperationsDashboard })));
const PersonalAnalytics = lazy(() => import("@/components/PersonalAnalytics").then(m => ({ default: m.PersonalAnalytics })));
const EstimationQuotaTracker = lazy(() => import("@/components/EstimationQuotaTracker").then(m => ({ default: m.EstimationQuotaTracker })));
const EstimationMockupTracker = lazy(() => import("@/components/EstimationMockupTracker").then(m => ({ default: m.EstimationMockupTracker })));

// Lazy load dialogs (only loaded when needed)
const MyReportDialog = lazy(() => import("@/components/MyReportDialog").then(m => ({ default: m.MyReportDialog })));
const DueRemindersDialog = lazy(() => import("@/components/DueRemindersDialog").then(m => ({ default: m.DueRemindersDialog })));
const DueDateReminderDialog = lazy(() => import("@/components/DueDateReminderDialog").then(m => ({ default: m.DueDateReminderDialog })));
const PendingTasksDialog = lazy(() => import("@/components/PendingTasksDialog").then(m => ({ default: m.PendingTasksDialog })));
const DailyPendingTasksDialog = lazy(() => import("@/components/DailyPendingTasksDialog").then(m => ({ default: m.DailyPendingTasksDialog })));
const TeamMemberReportDialog = lazy(() => import("@/components/TeamMemberReportDialog").then(m => ({ default: m.TeamMemberReportDialog })));
const EstimationTeamReportDialog = lazy(() => import("@/components/EstimationTeamReportDialog").then(m => ({ default: m.EstimationTeamReportDialog })));
const ChatDialog = lazy(() => import("@/components/ChatDialog").then(m => ({ default: m.ChatDialog })));
const ModernChatList = lazy(() => import("@/components/ModernChatList").then(m => ({ default: m.ModernChatList })));
const AdminTaskReportDialog = lazy(() => import("@/components/AdminTaskReportDialog").then(m => ({ default: m.AdminTaskReportDialog })));
const AddTaskDialog = lazy(() => import("@/components/AddTaskDialog").then(m => ({ default: m.AddTaskDialog })));
const CreateOperationsTaskDialog = lazy(() => import("@/components/CreateOperationsTaskDialog").then(m => ({ default: m.CreateOperationsTaskDialog })));
const CreateTaskChooserDialog = lazy(() => import("@/components/CreateTaskChooserDialog").then(m => ({ default: m.CreateTaskChooserDialog })));
const CreateUserDialog = lazy(() => import("@/components/CreateUserDialog").then(m => ({ default: m.CreateUserDialog })));
const ManageTeamDialog = lazy(() => import("@/components/ManageTeamDialog").then(m => ({ default: m.ManageTeamDialog })));
const IncomingCallNotification = lazy(() => import("@/components/IncomingCallNotification").then(m => ({ default: m.IncomingCallNotification })));
const ProminentMessageNotification = lazy(() => import("@/components/ProminentMessageNotification").then(m => ({ default: m.ProminentMessageNotification })));

// Minimal loading component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

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
  
  // Dialog states - only render when open
  const [showMyReport, setShowMyReport] = useState(false);
  const [showDueReminders, setShowDueReminders] = useState(false);
  const [showDueDateReminder, setShowDueDateReminder] = useState(false);
  const [showPendingOnSignOut, setShowPendingOnSignOut] = useState(false);
  const [showDailyPending, setShowDailyPending] = useState(false);
  const [showTeamReport, setShowTeamReport] = useState(false);
  const [showEstimationReport, setShowEstimationReport] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showChatList, setShowChatList] = useState(false);
  const [chatRecipientId, setChatRecipientId] = useState("");
  const [chatRecipientName, setChatRecipientName] = useState("");
  const [showAdminTaskReport, setShowAdminTaskReport] = useState(false);
  const [showPersonalAnalytics, setShowPersonalAnalytics] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCreateOpsTask, setShowCreateOpsTask] = useState(false);
  const [showTaskChooser, setShowTaskChooser] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showManageTeam, setShowManageTeam] = useState(false);
  
  const unreadCount = useUnreadMessageCount(currentUserId);

  useEffect(() => {
    checkAuth();
  }, []);

  // Show reminders for all users
  useEffect(() => {
    if (!userRole || !currentUserId) return;
    
    if (userRole !== "admin") {
      const hasSeenReminders = sessionStorage.getItem("hasSeenReminders");
      if (!hasSeenReminders) {
        setTimeout(() => {
          setShowDueReminders(true);
          sessionStorage.setItem("hasSeenReminders", "true");
        }, 1000);
      }

      const today = new Date().toDateString();
      const lastReminderCheck = localStorage.getItem("lastReminderCheck");
      if (lastReminderCheck !== today) {
        setTimeout(() => {
          setShowDueDateReminder(true);
          localStorage.setItem("lastReminderCheck", today);
        }, 1500);
      }

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
      const { data: { session } } = await supabase.auth.getSession();

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
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, user_roles(*)")
        .order("full_name");

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Dashboard: fetchTeamMembers failed:", error);
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

  const formatRole = (role: string) => {
    if (role === 'technical_head') return 'Technical Head';
    if (role === 'client_service') return 'Client Service Executive';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Render header component (shared)
  const renderHeader = () => (
    <header 
      className="border-b shadow-sm sticky top-0 z-[5] text-white"
      style={{ background: 'linear-gradient(90deg, hsl(200, 85%, 22%) 0%, hsl(160, 70%, 28%) 100%)' }}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="lg:hidden text-white hover:bg-white/20">
              <Menu className="h-5 w-5" />
            </SidebarTrigger>
            <div className="bg-white rounded-lg p-1.5 shadow-lg">
              <img src={reaLogo} alt="REAHUB" className="h-10 w-auto" />
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-white/30">
                <AvatarImage src={userAvatar} alt={userName} />
                <AvatarFallback className="bg-white/20 text-white">{userName.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm text-white">Welcome, {userName}</p>
                <p className="text-xs text-white/80 font-medium">{formatRole(userRole)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );

  // Lazy dialogs - only load when open
  const renderDialogs = () => (
    <Suspense fallback={null}>
      {showMyReport && <MyReportDialog open={showMyReport} onOpenChange={setShowMyReport} />}
      {showDueReminders && <DueRemindersDialog open={showDueReminders} onOpenChange={setShowDueReminders} />}
      {showDueDateReminder && (
        <DueDateReminderDialog 
          open={showDueDateReminder} 
          onOpenChange={setShowDueDateReminder}
          userId={currentUserId}
        />
      )}
      {showDailyPending && <DailyPendingTasksDialog open={showDailyPending} onOpenChange={setShowDailyPending} />}
      {showPendingOnSignOut && (
        <PendingTasksDialog 
          open={showPendingOnSignOut} 
          onOpenChange={setShowPendingOnSignOut}
          onConfirmSignOut={handleSignOut}
        />
      )}
      {showTeamReport && <TeamMemberReportDialog open={showTeamReport} onOpenChange={setShowTeamReport} />}
      {showEstimationReport && <EstimationTeamReportDialog open={showEstimationReport} onOpenChange={setShowEstimationReport} />}
      {(showChat || showChatList) && (
        <ModernChatList open={showChat || showChatList} onOpenChange={(o) => { setShowChat(o); setShowChatList(o); }} currentUserId={currentUserId} />
      )}
      {chatRecipientId && (
        <ChatDialog
          open={!!chatRecipientId}
          onOpenChange={(open) => !open && setChatRecipientId("")}
          recipientId={chatRecipientId}
          recipientName={chatRecipientName}
        />
      )}
      {showAdminTaskReport && (userRole === "admin" || userRole === "technical_head") && (
        <AdminTaskReportDialog open={showAdminTaskReport} onOpenChange={setShowAdminTaskReport} teamMembers={teamMembers} />
      )}

      {showTaskChooser && userRole === "admin" && (
        <CreateTaskChooserDialog
          open={showTaskChooser}
          onOpenChange={setShowTaskChooser}
          onChooseOperations={() => setShowCreateOpsTask(true)}
          onChooseGeneral={() => setShowAddTask(true)}
        />
      )}

      {showCreateOpsTask && userRole === "admin" && (
        <CreateOperationsTaskDialog
          open={showCreateOpsTask}
          onOpenChange={setShowCreateOpsTask}
          onTaskCreated={() => {}}
        />
      )}

      {showAddTask && (
        <AddTaskDialog 
          open={showAddTask} 
          onOpenChange={setShowAddTask}
          onTaskAdded={() => {}}
          defaultAssignedTo={currentUserId}
        />
      )}
      {showCreateUser && <CreateUserDialog open={showCreateUser} onOpenChange={setShowCreateUser} />}
      {showManageTeam && <ManageTeamDialog open={showManageTeam} onOpenChange={setShowManageTeam} />}
      <IncomingCallNotification />
      <ProminentMessageNotification />
    </Suspense>
  );

  // Admin dashboard view
  if (userRole === 'admin' && selectedUserId === currentUserId) {
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
            onCreateTaskClick={() => setShowTaskChooser(true)}
            onSignOut={handleSignOut}
            getSelectedUserName={getSelectedUserName}
            formatRole={formatRole}
          />

          <div className="flex-1 flex flex-col">
            {renderHeader()}
            <main className="flex-1">
              <Suspense fallback={<LoadingSpinner />}>
                <AdminDashboard />
              </Suspense>
            </main>
          </div>
        </div>
        {renderDialogs()}
      </SidebarProvider>
    );
  }

  // Regular user view
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
          onCreateTaskClick={() => (userRole === "admin" ? setShowTaskChooser(true) : setShowAddTask(true))}
          onCreateUserClick={userRole === "admin" ? () => setShowCreateUser(true) : undefined}
          onManageTeamClick={userRole === "admin" ? () => setShowManageTeam(true) : undefined}
          onSignOut={handleSignOut}
          showPersonalAnalytics={showPersonalAnalytics}
          getSelectedUserName={getSelectedUserName}
          formatRole={formatRole}
        />

        <div className="flex-1 flex flex-col">
          {renderHeader()}
          <main className="container mx-auto px-4 py-6 relative">
            <Suspense fallback={<LoadingSpinner />}>
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
                <OperationsDashboard userId={selectedUserId} userRole={userRole} />
              ) : (
                <KanbanBoard 
                  userRole={userRole} 
                  viewingUserId={selectedUserId}
                  isAdmin={userRole === "admin" || userRole === "technical_head"}
                  viewingUserRole={selectedUserRole}
                />
              )}
            </Suspense>
          </main>
        </div>
        {renderDialogs()}
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
