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
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Filter } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TeamMemberReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TaskDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  client_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  type: string;
}

const statusPipelines = {
  todo: "Initial",
  production: "Production",
  production_pending: "Production",
  client_approval: "Client Review",
  with_client: "Client Review",
  approval: "Approval",
  admin_approval: "Cost Approval",
  supplier_quotes: "Cost Approval",
  quotation_bill: "Cost Approval",
};

export function TeamMemberReportDialog({ open, onOpenChange }: TeamMemberReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TaskDetail[]>([]);
  
  // Filters
  const [selectedPipeline, setSelectedPipeline] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [timeSpan, setTimeSpan] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (open) {
      fetchAllPendingTasks();
    }
  }, [open]);

  useEffect(() => {
    applyFilters();
  }, [tasks, selectedPipeline, selectedClient, timeSpan, searchTerm]);

  const fetchAllPendingTasks = async () => {
    setLoading(true);
    try {
      // Fetch all tasks that are not done
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          status,
          priority,
          due_date,
          created_at,
          client_name,
          assigned_to,
          type
        `)
        .neq("status", "done")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch all profiles to get assigned names
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name");

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]) || []);

      const enrichedTasks = (tasksData || []).map(task => ({
        ...task,
        assigned_name: task.assigned_to ? profileMap.get(task.assigned_to) || "Unassigned" : "Unassigned"
      }));

      setTasks(enrichedTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...tasks];

    // Pipeline filter
    if (selectedPipeline !== "all") {
      filtered = filtered.filter(task => {
        const pipeline = statusPipelines[task.status as keyof typeof statusPipelines];
        return pipeline === selectedPipeline;
      });
    }

    // Client filter
    if (selectedClient !== "all") {
      filtered = filtered.filter(task => task.client_name === selectedClient);
    }

    // Time span filter
    if (timeSpan !== "all") {
      const now = new Date();
      const startDate = new Date();
      
      if (timeSpan === "weekly") {
        startDate.setDate(now.getDate() - 7);
      } else if (timeSpan === "monthly") {
        startDate.setMonth(now.getMonth() - 1);
      }

      filtered = filtered.filter(task => new Date(task.created_at) >= startDate);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.assigned_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredTasks(filtered);
  };

  const uniqueClients = Array.from(new Set(tasks.map(t => t.client_name).filter(Boolean)));
  const uniquePipelines = Array.from(new Set(Object.values(statusPipelines)));

  const getTasksByPipeline = () => {
    const pipelineGroups: { [key: string]: number } = {};
    filteredTasks.forEach(task => {
      const pipeline = statusPipelines[task.status as keyof typeof statusPipelines] || "Other";
      pipelineGroups[pipeline] = (pipelineGroups[pipeline] || 0) + 1;
    });
    return pipelineGroups;
  };

  const getTasksByMember = () => {
    const memberGroups: { [key: string]: number } = {};
    filteredTasks.forEach(task => {
      const member = task.assigned_name || "Unassigned";
      memberGroups[member] = (memberGroups[member] || 0) + 1;
    });
    return memberGroups;
  };

  const exportToCSV = () => {
    const timestamp = new Date().toLocaleString();
    
    let csv = `Team Pending Tasks Report\n`;
    csv += `Generated: ${timestamp}\n`;
    csv += `Total Pending Tasks: ${filteredTasks.length}\n\n`;
    
    csv += `Task Details\n`;
    csv += `Title,Assigned To,Pipeline,Status,Priority,Client Name,Type,Due Date,Created At\n`;
    
    filteredTasks.forEach(task => {
      const pipeline = statusPipelines[task.status as keyof typeof statusPipelines] || "Other";
      csv += `"${task.title}","${task.assigned_name}","${pipeline}","${task.status}","${task.priority}","${task.client_name || 'N/A'}","${task.type}","${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}","${new Date(task.created_at).toLocaleDateString()}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team_pending_tasks_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("Report exported as CSV");
  };

  const exportToPDF = () => {
    const timestamp = new Date().toLocaleString();
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Team Pending Tasks Report", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${timestamp}`, 14, 30);
    doc.text(`Total Pending Tasks: ${filteredTasks.length}`, 14, 36);
    
    // Pipeline breakdown
    doc.setFontSize(14);
    doc.text("Tasks by Pipeline", 14, 50);
    
    const pipelineData = Object.entries(getTasksByPipeline()).map(([pipeline, count]) => [
      pipeline,
      count.toString()
    ]);

    autoTable(doc, {
      startY: 55,
      head: [["Pipeline", "Count"]],
      body: pipelineData,
      theme: "striped",
    });

    const finalY1 = (doc as any).lastAutoTable.finalY || 55;
    
    // Member breakdown
    doc.setFontSize(14);
    doc.text("Tasks by Team Member", 14, finalY1 + 15);

    const memberData = Object.entries(getTasksByMember()).map(([member, count]) => [
      member,
      count.toString()
    ]);

    autoTable(doc, {
      startY: finalY1 + 20,
      head: [["Team Member", "Pending Tasks"]],
      body: memberData,
      theme: "striped",
    });

    const finalY2 = (doc as any).lastAutoTable.finalY || 55;
    
    // Task details
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Task Details", 14, 20);

    const taskData = filteredTasks.slice(0, 50).map(task => [
      task.title.substring(0, 30),
      task.assigned_name || "N/A",
      statusPipelines[task.status as keyof typeof statusPipelines] || "Other",
      task.priority,
      task.client_name?.substring(0, 20) || "N/A",
    ]);

    autoTable(doc, {
      startY: 25,
      head: [["Title", "Assigned", "Pipeline", "Priority", "Client"]],
      body: taskData,
      theme: "striped",
      styles: { fontSize: 7 },
    });

    doc.save(`team_pending_tasks_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Report exported as PDF");
  };

  const pipelineGroups = getTasksByPipeline();
  const memberGroups = getTasksByMember();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Team Pending Tasks Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <label className="text-sm font-medium mb-2 block">Pipeline</label>
              <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
                <SelectTrigger>
                  <SelectValue placeholder="All Pipelines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pipelines</SelectItem>
                  {uniquePipelines.map(pipeline => (
                    <SelectItem key={pipeline} value={pipeline}>{pipeline}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Client</label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {uniqueClients.map(client => (
                    <SelectItem key={client} value={client || ""}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Time Span</label>
              <Select value={timeSpan} onValueChange={setTimeSpan}>
                <SelectTrigger>
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="weekly">Last 7 Days</SelectItem>
                  <SelectItem value="monthly">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input 
                placeholder="Search tasks or members..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}

          {!loading && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-3xl font-bold text-orange-600">{filteredTasks.length}</div>
                  <div className="text-sm text-muted-foreground">Total Pending Tasks</div>
                </div>
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-3xl font-bold text-blue-600">{Object.keys(pipelineGroups).length}</div>
                  <div className="text-sm text-muted-foreground">Active Pipelines</div>
                </div>
                <div className="p-4 bg-card rounded-lg border">
                  <div className="text-3xl font-bold text-purple-600">{Object.keys(memberGroups).length}</div>
                  <div className="text-sm text-muted-foreground">Team Members</div>
                </div>
              </div>

              {/* Tasks by Pipeline */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-4">Tasks by Pipeline</h3>
                <div className="space-y-2">
                  {Object.entries(pipelineGroups).map(([pipeline, count]) => (
                    <div key={pipeline} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="text-sm font-medium">{pipeline}</span>
                      <span className="font-bold text-primary">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks by Team Member */}
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-4">Tasks by Team Member</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.entries(memberGroups).map(([member, count]) => (
                    <div key={member} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="text-sm">{member}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Task List */}
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <h3 className="font-semibold mb-4">Task Details ({filteredTasks.length})</h3>
                <div className="space-y-2">
                  {filteredTasks.map(task => (
                    <div key={task.id} className="p-3 bg-muted/30 rounded border-l-4 border-primary">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm">{task.title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          task.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                          task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>👤 {task.assigned_name}</span>
                        <span>📍 {statusPipelines[task.status as keyof typeof statusPipelines] || task.status}</span>
                        {task.client_name && <span>🏢 {task.client_name}</span>}
                        <span>📅 {new Date(task.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {filteredTasks.length > 0 && (
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