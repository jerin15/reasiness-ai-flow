import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Download, X } from "lucide-react";
import { toast } from "sonner";

export const WeeklyReportNotification = () => {
  const [showNotification, setShowNotification] = useState(false);
  const [latestReport, setLatestReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkForNewReports();
    
    // Check every minute for new reports
    const interval = setInterval(checkForNewReports, 60000);
    return () => clearInterval(interval);
  }, []);

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
        
        if (!lastChecked || reportTime > parseInt(lastChecked)) {
          setLatestReport(files[0]);
          setShowNotification(true);
        }
      }
    } catch (error) {
      console.error('Error checking for reports:', error);
    }
  };

  const handleDownloadAndClear = async () => {
    if (!latestReport) return;
    
    setLoading(true);
    try {
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

      // Clear done tasks
      await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('status', 'done')
        .is('deleted_at', null);

      // Update last checked time
      localStorage.setItem('lastReportCheck', Date.now().toString());
      
      setShowNotification(false);
      toast.success("Report downloaded and done tasks cleared!");
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
      <Card className="p-4 w-96 shadow-lg border-primary">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Weekly Report Available</h3>
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
        
        <p className="text-sm text-muted-foreground mb-4">
          A new report of completed tasks is ready. Download it and clear the done pipeline?
        </p>
        
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadAndClear}
            disabled={loading}
            className="flex-1"
          >
            <Download className="h-4 w-4 mr-2" />
            {loading ? "Processing..." : "Download & Clear"}
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={loading}
          >
            Later
          </Button>
        </div>
      </Card>
    </div>
  );
};
