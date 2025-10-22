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
  created_at: string;
  updated_at: string;
  assigned_by: string | null;
  client_name: string | null;
  my_status: string;
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
  const [reminderTargetStatus, setReminderTargetStatus] = useState<string>("");
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
          { id: "client_approval", title: "Client Approval", status: "client_approval" },
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current user's role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const currentUserRole = roleData?.role;
      console.log("📊 User role:", currentUserRole, "| isAdmin:", isAdmin, "| viewing:", viewingUserId);

      let query = supabase
        .from("tasks")
        .select("*")
        .is("deleted_at", null);

      // If admin is viewing a specific user's tasks, filter by that user
      if (isAdmin) {
        if (!viewingUserId) {
          // Admin with no user selected - show nothing
          console.log("🚫 Admin with no user selected - showing no tasks");
          query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // Non-existent ID
        } else if (viewingUserId === user.id) {
          // Admin viewing their own tasks - show only personal tasks they created for themselves
          console.log("👤 Admin viewing own tasks");
          query = query.eq("created_by", user.id).eq("assigned_to", user.id);
        } else {
          // Admin viewing team member tasks - show their tasks AND synced production tasks if viewing operations
          console.log("👥 Admin viewing team member:", viewingUserId);
          const { data: viewingUserRoleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", viewingUserId)
            .maybeSingle();
          
          console.log("👀 Viewing user role:", viewingUserRoleData?.role);
          
          if (viewingUserRoleData?.role === 'operations') {
            // Include synced production tasks for operations users
            console.log("🔧 Adding operations production tasks to query");
            query = query.or(`created_by.eq.${viewingUserId},assigned_to.eq.${viewingUserId},and(status.eq.production,assigned_to.is.null)`);
          } else {
            query = query.or(`created_by.eq.${viewingUserId},assigned_to.eq.${viewingUserId}`);
          }
        }
      } else if (!isAdmin) {
        // Operations users can see ALL production tasks (synced from estimation)
        if (currentUserRole === 'operations') {
          console.log("🔧 Operations user - including synced production tasks");
          query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id},and(status.eq.production,assigned_to.is.null)`);
        } else {
          // Non-admin users see tasks they created or are assigned to
          query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
        }
      }

      const { data, error } = await query
        .order("priority", { ascending: false })
        .order("position", { ascending: true });

      if (error) throw error;
      console.log("✅ Tasks loaded:", data?.length, "| Production:", data?.filter(t => t.status === 'production').length);
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
    
    // Determine the new status - over.id could be a column ID or a task ID
    let newStatus: string;
    
    // First check if it's a column ID
    const targetColumn = columns.find(col => col.id === over.id);
    
    if (targetColumn) {
      // Dropped on column area
      newStatus = targetColumn.status;
    } else {
      // Dropped on a task - find which column that task is in
      const targetTask = tasks.find(t => t.id === over.id);
      if (targetTask) {
        newStatus = targetTask.status;
      } else {
        console.error("Invalid drop target:", over.id);
        toast.error("Invalid drop location");
        return;
      }
    }

    // Find the task being moved
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Skip if not actually changing status
    if (task.status === newStatus) return;

    // Check if moving to supplier_quotes or client_approval for estimation role (from any status)
    const roleToCheck = (isAdmin && viewingUserRole) ? viewingUserRole : userRole;
    if ((newStatus === "supplier_quotes" || newStatus === "client_approval") && roleToCheck === "estimation") {
      // Show reminder dialog and track the target status
      setReminderTask(task);
      setReminderTargetStatus(newStatus);
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

      console.log("Updating task:", taskId, "from", task.status, "to status:", newStatus);
      const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);

      if (error) {
        console.error("Error updating task:", error);
        toast.error(`Failed to move task: ${error.message}`);
        throw error;
      }

      toast.success("Task moved successfully");
    } catch (error) {
      console.error("Error updating task:", error);
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
        <div className="flex gap-3 overflow-x-auto pb-4 w-full">
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
            setReminderTargetStatus("");
            fetchTasks();
          }}
          useDays={reminderTargetStatus === 'client_approval'}
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
