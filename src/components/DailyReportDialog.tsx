import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type DailyReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type TaskReport = {
  id: string;
  title: string;
  date: string;
  time: string;
  client: string;
  description: string;
  timeOut: string;
  quotedDate: string;
  quoteNo: string;
  status: string;
};

export const DailyReportDialog = ({ open, onOpenChange }: DailyReportDialogProps) => {
  const [tasks, setTasks] = useState<TaskReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch ALL tasks assigned to user that are not deleted
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Map tasks to report format
      // A task is "completed" if:
      // 1. status is "done" OR
      // 2. my_status is "done_from_my_side"
      // Otherwise it's "pending"
      const reportTasks: TaskReport[] = (data || []).map((task) => {
        const isCompleted = task.status === "done" || task.my_status === "done_from_my_side";
        const displayStatus = isCompleted 
          ? (task.status === "done" ? "Completed" : "Done from my side")
          : task.my_status === "pending" ? "Pending" : task.status;

        return {
          id: task.id,
          title: task.title,
          date: task.completed_at 
            ? format(new Date(task.completed_at), "yyyy-MM-dd")
            : format(new Date(task.created_at), "yyyy-MM-dd"),
          time: task.completed_at
            ? format(new Date(task.completed_at), "HH:mm")
            : format(new Date(task.created_at), "HH:mm"),
          client: task.client_name || "",
          description: task.description || "",
          timeOut: "",
          quotedDate: task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd") : "",
          quoteNo: "",
          status: displayStatus,
        };
      });

      setTasks(reportTasks);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to fetch tasks");
    } finally {
      setLoading(false);
    }
  };

  const updateTask = (index: number, field: keyof TaskReport, value: string) => {
    const updatedTasks = [...tasks];
    updatedTasks[index] = { ...updatedTasks[index], [field]: value };
    setTasks(updatedTasks);
  };

  const exportToCSV = () => {
    const headers = ["Date", "Time", "Client", "Description", "Time Out", "Quoted Date", "Quote No", "Status"];
    const rows = tasks.map((task) => [
      task.date,
      task.time,
      task.client,
      task.description,
      task.timeOut,
      task.quotedDate,
      task.quoteNo,
      task.status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success("Report exported to CSV");
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Daily Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Date: ${format(new Date(), "yyyy-MM-dd")}`, 14, 22);

    const tableData = tasks.map((task) => [
      task.date,
      task.time,
      task.client,
      task.description,
      task.timeOut,
      task.quotedDate,
      task.quoteNo,
      task.status,
    ]);

    autoTable(doc, {
      head: [["Date", "Time", "Client", "Description", "Time Out", "Quoted Date", "Quote No", "Status"]],
      body: tableData,
      startY: 25,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 66, 66] },
    });

    doc.save(`daily-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Report exported to PDF");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Daily Report
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No tasks found for today</p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Time</th>
                    <th className="text-left p-2">Client</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Time Out</th>
                    <th className="text-left p-2">Quoted Date</th>
                    <th className="text-left p-2">Quote No</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task, index) => (
                    <tr key={task.id} className="border-b">
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            type="date"
                            value={task.date}
                            onChange={(e) => updateTask(index, "date", e.target.value)}
                            className="w-32"
                          />
                        ) : (
                          task.date
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            type="time"
                            value={task.time}
                            onChange={(e) => updateTask(index, "time", e.target.value)}
                            className="w-24"
                          />
                        ) : (
                          task.time
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            value={task.client}
                            onChange={(e) => updateTask(index, "client", e.target.value)}
                            placeholder="Client name"
                          />
                        ) : (
                          task.client || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            value={task.description}
                            onChange={(e) => updateTask(index, "description", e.target.value)}
                            placeholder="Description"
                          />
                        ) : (
                          task.description || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            type="time"
                            value={task.timeOut}
                            onChange={(e) => updateTask(index, "timeOut", e.target.value)}
                            className="w-24"
                          />
                        ) : (
                          task.timeOut || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            type="date"
                            value={task.quotedDate}
                            onChange={(e) => updateTask(index, "quotedDate", e.target.value)}
                            className="w-32"
                          />
                        ) : (
                          task.quotedDate || "-"
                        )}
                      </td>
                      <td className="p-2">
                        {editingIndex === index ? (
                          <Input
                            value={task.quoteNo}
                            onChange={(e) => updateTask(index, "quoteNo", e.target.value)}
                            placeholder="Quote number"
                          />
                        ) : (
                          task.quoteNo || "-"
                        )}
                      </td>
                      <td className="p-2 capitalize">{task.status}</td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                        >
                          {editingIndex === index ? "Done" : "Edit"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={exportToCSV} disabled={tasks.length === 0}>
            Export CSV
          </Button>
          <Button onClick={exportToPDF} disabled={tasks.length === 0}>
            Export PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
