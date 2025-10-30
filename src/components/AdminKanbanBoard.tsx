import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KanbanColumn } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";
import { EditTaskDialog } from "./EditTaskDialog";
import { StatusChangeNotification } from "./StatusChangeNotification";
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
};

type Column = {
  id: string;
  title: string;
  status: string;
};

const ADMIN_COLUMNS: Column[] = [
  { id: "admin_cost_approval", title: "Admin Cost Approval", status: "admin_approval" },
  { id: "approved", title: "Approve (Drop Here)", status: "approved" },
  { id: "production", title: "Production (Operations)", status: "production" },
];

export const AdminKanbanBoard = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});

  const fetchTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('🔍 Admin fetching tasks for user:', user.id);

      // Verify user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      console.log('👤 Admin role check:', roleData);

      // Fetch all user roles for mapping
      const { data: allRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      const rolesMap: Record<string, string> = {};
      allRoles?.forEach((r) => {
        rolesMap[r.user_id] = r.role;
      });
      setUserRoles(rolesMap);

      // Fetch ALL tasks for admin approval pipeline (admins should see everything)
      const { data: approvalTasks, error: approvalError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'admin_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      console.log('📋 Admin Cost Approval tasks found:', approvalTasks?.length, 'Status filter: admin_approval');
      console.log('📋 Full approval tasks data:', JSON.stringify(approvalTasks, null, 2));
      if (approvalError) {
        console.error('❌ Error fetching approval tasks:', approvalError);
        throw approvalError;
      }

      // Fetch approved tasks (should be empty after proper flow)
      const { data: approvedTasks, error: approvedError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'approved')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Note: Tasks should never stay in 'approved' - they immediately become 'quotation_bill'
      if (approvedTasks && approvedTasks.length > 0) {
        console.warn('⚠️ Found tasks in approved status - auto-fixing to quotation_bill:', approvedTasks.length);
        // Auto-fix any stuck approved tasks
        for (const task of approvedTasks) {
          await supabase
            .from('tasks')
            .update({
              status: 'quotation_bill',
              updated_at: new Date().toISOString(),
            })
            .eq('id', task.id);
        }
        toast.info(`Auto-fixed ${approvedTasks.length} stuck task(s) - moved to Quotation Bill`);
      }
      console.log('✅ Approved tasks (should be 0):', approvedTasks?.length, approvedTasks);
      if (approvedError) {
        console.error('❌ Error fetching approved tasks:', approvedError);
        throw approvedError;
      }

      // Fetch production tasks created by operations team only (to avoid duplicates)
      const { data: operationsUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'operations');

      const operationsUserIds = operationsUsers?.map(u => u.user_id) || [];

      const { data: productionTasks, error: productionError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'production')
        .in('created_by', operationsUserIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      console.log('🏭 Production tasks:', productionTasks?.length, productionTasks);
      if (productionError) {
        console.error('❌ Error fetching production tasks:', productionError);
        throw productionError;
      }

      const allTasks = [...(approvalTasks || []), ...(approvedTasks || []), ...(productionTasks || [])];
      console.log('📦 Total tasks in admin panel:', allTasks.length);
      setTasks(allTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    // Real-time subscription for all task changes
    const channel = supabase
      .channel('admin-kanban-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          console.log('Admin received task change:', payload);
          // Immediate refetch on any task change
          fetchTasks();
        }
      )
      .subscribe((status) => {
        console.log('Admin subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over || !active) return;

    const taskId = active.id as string;
    
    // Determine the new status - more robust handling
    let newStatus: string | null = null;
    
    // Try to find the target column first
    const targetColumn = ADMIN_COLUMNS.find(col => col.id === over.id);
    
    if (targetColumn) {
      newStatus = targetColumn.status;
    } else {
      // If not dropped on a column, check if dropped on another task
      const targetTask = tasks.find(t => t.id === over.id);
      if (targetTask) {
        newStatus = targetTask.status;
      }
    }

    // If we couldn't determine a valid status, abort
    if (!newStatus) {
      console.warn("Could not determine target status");
      toast.error("Invalid drop location");
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // If status unchanged, abort
    if (task.status === newStatus) return;

    // Don't allow moving production tasks - they're read-only monitoring
    if (task.status === 'production') {
      toast.error("Production tasks cannot be moved from admin panel");
      return;
    }

    try {
      // If moving to approved, automatically transition to quotation_bill for estimation
      if (newStatus === 'approved') {
        console.log('✅ Admin approving task - moving to quotation_bill for estimation');
        const updates = {
          status: 'quotation_bill' as any,
          previous_status: 'admin_approval' as any,
          assigned_to: task.created_by, // Return task to original creator (estimation)
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        console.log('✅ Task approved and moved to Quotation Bill in estimation panel');
        
        if (!navigator.onLine) {
          toast.success("Task approved (offline - will sync when online)");
        } else {
          toast.success("Task approved! Moved to Quotation Bill in estimation's panel");
        }
      } else {
        // Regular status update
        const updates = {
          status: newStatus as any,
          previous_status: task.status as any,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        if (!navigator.onLine) {
          toast.success("Task moved (offline - will sync when online)");
        } else {
          toast.success("Task moved successfully");
        }
      }
      
      // Immediate refetch to ensure UI is in sync
      await fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to move task');
      // Refetch even on error to ensure consistency
      fetchTasks();
    }
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <StatusChangeNotification />
      
      <div className="flex justify-center w-full">
        <DndContext
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 px-2 max-w-[1600px] w-full">
            <SortableContext
              items={ADMIN_COLUMNS.map((col) => col.id)}
              strategy={horizontalListSortingStrategy}
            >
              {ADMIN_COLUMNS.map((column) => {
                // For "Approved" column, don't show any tasks (it's just a drop zone)
                const columnTasks = column.status === 'approved' 
                  ? [] 
                  : tasks.filter((task) => task.status === column.status);
                return (
                  <KanbanColumn
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    tasks={columnTasks}
                    onEditTask={handleEditTask}
                    isAdminView={true}
                    onTaskUpdated={fetchTasks}
                    userRolesMap={userRoles}
                  />
                );
              })}
            </SortableContext>
          </div>

          <DragOverlay>
            {activeTask ? (
              <TaskCard 
                task={activeTask} 
                isDragging 
                isAdminView={true}
                userRole={userRoles[activeTask.assigned_to || activeTask.created_by] || "admin"}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <EditTaskDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        task={editingTask}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
        isAdmin={true}
      />
    </div>
  );
};
