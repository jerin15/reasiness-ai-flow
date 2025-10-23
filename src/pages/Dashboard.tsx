import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard } from "@/components/KanbanBoard";
import { MyReportDialog } from "@/components/MyReportDialog";
import { DueRemindersDialog } from "@/components/DueRemindersDialog";
import { PendingTasksDialog } from "@/components/PendingTasksDialog";
import { DailyReportDialog } from "@/components/DailyReportDialog";
import { DailyPendingTasksDialog } from "@/components/DailyPendingTasksDialog";
import { TeamMemberReportDialog } from "@/components/TeamMemberReportDialog";
import { ChatDialog } from "@/components/ChatDialog";
import { TeamChatListDialog } from "@/components/TeamChatListDialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, MessageSquare, BarChart3, Users, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import reaLogo from "@/assets/rea_logo_h.jpg";

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
  const [showPendingOnSignOut, setShowPendingOnSignOut] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showDailyPending, setShowDailyPending] = useState(false);
  const [showTeamReport, setShowTeamReport] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatRecipientId, setChatRecipientId] = useState("");
  const [chatRecipientName, setChatRecipientName] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  // Show reminders only for non-admin users
  useEffect(() => {
    if (!userRole || userRole === "admin") return;
    
    // Show due reminders on sign in
    const hasSeenReminders = sessionStorage.getItem("hasSeenReminders");
    if (!hasSeenReminders) {
      setTimeout(() => {
        setShowDueReminders(true);
        sessionStorage.setItem("hasSeenReminders", "true");
      }, 1000);
    }

    // Show daily pending tasks notification
    const lastPendingCheck = localStorage.getItem("lastPendingCheck");
    const today = new Date().toDateString();
    
    if (lastPendingCheck !== today) {
      setTimeout(() => {
        setShowDailyPending(true);
        localStorage.setItem("lastPendingCheck", today);
      }, 2000);
    }
  }, [userRole]);

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

        // If admin, fetch all team members
        if (role === "admin") {
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
    // Show pending tasks before signing out
    setShowPendingOnSignOut(true);
  };

  const confirmSignOut = async () => {
    try {
      await supabase.auth.signOut();
      sessionStorage.removeItem("hasSeenReminders");
      navigate("/auth");
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Failed to sign out");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={reaLogo} alt="REA Advertising" className="h-10 w-auto" />
              <div>
                <p className="text-sm text-muted-foreground">
                  Welcome, {userName} ({userRole})
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userRole === "admin" && (
                <>
                  <Select value={selectedUserId} onValueChange={handleUserChange}>
                    <SelectTrigger className="w-[240px]">
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
                                {user.user_roles?.[0]?.role}
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
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analytics
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTeamReport(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Team Reports
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMyReport(true)}
              >
                <FileText className="h-4 w-4 mr-2" />
                My Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDailyReport(true)}
              >
                <Download className="h-4 w-4 mr-2" />
                Daily Report
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/chat")}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                AI Assistant
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowChat(true)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Team Chat
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <KanbanBoard 
          userRole={userRole} 
          viewingUserId={selectedUserId}
          isAdmin={userRole === "admin"}
          viewingUserRole={selectedUserRole}
        />
      </main>

      <MyReportDialog open={showMyReport} onOpenChange={setShowMyReport} />
      <DueRemindersDialog open={showDueReminders} onOpenChange={setShowDueReminders} />
      <DailyReportDialog open={showDailyReport} onOpenChange={setShowDailyReport} />
      <DailyPendingTasksDialog open={showDailyPending} onOpenChange={setShowDailyPending} />
      <PendingTasksDialog 
        open={showPendingOnSignOut} 
        onOpenChange={setShowPendingOnSignOut}
        onConfirmSignOut={confirmSignOut}
      />
      <TeamMemberReportDialog
        open={showTeamReport}
        onOpenChange={setShowTeamReport}
      />
      
      <TeamChatListDialog
        open={showChat}
        onOpenChange={setShowChat}
        onSelectMember={(memberId, memberName) => {
          setChatRecipientId(memberId);
          setChatRecipientName(memberName);
        }}
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
    </div>
  );
};

export default Dashboard;
