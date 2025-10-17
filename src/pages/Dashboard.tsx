import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { LogOut, MessageSquare, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const Dashboard = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/auth");
        return;
      }

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
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">R-EAsiness</h1>
              <p className="text-sm text-muted-foreground">
                Welcome, {userName} ({userRole})
              </p>
            </div>
            <div className="flex items-center gap-2">
              {userRole === "admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/analytics")}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/chat")}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                AI Assistant
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
        <KanbanBoard userRole={userRole} />
      </main>
    </div>
  );
};

export default Dashboard;
