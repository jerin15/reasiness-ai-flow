import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { AddTaskDialog } from "./AddTaskDialog";
import { ReminderDialog } from "./ReminderDialog";
import { EditTaskDialog } from "./EditTaskDialog";
import { Button } from "./ui/button";
import { Plus } from "lucide-react";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  position: number;
  assigned_to: string | null;
  created_by: string;
};

type Column = {
  id: string;
  title: string;
  status: string;
};

type KanbanBoardProps = {
  userRole: string;
  viewingUserId?: string;
  isAdmin?: boolean;
  viewingUserRole?: string;
};

export const KanbanBoard = ({ userRole, viewingUserId, isAdmin, viewingUserRole }: KanbanBoardProps) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderTask, setReminderTask] = useState<Task | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Define columns based on role - use viewing user's role if admin is viewing someone else
  const getColumnsForRole = (): Column[] => {
    const roleToUse = (isAdmin && viewingUserRole) ? viewingUserRole : userRole;
    switch (roleToUse) {
      case "estimation":
        return [
          { id: "todo", title: "To-Do List", status: "todo" },
          { id: "supplier_quotes", title: "Supplier Quotes", status: "supplier_quotes" },
          { id: "admin_approval", title: "Admin Cost Approval", status: "admin_approval" },
          { id: "quotation_bill", title: "Quotation Bill", status: "quotation_bill" },
          { id: "production", title: "Production", status: "production" },
          { id: "final_invoice", title: "Final Invoice", status: "final_invoice" },
          { id: "done", title: "Done", status: "done" },
        ];
      case "designer":
        return [
          { id: "todo", title: "To-Do List", status: "todo" },
          { id: "mockup_pending", title: "Mockup Pending", status: "mockup_pending" },
          { id: "production_pending", title: "Production Pending", status: "production_pending" },
          { id: "with_client", title: "With Client", status: "with_client" },
          { id: "done", title: "Done", status: "done" },
        ];
      case "operations":
        return [
          { id: "todo", title: "To-Do List", status: "todo" },
          { id: "approval", title: "Approval", status: "approval" },
          { id: "production", title: "Production", status: "production" },
          { id: "delivery", title: "Delivery", status: "delivery" },
          { id: "done", title: "Done", status: "done" },
        ];
      default:
        return [
          { id: "todo", title: "To-Do List", status: "todo" },
          { id: "done", title: "Done", status: "done" },
        ];
    }
  };

  const columns = getColumnsForRole();

  const fetchTasks = async () => {
    try {
      let query = supabase
        .from("tasks")
        .select("*")
        .is("deleted_at", null);

      // If admin is viewing a specific user's tasks, filter by that user
      if (isAdmin && viewingUserId) {
        query = query.or(`created_by.eq.${viewingUserId},assigned_to.eq.${viewingUserId}`);
      }

      const { data, error } = await query.order("position");

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    // Subscribe to realtime changes with a unique channel per view
    const channelName = `tasks-changes-${viewingUserId || 'default'}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          fetchTasks();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewingUserId, isAdmin]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;

    // Find the task
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Check if status is in valid columns for this role
    const validStatuses = columns.map((col) => col.status);
    if (!validStatuses.includes(newStatus)) {
      toast.error("Invalid status for your role");
      return;
    }

    // Check if moving from todo to supplier_quotes for estimation role
    const roleToCheck = (isAdmin && viewingUserRole) ? viewingUserRole : userRole;
    if (task.status === "todo" && newStatus === "supplier_quotes" && roleToCheck === "estimation") {
      // Show reminder dialog
      setReminderTask(task);
      setShowReminderDialog(true);
    }

    try {
      const updates: any = {
        status: newStatus,
        previous_status: task.status,
        updated_at: new Date().toISOString(),
      };

      if (newStatus === "done") {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);

      if (error) throw error;

      toast.success("Task moved successfully");
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to move task");
    }
  };

  const handleTaskAdded = () => {
    fetchTasks();
    setShowAddTask(false);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setShowEditDialog(true);
  };

  const handleTaskUpdated = () => {
    fetchTasks();
    setShowEditDialog(false);
    setEditingTask(null);
  };

  const handleTaskDeleted = () => {
    fetchTasks();
    setShowEditDialog(false);
    setEditingTask(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          {isAdmin && viewingUserId ? "Team Member Tasks" : "My Tasks"}
        </h2>
        <Button onClick={() => setShowAddTask(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>

      <DndContext
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          <SortableContext
            items={columns.map((col) => col.id)}
            strategy={horizontalListSortingStrategy}
          >
            {columns.map((column) => (
              <KanbanColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={tasks.filter((task) => task.status === column.status)}
                onEditTask={handleEditTask}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>

      <AddTaskDialog
        open={showAddTask}
        onOpenChange={setShowAddTask}
        onTaskAdded={handleTaskAdded}
        defaultAssignedTo={isAdmin && viewingUserId ? viewingUserId : undefined}
      />
      
      {reminderTask && (
        <ReminderDialog
          open={showReminderDialog}
          onOpenChange={setShowReminderDialog}
          taskId={reminderTask.id}
          taskTitle={reminderTask.title}
          onReminderSet={() => {
            setShowReminderDialog(false);
            setReminderTask(null);
            fetchTasks();
          }}
        />
      )}

      <EditTaskDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        task={editingTask}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
        isAdmin={userRole === "admin"}
      />
    </div>
  );
};
