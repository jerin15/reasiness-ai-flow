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
import { StatusChangeNotification } from "./StatusChangeNotification";
import { WeeklyReportNotification } from "./WeeklyReportNotification";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";
import { updateTaskOffline } from "@/lib/offlineTaskOperations";
import { getLocalTasks, saveTasksLocally } from "@/lib/offlineStorage";

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
  status_changed_at: string;
  assigned_by: string | null;
  client_name: string | null;
  my_status: string;
  supplier_name: string | null;
  type: string;
  assigned_user_role?: string | null;
  sent_to_designer_mockup?: boolean;
  mockup_completed_by_designer?: boolean;
  came_from_designer_done?: boolean;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Define columns based on role - use viewing user's role if admin is viewing someone else
  const getColumnsForRole = (): Column[] => {
    const roleToUse = (isAdmin && viewingUserRole) ? viewingUserRole : userRole;
    switch (roleToUse) {
      case "estimation":
        return [
          { id: "rfq_todo", title: "RFQ", status: "todo" },
          { id: "general_todo", title: "GENERAL", status: "todo" },
          { id: "supplier_quotes", title: "Supplier Quotes", status: "supplier_quotes" },
          { id: "client_approval", title: "Client Approval", status: "client_approval" },
          { id: "admin_approval", title: "Admin Cost Approval", status: "admin_approval" },
          { id: "quotation_bill", title: "Quotation Bill", status: "quotation_bill" },
          { id: "production", title: "Production", status: "production" },
          { id: "final_invoice", title: "PENDING INVOICES", status: "final_invoice" },
          { id: "done", title: "Done", status: "done" },
        ];
      case "designer":
        return [
          { id: "todo", title: "To-Do List", status: "todo" },
          { id: "mockup", title: "MOCKUP", status: "mockup" },
          { id: "with_client", title: "With Client", status: "with_client" },
          { id: "production", title: "PRODUCTION", status: "production" },
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
      case "technical_head":
        return [
          { id: "todo", title: "To-Do", status: "todo" },
          { id: "developing", title: "Developing", status: "developing" },
          { id: "testing", title: "Testing", status: "testing" },
          { id: "under_review", title: "Under Review", status: "under_review" },
          { id: "deployed", title: "Deployed", status: "deployed" },
          { id: "trial_and_error", title: "Trial and Error", status: "trial_and_error" },
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

      // Store current user ID
      setCurrentUserId(user.id);

      // Get current user's role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      
      const currentUserRole = roleData?.role;
      console.log("📊 User role:", currentUserRole, "| isAdmin:", isAdmin, "| viewing:", viewingUserId);

      if (!navigator.onLine) {
        // Load from local storage when offline
        console.log('📴 Offline - loading tasks from local storage');
        const localTasks = await getLocalTasks();
        setTasks(localTasks);
        setLoading(false);
        return;
      }

      let query = supabase
        .from("tasks")
        .select(`
          *,
          assigned_profile:profiles!tasks_assigned_to_fkey(
            id,
            full_name,
            user_roles(role)
          )
        `)
        .is("deleted_at", null);

      if (isAdmin && viewingUserId && viewingUserId !== user.id) {
        // Admin viewing team member's panel - show that user's tasks
        console.log("👥 Admin viewing team member:", viewingUserId);
        query = query.or(`created_by.eq.${viewingUserId},assigned_to.eq.${viewingUserId}`);
      } else if (isAdmin && (!viewingUserId || viewingUserId === user.id)) {
        // Admin viewing their OWN panel - only their assigned tasks or personal tasks
        console.log("👤 Admin viewing own pipeline");
        query = query.or(`assigned_to.eq.${user.id},and(created_by.eq.${user.id},or(assigned_to.is.null,assigned_to.eq.${user.id}))`);
      } else {
        // Regular user (non-admin) - show tasks they created OR are assigned to
        console.log("👤 Regular user viewing own tasks");
        query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
      }

      // For estimation role, order by type first (quotations, invoices, productions, generals)
      const roleToCheck = (isAdmin && viewingUserRole) ? viewingUserRole : currentUserRole;
      
      let data, error;
      if (roleToCheck === 'estimation') {
        const result = await query;
        if (result.error) {
          error = result.error;
          data = null;
        } else {
          // Custom client-side sorting for estimation: type order, then priority (urgent first), then position
          const typeOrder: Record<string, number> = { 
            quotation: 1, 
            invoice: 2, 
            production: 3, 
            general: 4 
          };
          data = (result.data || []).sort((a, b) => {
            // Normalize type to lowercase for comparison
            const typeA = typeOrder[a.type?.toLowerCase()] || 999;
            const typeB = typeOrder[b.type?.toLowerCase()] || 999;
            if (typeA !== typeB) return typeA - typeB;
            
            // Sort by urgency: urgent > high > medium > low
            const priorityOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
            const priorityA = priorityOrder[a.priority?.toLowerCase()] || 0;
            const priorityB = priorityOrder[b.priority?.toLowerCase()] || 0;
            if (priorityA !== priorityB) return priorityB - priorityA;
            
            return a.position - b.position;
          });
        }
      } else {
        const result = await query
          .order("priority", { ascending: false })
          .order("position", { ascending: true });
        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      console.log("✅ Tasks loaded:", data?.length, "| Production:", data?.filter(t => t.status === 'production').length);
      
      // Transform data to include assigned_user_role
      const transformedData = (data || []).map((task: any) => {
        // Extract the role from the nested structure
        // user_roles could be an object (single role) or array (multiple roles)
        let assignedUserRole = null;
        if (task.assigned_profile?.user_roles) {
          if (Array.isArray(task.assigned_profile.user_roles)) {
            assignedUserRole = task.assigned_profile.user_roles[0]?.role || null;
          } else {
            assignedUserRole = task.assigned_profile.user_roles.role || null;
          }
        }
        console.log("Task:", task.title, "| Assigned to:", task.assigned_to, "| Role:", assignedUserRole);
        
        return {
          ...task,
          assigned_user_role: assignedUserRole,
          assigned_profile: undefined, // Remove the nested object
        };
      });
      
      setTasks(transformedData);
      
      // Save to local storage for offline access
      await saveTasksLocally(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
      
      // Try loading from local storage on error
      const localTasks = await getLocalTasks();
      if (localTasks.length > 0) {
        setTasks(localTasks);
        toast.info("Loaded cached tasks (offline mode)");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();

    // Subscribe to realtime changes with a unique channel per view
    const channelName = `tasks-changes-${viewingUserId || 'default'}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: viewingUserId || 'default' }
        }
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
        },
        (payload) => {
          console.log('🔄 Real-time update received:', payload.eventType, payload.new);
          fetchTasks();
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time connected for', channelName);
        }
      });

    // Aggressive polling as backup (every 3 seconds)
    const pollInterval = setInterval(() => {
      fetchTasks();
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [viewingUserId, isAdmin]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !active) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    
    // Determine the new status - more robust handling
    let newStatus: string | null = null;
    
    // Try to find the target column first
    const targetColumn = columns.find((col) => col.id === over.id);
    
    if (targetColumn) {
      newStatus = targetColumn.status;
    } else {
      // If not dropped on a column, check if dropped on another task
      const targetTask = tasks.find((t) => t.id === over.id);
      if (targetTask) {
        newStatus = targetTask.status;
      }
    }

    // If we couldn't determine a valid status, abort
    if (!newStatus || task.status === newStatus) {
      return;
    }

    // LOCK: Prevent estimation users from moving tasks out of admin_approval
    const roleToCheck = (isAdmin && viewingUserRole) ? viewingUserRole : userRole;
    if (roleToCheck === "estimation" && task.status === "admin_approval") {
      toast.error("⛔ Task locked! Only admin can approve and move to Quotation Bill");
      return;
    }

    // Check if moving to supplier_quotes or client_approval for estimation role (from any status)
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

      console.log("📤 Estimation updating task:", taskId, "from", task.status, "to status:", newStatus);
      console.log("📤 Update payload:", JSON.stringify(updates, null, 2));
      
      // Use offline-capable update
      const { error } = await updateTaskOffline(taskId, updates);

      if (error) {
        console.error("❌ Error updating task:", error);
        toast.error(`Failed to move task: ${error.message}`);
        throw error;
      }

      console.log("✅ Task updated successfully to status:", newStatus);
      
      if (!navigator.onLine) {
        toast.success("Task moved (offline - will sync when online)");
      } else {
        toast.success("Task moved successfully");
      }
      
      // Immediate refetch to ensure UI is in sync
      await fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
      // Refetch even on error to ensure consistency
      fetchTasks();
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

  // Filter tasks based on search query
  const filteredTasks = tasks.filter((task) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      task.client_name?.toLowerCase().includes(query) ||
      task.supplier_name?.toLowerCase().includes(query) ||
      task.title?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="h-full flex flex-col">
      <StatusChangeNotification />
      <WeeklyReportNotification />
      
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-2xl font-bold">
          {isAdmin && viewingUserId ? "Team Member Tasks" : "My Tasks"}
        </h2>
        <div className="flex-1 max-w-md">
          <Input
            placeholder="Search by client, supplier, or task name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Button onClick={() => setShowAddTask(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>

      <div className="flex justify-center w-full">
        <DndContext
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 px-2 max-w-[1600px] w-full">
            <SortableContext
              items={columns.map((col) => col.id)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((column) => {
                // For estimation role, filter tasks by type for RFQ and GENERAL columns
                let columnTasks = filteredTasks.filter((task) => task.status === column.status);
                
                if (column.id === 'rfq_todo') {
                  columnTasks = columnTasks.filter((task) => task.type?.toLowerCase() === 'quotation');
                } else if (column.id === 'general_todo') {
                  columnTasks = columnTasks.filter((task) => task.type?.toLowerCase() !== 'quotation');
                }
                
                return (
                  <KanbanColumn
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    tasks={columnTasks}
                    onEditTask={handleEditTask}
                    isAdminView={isAdmin && !!viewingUserId}
                    onTaskUpdated={fetchTasks}
                    userRole={(isAdmin && viewingUserRole) ? viewingUserRole : userRole}
                    isAdminOwnPanel={isAdmin && (!viewingUserId || viewingUserId === currentUserId)}
                  />
                );
              })}
            </SortableContext>
          </div>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} isDragging isAdminView={isAdmin && !!viewingUserId} userRole={(isAdmin && viewingUserRole) ? viewingUserRole : userRole} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <AddTaskDialog
        open={showAddTask}
        onOpenChange={setShowAddTask}
        onTaskAdded={handleTaskAdded}
        defaultAssignedTo={isAdmin && viewingUserId ? viewingUserId : undefined}
        viewingUserRole={isAdmin && viewingUserRole ? viewingUserRole : undefined}
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
        viewingUserRole={isAdmin && viewingUserRole ? viewingUserRole : undefined}
      />
    </div>
  );
};
