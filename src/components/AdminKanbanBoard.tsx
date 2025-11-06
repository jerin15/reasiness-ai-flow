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
  came_from_designer_done?: boolean;
};

type Column = {
  id: string;
  title: string;
  status: string;
};

const ADMIN_COLUMNS: Column[] = [
  { id: "admin_cost_approval", title: "Admin Cost Approval (Estimation)", status: "admin_approval" },
  { id: "quotation_approve", title: "Approve (Estimation)", status: "approved" },
  { id: "with_client", title: "With Client (Designer)", status: "with_client" },
  { id: "approved_designer", title: "Approved (Designer)", status: "approved_designer" },
  { id: "designer_done", title: "Designer Done → Final Invoice", status: "designer_done" },
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

      // Fetch ALL tasks for admin approval pipeline
      // Admin sees tasks from estimation/admin that need cost approval
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

      // Fetch tasks with_client status (designer approval flow)
      const { data: withClientTasks, error: withClientError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'with_client')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      console.log('👥 With Client tasks:', withClientTasks?.length, withClientTasks);
      if (withClientError) {
        console.error('❌ Error fetching with_client tasks:', withClientError);
        throw withClientError;
      }

      // Fetch tasks from designer's done pipeline that need to go to final invoice
      const { data: designerDoneTasks, error: designerDoneError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'done')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Filter for tasks created by designer (check if creator is designer role)
      const designerDoneFiltered = designerDoneTasks?.filter(task => {
        return rolesMap[task.created_by] === 'designer' || rolesMap[task.assigned_to || ''] === 'designer';
      }) || [];

      console.log('🎨 Designer Done tasks:', designerDoneFiltered.length, designerDoneFiltered);
      if (designerDoneError) {
        console.error('❌ Error fetching designer done tasks:', designerDoneError);
      }

      // Also fetch quotation_bill tasks to check for misassignments
      const { data: quotationBillTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'quotation_bill')
        .is('deleted_at', null);

      // Map designer done tasks to special status for admin view
      const designerDoneWithStatus = designerDoneFiltered.map(task => ({
        ...task,
        status: 'designer_done', // Temporary status for admin board display
        original_status: 'done',
      }));

      const allTasks = [...(approvalTasks || []), ...(withClientTasks || []), ...(quotationBillTasks || []), ...designerDoneWithStatus];
      console.log('📦 Total tasks in admin panel:', allTasks.length);
      
      // Auto-fix: Check for quotation_bill tasks assigned to admins instead of estimation users
      const tasksToFix = allTasks.filter(task => {
        const isQuotationBill = task.status === 'quotation_bill';
        const assignedToAdmin = task.assigned_to && rolesMap[task.assigned_to] === 'admin';
        return isQuotationBill && assignedToAdmin;
      });
      
      if (tasksToFix.length > 0) {
        console.log('🔧 Auto-fixing misassigned quotation_bill tasks:', tasksToFix.length);
        
        // Find estimation user
        const { data: estimationUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'estimation')
          .limit(1);
        
        if (estimationUsers && estimationUsers.length > 0) {
          const estimationUserId = estimationUsers[0].user_id;
          
          // Update all misassigned tasks
          for (const task of tasksToFix) {
            await supabase
              .from('tasks')
              .update({
                assigned_to: estimationUserId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);
            
            console.log(`✅ Fixed task ${task.title} - assigned to estimation user`);
          }
          
          toast.info(`Auto-fixed ${tasksToFix.length} task(s) - assigned to estimation team`);
          
          // Refetch to show updated data without the fixed tasks
          await fetchTasks();
          return;
        }
      }
      
      // Don't show quotation_bill tasks in admin panel (they belong to estimation)
      const adminPanelTasks = allTasks.filter(task => task.status !== 'quotation_bill');
      setTasks(adminPanelTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    
    // Real-time subscription for all task changes with aggressive polling
    const channel = supabase
      .channel('admin-kanban-realtime', {
        config: {
          broadcast: { self: true },
          presence: { key: 'admin' }
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks'
        },
        (payload) => {
          console.log('🔄 Admin received task change:', payload.eventType, payload.new);
          // Immediate refetch on any task change
          fetchTasks();
        }
      )
      .subscribe((status) => {
        console.log('📡 Admin subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Admin real-time connected');
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

    try {
      // Handle estimation approval flow: admin_approval → approved → quotation_bill
      if (task.status === 'admin_approval' && newStatus === 'approved') {
        console.log('✅ Admin approving estimation task - moving to quotation_bill');
        
        // Find estimation user to assign the task to
        const assignedUserRole = task.assigned_to ? userRoles[task.assigned_to] : null;
        let assignTo = task.assigned_to;
        
        // If not assigned to estimation user, find one
        if (assignedUserRole !== 'estimation') {
          const { data: estimationUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'estimation')
            .limit(1);
          
          if (estimationUsers && estimationUsers.length > 0) {
            assignTo = estimationUsers[0].user_id;
            console.log('📝 Assigning to estimation user:', assignTo);
          }
        }
        
        const updates = {
          status: 'quotation_bill' as any,
          previous_status: 'admin_approval' as any,
          assigned_to: assignTo,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        await fetchTasks();
        
        console.log('✅ Estimation task approved and moved to Quotation Bill');
        
        if (!navigator.onLine) {
          toast.success("Task approved (offline - will sync when online)");
        } else {
          toast.success("Task approved! Moved to Quotation Bill in estimation's panel");
        }
      } 
      // Handle designer approval flow: with_client → approved_designer → production_file
      else if (task.status === 'with_client' && newStatus === 'approved_designer') {
        console.log('✅ Admin approving designer task - moving to production_file');
        
        // Find designer user to assign back to
        const assignedUserRole = task.assigned_to ? userRoles[task.assigned_to] : null;
        let assignTo = task.assigned_to;
        
        // If not assigned to designer, find one
        if (assignedUserRole !== 'designer') {
          const { data: designerUsers } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'designer')
            .limit(1);
          
          if (designerUsers && designerUsers.length > 0) {
            assignTo = designerUsers[0].user_id;
            console.log('📝 Assigning to designer user:', assignTo);
          }
        }
        
        const updates = {
          status: 'production_file' as any,
          previous_status: 'with_client' as any,
          assigned_to: assignTo,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        await fetchTasks();
        
        console.log('✅ Designer task approved and moved to Production File');
        
        if (!navigator.onLine) {
          toast.success("Task approved (offline - will sync when online)");
        } else {
          toast.success("Task approved! Moved to Production File in designer's panel");
        }
      }
      // Handle designer done to final invoice flow
      else if (task.status === 'designer_done' && newStatus === 'designer_done') {
        console.log('✅ Admin sending designer done task to final invoice');
        
        // Find estimation user to assign to
        const { data: estimationUsers } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'estimation')
          .limit(1);
        
        if (!estimationUsers || estimationUsers.length === 0) {
          toast.error('No estimation user found');
          return;
        }
        
        const updates = {
          status: 'final_invoice' as any,
          previous_status: 'done' as any,
          assigned_to: estimationUsers[0].user_id,
          came_from_designer_done: true,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        await fetchTasks();
        
        console.log('✅ Designer done task sent to Final Invoice');
        
        if (!navigator.onLine) {
          toast.success("Task sent (offline - will sync when online)");
        } else {
          toast.success("Task sent to estimation's Final Invoice pipeline!");
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
        
        await fetchTasks();
      }
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
                // For "Approved" columns, don't show any tasks (they're just drop zones)
                const columnTasks = (column.status === 'approved' || column.status === 'approved_designer')
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
                    userRole="admin"
                    isAdminOwnPanel={true}
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
                userRole="admin"
                isAdminOwnPanel={true}
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
