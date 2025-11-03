import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Download, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const WeeklyReportNotification = () => {
  const [showNotification, setShowNotification] = useState(false);
  const [latestReport, setLatestReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>("");
  const [hasDoneTasks, setHasDoneTasks] = useState(false);
  const [doneTaskCount, setDoneTaskCount] = useState(0);

  useEffect(() => {
    checkUserRoleAndTasks();
    checkForNewReports();
    
    // Check every minute for new reports
    const interval = setInterval(checkForNewReports, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkUserRoleAndTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setUserRole(roleData?.role || "");

      // Check if user has done tasks
      const { data: tasks, count } = await supabase
        .from("tasks")
        .select("*", { count: 'exact' })
        .eq("status", "done")
        .is("deleted_at", null)
        .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);

      setHasDoneTasks((count || 0) > 0);
      setDoneTaskCount(count || 0);
    } catch (error) {
      console.error('Error checking user role and tasks:', error);
    }
  };

  const checkForNewReports = async () => {
    try {
      const { data: files } = await supabase.storage
        .from('task-reports')
        .list('reports', {
          limit: 1,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (files && files.length > 0) {
        const lastChecked = localStorage.getItem('lastReportCheck');
        const reportTime = new Date(files[0].created_at).getTime();
        
        // Only show to admins or users with done tasks
        if (!lastChecked || reportTime > parseInt(lastChecked)) {
          const shouldShow = await checkIfShouldShow();
          if (shouldShow) {
            setLatestReport(files[0]);
            setShowNotification(true);
          }
        }
      }
    } catch (error) {
      console.error('Error checking for reports:', error);
    }
  };

  const checkIfShouldShow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAdmin = roleData?.role === 'admin' || (roleData?.role as string) === 'technical_head';
    
    // Show to admin/technical_head OR users with done tasks
    return isAdmin || hasDoneTasks;
  };

  const handleDownloadAndClear = async () => {
    if (!latestReport) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Download the HTML report
      const { data, error } = await supabase.storage
        .from('task-reports')
        .download(`reports/${latestReport.name}`);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = latestReport.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Only clear the user's own done tasks, not all done tasks
      if (userRole === 'admin' || userRole === 'technical_head') {
        // Admin and technical_head can clear all done tasks
        await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('status', 'done')
          .is('deleted_at', null);
        
        toast.success(`Report downloaded! All ${doneTaskCount} done tasks cleared.`);
      } else {
        // Regular users only clear their own done tasks
        await supabase
          .from('tasks')
          .update({ deleted_at: new Date().toISOString() })
          .eq('status', 'done')
          .is('deleted_at', null)
          .or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
        
        toast.success(`Report downloaded! Your ${doneTaskCount} done tasks cleared.`);
      }

      // Update last checked time
      localStorage.setItem('lastReportCheck', Date.now().toString());
      
      setShowNotification(false);
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || "Failed to process report");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    if (latestReport) {
      localStorage.setItem('lastReportCheck', Date.now().toString());
    }
    setShowNotification(false);
  };

  if (!showNotification) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <Card className="p-4 w-96 shadow-lg border-destructive bg-card">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Weekly Report - Action Required</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A weekly report of completed tasks is ready for download.
          </p>
          
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <p className="text-sm font-medium text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                {(userRole === 'admin' || userRole === 'technical_head')
                  ? `This will permanently delete all ${doneTaskCount} tasks from the Done pipeline after downloading the report.`
                  : `This will permanently delete your ${doneTaskCount} tasks from the Done pipeline after downloading the report.`
                }
              </span>
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            {(userRole === 'admin' || userRole === 'technical_head')
              ? "As an admin/technical head, both you and affected team members must approve before tasks are cleared."
              : "You must download and approve to clear your completed tasks."
            }
          </p>
        </div>
        
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleDownloadAndClear}
            disabled={loading}
            variant="destructive"
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            {loading ? "Processing..." : "I Approve - Download & Clear"}
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
};
