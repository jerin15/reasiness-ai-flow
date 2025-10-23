import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ReportFile = {
  name: string;
  created_at: string;
  updated_at: string;
  metadata?: {
    size?: number;
  };
};

type ReportsDownloadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ReportsDownloadDialog = ({ open, onOpenChange }: ReportsDownloadDialogProps) => {
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      fetchReports();
    }
  }, [open]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('task-reports')
        .list('reports', {
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;
      setReports(data || []);
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const generateNewReport = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-reports');
      
      if (error) throw error;
      
      toast.success('Reports generated successfully');
      await fetchReports();
    } catch (error: any) {
      console.error('Error generating reports:', error);
      toast.error('Failed to generate reports');
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = async (fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('task-reports')
        .download(`reports/${fileName}`);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Report downloaded successfully');
    } catch (error: any) {
      console.error('Error downloading report:', error);
      toast.error('Failed to download report');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileType = (fileName: string) => {
    if (fileName.endsWith('.csv')) return 'CSV';
    if (fileName.endsWith('.txt')) return 'TXT';
    return 'File';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Completed Tasks Reports
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchReports}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                onClick={generateNewReport}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Generate New'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <p className="text-muted-foreground">Loading reports...</p>
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <p className="text-muted-foreground">No reports available</p>
              <Button onClick={generateNewReport} disabled={generating}>
                {generating ? 'Generating...' : 'Generate First Report'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <div
                  key={report.name}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{report.name}</p>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      <span>{getFileType(report.name)}</span>
                      {report.metadata?.size && (
                        <span>{formatFileSize(report.metadata.size)}</span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadReport(report.name)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};