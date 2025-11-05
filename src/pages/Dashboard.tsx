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
import { AdminCommunicationPanel } from "@/components/AdminCommunicationPanel";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu, MessageSquare } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AddTaskDialog } from "@/components/AddTaskDialog";

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
  const [hideSidebarOnScroll, setHideSidebarOnScroll] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const unreadCount = useUnreadMessageCount(currentUserId);

  useEffect(() => {
    checkAuth();
  }, []);

  // Detect horizontal scroll and hide/show sidebar
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.scrollLeft > 50) {
        setHideSidebarOnScroll(true);
      } else {
        setHideSidebarOnScroll(false);
      }
    };

    // Add scroll listener to main content areas
    const mainElements = document.querySelectorAll('main, .overflow-x-auto');
    mainElements.forEach(el => {
      el.addEventListener('scroll', handleScroll);
    });

    return () => {
      mainElements.forEach(el => {
        el.removeEventListener('scroll', handleScroll);
      });
    };
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
        setUserAvatar(profile.avatar_url || "");
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
        .select("id, full_name, email, avatar_url, user_roles(*)")
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
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <div className={`transition-all duration-300 ease-in-out ${hideSidebarOnScroll ? '-translate-x-full opacity-0 w-0' : 'translate-x-0 opacity-100'}`}>
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
          </div>

          <div className="flex-1 flex flex-col">
            <header className="border-b bg-card shadow-sm sticky top-0 z-10">
              <div className="container mx-auto px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <SidebarTrigger className="lg:hidden">
                      <Menu className="h-5 w-5" />
                    </SidebarTrigger>
                    <img src={reaLogo} alt="REA Advertising" className="h-12 w-auto" />
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
                  <button
                    onClick={() => setShowChatList(true)}
                    className="relative bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
                  >
                    <MessageSquare className="h-5 w-5" />
                    <span>Team Chat</span>
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-6 min-w-6 flex items-center justify-center p-1 text-xs font-bold animate-pulse"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </button>
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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <div className={`transition-all duration-300 ease-in-out ${hideSidebarOnScroll ? '-translate-x-full opacity-0 w-0' : 'translate-x-0 opacity-100'}`}>
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
          onSignOut={handleSignOut}
          showPersonalAnalytics={showPersonalAnalytics}
          getSelectedUserName={getSelectedUserName}
          formatRole={formatRole}
        />
        </div>

        <div className="flex-1 flex flex-col">
          <header className="border-b bg-card shadow-sm sticky top-0 z-10">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </SidebarTrigger>
                  <img src={reaLogo} alt="REA Advertising" className="h-12 w-auto" />
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
                <div className="flex items-center gap-3">
                  {(userRole === "admin" || userRole === "technical_head") && (
                    <AdminCommunicationPanel />
                  )}
                  <button
                    onClick={() => setShowChat(true)}
                    className="relative bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2.5 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
                  >
                    <MessageSquare className="h-5 w-5" />
                    <span>Team Chat</span>
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-6 min-w-6 flex items-center justify-center p-1 text-xs font-bold animate-pulse"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <main className="container mx-auto px-4 py-6 relative">
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
      
      <IncomingCallNotification />
      <ProminentMessageNotification />
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
