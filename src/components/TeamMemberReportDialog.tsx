import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TeamMemberReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TeamMember {
  id: string;
  full_name: string;
}

interface TaskStats {
  todo: number;
  inProgress: number;
  clientApproval: number;
  costApproval: number;
  done: number;
  total: number;
  completionRate: number;
  pendingTasks: number;
}

interface TaskDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  client_name: string | null;
}

export function TeamMemberReportDialog({ open, onOpenChange }: TeamMemberReportDialogProps) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetail[]>([]);

  useEffect(() => {
    if (open) {
      fetchTeamMembers();
    }
  }, [open]);

  useEffect(() => {
    if (selectedMember) {
      fetchMemberStats();
    }
  }, [selectedMember]);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
      toast.error("Failed to load team members");
    }
  };

  const fetchMemberStats = async () => {
    if (!selectedMember) return;
    
    setLoading(true);
    try {
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("*")
        .or(`created_by.eq.${selectedMember},assigned_to.eq.${selectedMember}`)
        .is("deleted_at", null);

      if (error) throw error;

      const taskList = tasks || [];
      const todo = taskList.filter(t => t.status === "todo").length;
      const inProgress = taskList.filter(t => t.status === "production" || t.status === "production_pending").length;
      const clientApproval = taskList.filter(t => t.status === "client_approval" || t.status === "with_client" || t.status === "approval").length;
      const costApproval = taskList.filter(t => t.status === "admin_approval" || t.status === "supplier_quotes" || t.status === "quotation_bill").length;
      const done = taskList.filter(t => t.status === "done").length;
      const total = taskList.length;
      const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
      const pendingTasks = total - done;

      setStats({
        todo,
        inProgress,
        clientApproval,
        costApproval,
        done,
        total,
        completionRate,
        pendingTasks,
      });

      setTaskDetails(taskList.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        created_at: task.created_at,
        client_name: task.client_name,
      })));
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!stats || !selectedMember) return;

    const memberName = teamMembers.find(m => m.id === selectedMember)?.full_name || "Unknown";
    const timestamp = new Date().toLocaleString();
    
    let csv = `Team Member Daily Report\n`;
    csv += `Generated: ${timestamp}\n`;
    csv += `Team Member: ${memberName}\n\n`;
    
    csv += `Summary Statistics\n`;
    csv += `Total Tasks,${stats.total}\n`;
    csv += `Completed Tasks,${stats.done}\n`;
    csv += `Pending Tasks,${stats.pendingTasks}\n`;
    csv += `Completion Rate,${stats.completionRate}%\n`;
    csv += `To Do,${stats.todo}\n`;
    csv += `In Progress,${stats.inProgress}\n`;
    csv += `Client Approval,${stats.clientApproval}\n`;
    csv += `Cost Approval,${stats.costApproval}\n\n`;
    
    csv += `\nDetailed Task List\n`;
    csv += `Title,Status,Priority,Client Name,Due Date,Created At\n`;
    
    taskDetails.forEach(task => {
      csv += `"${task.title}","${task.status}","${task.priority}","${task.client_name || 'N/A'}","${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}","${new Date(task.created_at).toLocaleDateString()}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${memberName}_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("Report exported as CSV");
  };

  const exportToPDF = () => {
    if (!stats || !selectedMember) return;

    const memberName = teamMembers.find(m => m.id === selectedMember)?.full_name || "Unknown";
    const timestamp = new Date().toLocaleString();
    
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Team Member Daily Report", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${timestamp}`, 14, 30);
    doc.text(`Team Member: ${memberName}`, 14, 36);
    
    doc.setFontSize(14);
    doc.text("Summary Statistics", 14, 50);
    
    const summaryData = [
      ["Total Tasks", stats.total.toString()],
      ["Completed Tasks", stats.done.toString()],
      ["Pending Tasks", stats.pendingTasks.toString()],
      ["Completion Rate", `${stats.completionRate}%`],
      ["To Do", stats.todo.toString()],
      ["In Progress", stats.inProgress.toString()],
      ["Client Approval", stats.clientApproval.toString()],
      ["Cost Approval", stats.costApproval.toString()],
    ];

    autoTable(doc, {
      startY: 55,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: "striped",
    });

    const finalY = (doc as any).lastAutoTable.finalY || 55;
    
    doc.setFontSize(14);
    doc.text("Detailed Task List", 14, finalY + 15);

    const taskData = taskDetails.map(task => [
      task.title,
      task.status,
      task.priority,
      task.client_name || "N/A",
      task.due_date ? new Date(task.due_date).toLocaleDateString() : "N/A",
    ]);

    autoTable(doc, {
      startY: finalY + 20,
      head: [["Title", "Status", "Priority", "Client", "Due Date"]],
      body: taskData,
      theme: "striped",
      styles: { fontSize: 8 },
    });

    doc.save(`${memberName}_report_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Report exported as PDF");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Team Member Daily Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">Select Team Member</label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a team member" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Tasks</div>
                </div>
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">{stats.done}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-2xl font-bold text-orange-600">{stats.pendingTasks}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-2xl font-bold text-blue-600">{stats.completionRate}%</div>
                  <div className="text-sm text-muted-foreground">Completion Rate</div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-4">Task Breakdown by Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">To Do</span>
                    <span className="font-semibold">{stats.todo}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">In Progress</span>
                    <span className="font-semibold">{stats.inProgress}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Client Approval</span>
                    <span className="font-semibold">{stats.clientApproval}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Cost Approval</span>
                    <span className="font-semibold">{stats.costApproval}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Done</span>
                    <span className="font-semibold">{stats.done}</span>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-4">Efficiency Insights</h3>
                <div className="space-y-3 text-sm">
                  <p>
                    📊 <strong>Performance:</strong> {stats.completionRate >= 70 ? "Excellent" : stats.completionRate >= 50 ? "Good" : "Needs Improvement"}
                  </p>
                  <p>
                    ⏳ <strong>Pending Tasks:</strong> {stats.pendingTasks} tasks awaiting completion
                  </p>
                  <p>
                    ✅ <strong>Approval Status:</strong> {stats.clientApproval + stats.costApproval} tasks in approval stages
                  </p>
                  <p>
                    🎯 <strong>Active Work:</strong> {stats.inProgress} tasks currently in progress
                  </p>
                </div>
              </div>
            </div>
          )}

          {!loading && !stats && selectedMember && (
            <div className="text-center py-8 text-muted-foreground">
              No data available for this team member
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {stats && (
            <>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={exportToPDF}>
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
