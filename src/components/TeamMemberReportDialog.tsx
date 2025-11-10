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

interface TeamMember {
  id: string;
  full_name: string;
}

export function TeamMemberReportDialog({ open, onOpenChange }: TeamMemberReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<TaskDetail[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  
  // Primary filter - Team Member
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  
  // Secondary filters
  const [selectedPipeline, setSelectedPipeline] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<string>("all");
  const [timeSpan, setTimeSpan] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (open) {
      fetchTeamMembers();
    }
  }, [open]);

  useEffect(() => {
    if (selectedMemberId) {
      fetchMemberTasks();
    } else {
      setTasks([]);
      setFilteredTasks([]);
    }
  }, [selectedMemberId]);

  useEffect(() => {
    applyFilters();
  }, [tasks, selectedPipeline, selectedClient, timeSpan, searchTerm]);

  const fetchTeamMembers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");

      if (error) throw error;

      setTeamMembers(profiles || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
      toast.error("Failed to load team members");
    }
  };

  const fetchMemberTasks = async () => {
    if (!selectedMemberId) return;
    
    setLoading(true);
    try {
      // Fetch all tasks for the selected member (excluding done status)
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
        .eq("assigned_to", selectedMemberId)
        .neq("status", "done")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;

      const selectedMember = teamMembers.find(m => m.id === selectedMemberId);
      const enrichedTasks = (tasksData || []).map(task => ({
        ...task,
        assigned_name: selectedMember?.full_name || "Unknown"
      }));

      setTasks(enrichedTasks);
    } catch (error) {
      console.error("Error fetching member tasks:", error);
      toast.error("Failed to load member tasks");
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
    const selectedMember = teamMembers.find(m => m.id === selectedMemberId);
    
    let csv = `Team Member Report - ${selectedMember?.full_name || 'Unknown'}\n`;
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
    const selectedMember = teamMembers.find(m => m.id === selectedMemberId);
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(`Team Member Report`, 14, 20);
    
    doc.setFontSize(12);
    doc.text(`Member: ${selectedMember?.full_name || 'Unknown'}`, 14, 30);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${timestamp}`, 14, 38);
    doc.text(`Total Pending Tasks: ${filteredTasks.length}`, 14, 44);
    
    // Pipeline breakdown
    doc.setFontSize(14);
    doc.text("Tasks by Pipeline", 14, 56);
    
    const pipelineData = Object.entries(getTasksByPipeline()).map(([pipeline, count]) => [
      pipeline,
      count.toString()
    ]);

    autoTable(doc, {
      startY: 61,
      head: [["Pipeline", "Count"]],
      body: pipelineData,
      theme: "striped",
    });

    const finalY1 = (doc as any).lastAutoTable.finalY || 61;
    
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

    const memberName = selectedMember?.full_name?.replace(/\s+/g, '_') || 'unknown';
    doc.save(`${memberName}_report_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Report exported as PDF");
  };

  const pipelineGroups = getTasksByPipeline();
  const selectedMember = teamMembers.find(m => m.id === selectedMemberId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Team Member Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Primary Filter - Select Team Member */}
          <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
            <label className="text-sm font-medium mb-2 block">Select Team Member *</label>
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Choose a team member to view report" />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMemberId && (
            <>
              {/* Secondary Filters */}
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
                  {/* Member Info Banner */}
                  <div className="p-4 bg-gradient-to-r from-primary/20 to-primary/10 rounded-lg border border-primary/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedMember?.full_name}</h3>
                        <p className="text-sm text-muted-foreground">Member Task Report</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-primary">{filteredTasks.length}</div>
                        <div className="text-xs text-muted-foreground">Pending Tasks</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">{Object.keys(pipelineGroups).length}</div>
                      <div className="text-sm text-muted-foreground">Active Pipelines</div>
                    </div>
                    <div className="p-4 bg-card rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">{tasks.length}</div>
                      <div className="text-sm text-muted-foreground">Total Tasks (Before Filters)</div>
                    </div>
                  </div>

                  {/* Tasks by Pipeline */}
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-4">Tasks Distribution by Pipeline</h3>
                    <div className="space-y-2">
                      {Object.keys(pipelineGroups).length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No tasks found</p>
                      ) : (
                        Object.entries(pipelineGroups).map(([pipeline, count]) => (
                          <div key={pipeline} className="flex justify-between items-center p-3 bg-muted/50 rounded-md hover:bg-muted/70 transition-colors">
                            <span className="text-sm font-medium">{pipeline}</span>
                            <span className="font-bold text-primary text-lg">{count}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Task List */}
                  <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                    <h3 className="font-semibold mb-4">Detailed Task List ({filteredTasks.length})</h3>
                    <div className="space-y-2">
                      {filteredTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">No tasks found matching the filters</p>
                      ) : (
                        filteredTasks.map(task => (
                          <div key={task.id} className="p-3 bg-muted/30 rounded border-l-4 border-primary hover:bg-muted/50 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-medium text-sm">{task.title}</span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                task.priority === 'urgent' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100' :
                                task.priority === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                              }`}>
                                {task.priority}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>📍 {statusPipelines[task.status as keyof typeof statusPipelines] || task.status}</span>
                              {task.client_name && <span>🏢 {task.client_name}</span>}
                              <span>🏷️ {task.type}</span>
                              <span>📅 Created: {new Date(task.created_at).toLocaleDateString()}</span>
                              {task.due_date && <span>⏰ Due: {new Date(task.due_date).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {selectedMemberId && filteredTasks.length > 0 && (
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