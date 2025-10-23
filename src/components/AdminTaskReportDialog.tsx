import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";

type AdminTaskReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: Array<{
    id: string;
    full_name: string | null;
    email: string;
  }>;
};

export const AdminTaskReportDialog = ({ open, onOpenChange, teamMembers }: AdminTaskReportDialogProps) => {
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!selectedMemberId) {
      toast.error("Please select a team member");
      return;
    }

    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch all tasks for the selected member
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select(`
          *,
          created_by_profile:profiles!tasks_created_by_fkey(full_name, email),
          assigned_to_profile:profiles!tasks_assigned_to_fkey(full_name, email)
        `)
        .or(`assigned_to.eq.${selectedMemberId},created_by.eq.${selectedMemberId}`)
        .is("deleted_at", null)
        .order("status", { ascending: true })
        .order("due_date", { ascending: true });

      if (error) throw error;

      if (!tasks || tasks.length === 0) {
        toast.info("No tasks found for this team member");
        return;
      }

      // Categorize tasks
      const pendingTasks = tasks.filter(t => t.status !== "done");
      const dueTasks = tasks.filter(t => 
        t.due_date && 
        new Date(t.due_date) <= today && 
        t.status !== "done"
      );
      const completedTasks = tasks.filter(t => t.status === "done");

      // Generate CSV content
      const csvContent = generateCSV(pendingTasks, dueTasks, completedTasks);
      
      // Download the file
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      const memberName = teamMembers.find(m => m.id === selectedMemberId)?.full_name || "member";
      const fileName = `task_report_${memberName}_${format(new Date(), "yyyy-MM-dd")}.csv`;
      
      link.setAttribute("href", url);
      link.setAttribute("download", fileName);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Report downloaded successfully");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const generateCSV = (pending: any[], due: any[], completed: any[]) => {
    const headers = [
      "Category",
      "Title",
      "Description",
      "Status",
      "Priority",
      "Type",
      "Due Date",
      "Created By",
      "Assigned To",
      "Created At",
      "Last Modified"
    ];

    const rows: string[][] = [];

    // Add pending tasks
    pending.forEach(task => {
      rows.push([
        "Pending",
        task.title,
        task.description || "",
        task.status,
        task.priority,
        task.type || "",
        task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "",
        task.created_by_profile?.full_name || task.created_by_profile?.email || "",
        task.assigned_to_profile?.full_name || task.assigned_to_profile?.email || "Unassigned",
        format(new Date(task.created_at), "yyyy-MM-dd HH:mm"),
        format(new Date(task.updated_at), "yyyy-MM-dd HH:mm")
      ]);
    });

    // Add due tasks
    due.forEach(task => {
      rows.push([
        "Due/Overdue",
        task.title,
        task.description || "",
        task.status,
        task.priority,
        task.type || "",
        task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "",
        task.created_by_profile?.full_name || task.created_by_profile?.email || "",
        task.assigned_to_profile?.full_name || task.assigned_to_profile?.email || "Unassigned",
        format(new Date(task.created_at), "yyyy-MM-dd HH:mm"),
        format(new Date(task.updated_at), "yyyy-MM-dd HH:mm")
      ]);
    });

    // Add completed tasks
    completed.forEach(task => {
      rows.push([
        "Completed",
        task.title,
        task.description || "",
        task.status,
        task.priority,
        task.type || "",
        task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "",
        task.created_by_profile?.full_name || task.created_by_profile?.email || "",
        task.assigned_to_profile?.full_name || task.assigned_to_profile?.email || "Unassigned",
        format(new Date(task.created_at), "yyyy-MM-dd HH:mm"),
        format(new Date(task.updated_at), "yyyy-MM-dd HH:mm")
      ]);
    });

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    // Build CSV string
    let csv = headers.map(escapeCSV).join(",") + "\n";
    rows.forEach(row => {
      csv += row.map(escapeCSV).join(",") + "\n";
    });

    return csv;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Download Team Member Report
          </DialogTitle>
          <DialogDescription>
            Generate a comprehensive task report for any team member including pending, due, and completed tasks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Team Member</label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
            <p className="font-medium">Report will include:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>All pending tasks</li>
              <li>All due and overdue tasks</li>
              <li>All completed tasks</li>
              <li>Task details, priorities, and timestamps</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={generateReport}
              disabled={!selectedMemberId || loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};