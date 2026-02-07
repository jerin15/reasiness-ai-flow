import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface TaskForReport {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string | null;
  client_name: string | null;
  supplier_name: string | null;
  suppliers: string[] | null;
  due_date: string | null;
  created_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
  status_changed_at: string | null;
  category: string | null;
  delivery_address: string | null;
  delivery_instructions: string | null;
  admin_remarks: string | null;
  revision_notes: string | null;
  task_type: string | null;
  source_app: string | null;
  creator?: { full_name: string | null; email: string | null } | null;
  assignee?: { full_name: string | null; email: string | null } | null;
}

interface TaskActivity {
  task_id: string;
  action: string;
  created_at: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_by_profile?: { full_name: string | null } | null;
}

function friendlyStatus(status: string | null): string {
  if (!status) return "N/A";
  const map: Record<string, string> = {
    todo: "To Do",
    supplier_quotes: "Supplier Quotes",
    admin_approval: "Admin Cost Approval",
    quotation_bill: "Quotation Bill",
    production: "Production",
    final_invoice: "Pending Invoice",
    mockup_pending: "Mockup Pending",
    production_pending: "Production Pending",
    with_client: "With Client",
    approval: "Approval",
    delivery: "Delivery",
    done: "Completed",
    client_approval: "Client Approval",
    admin_cost_approval: "Admin Cost Approval",
    approved: "Approved",
    rejected: "Rejected",
    developing: "Developing",
    testing: "Testing",
    under_review: "Under Review",
    deployed: "Deployed",
    trial_and_error: "Trial & Error",
    mockup: "Mockup",
    production_file: "Production File",
    new_calls: "New Calls",
    follow_up: "Follow Up",
    quotation: "Quotation",
  };
  return map[status] || status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function friendlyPriority(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function friendlyType(type: string | null): string {
  if (!type) return "General";
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  try {
    return format(new Date(dateStr), "dd MMM yyyy, hh:mm a");
  } catch {
    return "N/A";
  }
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return "N/A";
  }
}

export async function generateWeeklyPdfReport(): Promise<Blob> {
  // 1. Fetch all done tasks (not soft-deleted)
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select(`
      id, title, description, status, priority, type, client_name, supplier_name,
      suppliers, due_date, created_at, completed_at, updated_at, status_changed_at,
      category, delivery_address, delivery_instructions, admin_remarks, revision_notes,
      task_type, source_app,
      creator:profiles!tasks_created_by_fkey(full_name, email),
      assignee:profiles!tasks_assigned_to_fkey(full_name, email)
    `)
    .eq("status", "done")
    .is("deleted_at", null)
    .order("completed_at", { ascending: false });

  if (tasksError) throw tasksError;

  const doneTasks: TaskForReport[] = (tasks || []) as unknown as TaskForReport[];

  // 2. Fetch task history for these tasks
  const taskIds = doneTasks.map(t => t.id);
  let allHistory: TaskActivity[] = [];

  if (taskIds.length > 0) {
    // Fetch in batches of 50 to avoid query limits
    for (let i = 0; i < taskIds.length; i += 50) {
      const batch = taskIds.slice(i, i + 50);
      const { data: historyData } = await supabase
        .from("task_history")
        .select(`
          task_id, action, created_at, old_status, new_status,
          changed_by_profile:profiles!task_history_changed_by_fkey(full_name)
        `)
        .in("task_id", batch)
        .order("created_at", { ascending: true });

      if (historyData) {
        allHistory.push(...(historyData as unknown as TaskActivity[]));
      }
    }
  }

  // Group history by task
  const historyByTask: Record<string, TaskActivity[]> = {};
  allHistory.forEach(h => {
    if (!historyByTask[h.task_id]) historyByTask[h.task_id] = [];
    historyByTask[h.task_id].push(h);
  });

  // 3. Build the PDF
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (requiredSpace: number) => {
    if (y + requiredSpace > doc.internal.pageSize.getHeight() - 15) {
      doc.addPage();
      y = margin;
    }
  };

  // --- HEADER ---
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("Weekly Completed Tasks Report", margin, y + 6);
  y += 14;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Report Generated: ${format(new Date(), "dd MMMM yyyy, hh:mm a")}`, margin, y);
  y += 5;
  doc.text(`Total Completed Tasks: ${doneTasks.length}`, margin, y);
  y += 8;

  // --- SUMMARY TABLE ---
  doc.setDrawColor(76, 175, 80);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("Summary", margin, y);
  y += 7;

  // By team member
  const byUser: Record<string, number> = {};
  doneTasks.forEach(t => {
    const name = t.assignee?.full_name || t.assignee?.email || "Unassigned";
    byUser[name] = (byUser[name] || 0) + 1;
  });

  const userSummaryRows = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => [name, String(count)]);

  if (userSummaryRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Team Member", "Tasks Completed"]],
      body: userSummaryRows,
      theme: "grid",
      headStyles: { fillColor: [76, 175, 80], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth * 0.6,
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // By priority
  const byPriority: Record<string, number> = {};
  doneTasks.forEach(t => {
    byPriority[friendlyPriority(t.priority)] = (byPriority[friendlyPriority(t.priority)] || 0) + 1;
  });

  addPageIfNeeded(40);
  const prioritySummaryRows = Object.entries(byPriority)
    .map(([p, c]) => [p, String(c)]);

  if (prioritySummaryRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [["Priority", "Count"]],
      body: prioritySummaryRows,
      theme: "grid",
      headStyles: { fillColor: [33, 150, 243], textColor: 255, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      margin: { left: margin, right: margin },
      tableWidth: contentWidth * 0.4,
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // --- DETAILED TASKS ---
  addPageIfNeeded(20);
  doc.setDrawColor(76, 175, 80);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("Detailed Task Report", margin, y);
  y += 8;

  doneTasks.forEach((task, idx) => {
    addPageIfNeeded(60);

    // Task number & title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(33, 96, 180);
    const titleLines = doc.splitTextToSize(`${idx + 1}. ${task.title}`, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5 + 2;

    // Task details as a mini table
    const details: string[][] = [];
    details.push(["Client", task.client_name || "Not specified"]);
    details.push(["Priority", friendlyPriority(task.priority)]);
    details.push(["Task Type", friendlyType(task.type || task.task_type)]);

    if (task.supplier_name) {
      details.push(["Supplier", task.supplier_name]);
    }
    if (task.suppliers && task.suppliers.length > 0) {
      details.push(["Suppliers", task.suppliers.join(", ")]);
    }

    const creatorName = task.creator?.full_name || task.creator?.email || "Unknown";
    const assigneeName = task.assignee?.full_name || task.assignee?.email || "Unassigned";
    details.push(["Created By", creatorName]);
    details.push(["Assigned To", assigneeName]);
    details.push(["Created On", formatDate(task.created_at)]);
    if (task.due_date) {
      details.push(["Due Date", formatShortDate(task.due_date)]);
    }
    details.push(["Completed On", formatDate(task.completed_at)]);

    if (task.description) {
      details.push(["Description", task.description]);
    }
    if (task.admin_remarks) {
      details.push(["Admin Remarks", task.admin_remarks]);
    }
    if (task.revision_notes) {
      details.push(["Revision Notes", task.revision_notes]);
    }
    if (task.delivery_address) {
      details.push(["Delivery Address", task.delivery_address]);
    }
    if (task.delivery_instructions) {
      details.push(["Delivery Instructions", task.delivery_instructions]);
    }
    if (task.source_app) {
      details.push(["Source", task.source_app]);
    }

    autoTable(doc, {
      startY: y,
      body: details,
      theme: "plain",
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40, textColor: [80, 80, 80], fontSize: 8.5 },
        1: { fontSize: 8.5, textColor: [33, 33, 33] },
      },
      margin: { left: margin + 2, right: margin },
      tableWidth: contentWidth - 4,
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // Task journey / activity timeline
    const history = historyByTask[task.id];
    if (history && history.length > 0) {
      addPageIfNeeded(20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text("Task Journey:", margin + 2, y);
      y += 4;

      const journeyRows = history.map(h => {
        const who = h.changed_by_profile?.full_name || "System";
        const when = formatDate(h.created_at);
        let what = h.action;
        if (h.old_status && h.new_status) {
          what = `Moved from "${friendlyStatus(h.old_status)}" to "${friendlyStatus(h.new_status)}"`;
        } else if (h.action === "created") {
          what = "Task was created";
        } else if (h.action === "status_change" && h.new_status) {
          what = `Status changed to "${friendlyStatus(h.new_status)}"`;
        }
        return [when, who, what];
      });

      autoTable(doc, {
        startY: y,
        head: [["When", "By", "What Happened"]],
        body: journeyRows,
        theme: "striped",
        headStyles: { fillColor: [158, 158, 158], textColor: 255, fontStyle: "bold", fontSize: 8 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { cellWidth: 28 },
          2: { cellWidth: "auto" },
        },
        margin: { left: margin + 2, right: margin },
        tableWidth: contentWidth - 4,
      });
      y = (doc as any).lastAutoTable.finalY + 4;
    }

    // Divider between tasks
    addPageIfNeeded(8);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;
  });

  // --- FOOTER on last page ---
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages} — REA Advertising Task Management`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  return doc.output("blob");
}
