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
import { logTaskAction } from "@/lib/auditLogger";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";
import { SendBackToDesignerDialog } from "./SendBackToDesignerDialog";

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
  sent_back_to_designer?: boolean;
  admin_remarks?: string | null;
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
];

export const AdminKanbanBoard = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [userRoles, setUserRoles] = useState<Record<string, string>>({});
  const [sendBackDialogOpen, setSendBackDialogOpen] = useState(false);
  const [sendBackTask, setSendBackTask] = useState<Task | null>(null);

  const fetchTasks = async () => {
    console.log('🔍 AdminKanbanBoard: Starting fetchTasks...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('❌ AdminKanbanBoard: No user found');
        setLoading(false);
        return;
      }

      console.log('🔍 Admin fetching tasks for user:', user.id);

      // Verify user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
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
      // EXCLUDE personal tasks from other admins (only show own personal tasks or non-personal tasks)
      const { data: approvalTasks, error: approvalError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'admin_approval')
        .is('deleted_at', null)
        .or(`is_personal_admin_task.is.null,is_personal_admin_task.eq.false,and(is_personal_admin_task.eq.true,created_by.eq.${user.id})`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      console.log('📋 Admin Cost Approval tasks found:', approvalTasks?.length, 'Status filter: admin_approval');
      console.log('📋 Full approval tasks data:', JSON.stringify(approvalTasks, null, 2));
      if (approvalError) {
        console.error('❌ Error fetching approval tasks:', approvalError);
        throw approvalError;
      }

      // Fetch tasks with_client status (designer approval flow)
      // Exclude tasks that are marked as done
      // EXCLUDE personal tasks from other admins
      const { data: withClientTasks, error: withClientError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'with_client')
        .is('deleted_at', null)
        .or(`is_personal_admin_task.is.null,is_personal_admin_task.eq.false,and(is_personal_admin_task.eq.true,created_by.eq.${user.id})`)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      console.log('👥 With Client tasks (raw):', withClientTasks?.length);
      
      // Double-check: filter out any tasks that somehow have status 'done'
      const filteredWithClientTasks = withClientTasks?.filter(task => task.status === 'with_client') || [];
      console.log('👥 With Client tasks (filtered):', filteredWithClientTasks.length, filteredWithClientTasks);
      
      if (withClientError) {
        console.error('❌ Error fetching with_client tasks:', withClientError);
        throw withClientError;
      }

      // CRITICAL: First, fetch ALL tasks that have approved products across ALL statuses
      // These parent tasks should NEVER appear in any column
      const { data: allApprovedProducts } = await supabase
        .from('task_products')
        .select('task_id, approval_status')
        .eq('approval_status', 'approved');
      
      const tasksWithApprovedProducts = allApprovedProducts
        ?.map(p => p.task_id)
        .filter((id, index, self) => self.indexOf(id) === index) || [];
      
      console.log('🚫 ALL tasks with approved products (will be excluded everywhere):', tasksWithApprovedProducts.length, tasksWithApprovedProducts);

      // Fetch tasks from designer's done pipeline for production
      // Show tasks that are:
      // 1. Either visible_to is null (visible to all) OR visible_to equals current admin
      // 2. Either NOT personal tasks OR personal tasks created by current admin
      const { data: designerDoneTasks, error: designerDoneError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'done')
        .is('deleted_at', null)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      // Filter in JavaScript for better control over complex conditions
      const designerDoneFiltered = designerDoneTasks?.filter(task => {
        // Must be created/assigned to a designer
        const isDesignerTask = rolesMap[task.created_by] === 'designer' || 
                               rolesMap[task.assigned_to || ''] === 'designer';
        if (!isDesignerTask) return false;

        // Only filter by personal tasks - ALL shared tasks visible to ALL admins
        const isAccessible = !task.is_personal_admin_task || task.created_by === user.id;
        
        return isAccessible;
      }) || [];

      // Filter out tasks that have approved products - those products go through separate production flow
      const designerDoneFilteredFinal = designerDoneFiltered.filter(
        task => !tasksWithApprovedProducts.includes(task.id)
      );

      console.log('🎨 Designer Done for Production tasks:', designerDoneFilteredFinal.length, designerDoneFilteredFinal);
      if (designerDoneError) {
        console.error('❌ Error fetching designer done tasks:', designerDoneError);
      }

      // Also fetch quotation_bill tasks to check for misassignments
      // EXCLUDE personal tasks from other admins
      const { data: quotationBillTasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'quotation_bill')
        .is('deleted_at', null)
        .or(`is_personal_admin_task.is.null,is_personal_admin_task.eq.false,and(is_personal_admin_task.eq.true,created_by.eq.${user.id})`);

      // CRITICAL: Filter out ALL parent tasks with approved products from ALL task arrays
      const filteredApprovalTasks = approvalTasks?.filter(t => !tasksWithApprovedProducts.includes(t.id)) || [];
      const filteredWithClientTasksFinal = filteredWithClientTasks?.filter(t => !tasksWithApprovedProducts.includes(t.id)) || [];
      const filteredQuotationBillTasks = quotationBillTasks?.filter(t => !tasksWithApprovedProducts.includes(t.id)) || [];
      
      console.log('✅ Filtered approval tasks (removed parent tasks):', filteredApprovalTasks.length);
      console.log('✅ Filtered with_client tasks (removed parent tasks):', filteredWithClientTasksFinal.length);
      console.log('✅ Filtered quotation_bill tasks (removed parent tasks):', filteredQuotationBillTasks.length);

      // Map designer done tasks to special status for admin view
      const designerDoneWithStatus = designerDoneFilteredFinal.map(task => ({
        ...task,
        status: 'designer_done_production',
        original_status: 'done',
      }));

      // Fetch approved products ONLY from tasks that have approved products
      // These should show in FOR PRODUCTION as individual items
      let approvedProductTasks: any[] = [];
      
      if (tasksWithApprovedProducts.length > 0) {
        const { data: approvedProducts } = await supabase
          .from('task_products')
          .select('*')
          .in('task_id', tasksWithApprovedProducts)
          .eq('approval_status', 'approved')
          .eq('designer_completed', true);

        console.log('📦 Approved products from filtered tasks:', approvedProducts?.length, approvedProducts);

        // Convert approved products to task-like objects for display
        approvedProductTasks = approvedProducts
          ?.map(product => {
            // Find the parent task from designerDoneFiltered
            const parentTask = designerDoneFiltered.find(t => t.id === product.task_id);
            if (!parentTask) return null;

            return {
              id: product.id, // Use product ID as unique identifier
              title: `${parentTask.title} - ${product.product_name}`,
              description: product.description || `Qty: ${product.quantity} ${product.unit}`,
              status: 'designer_done_production',
              original_status: 'done',
              priority: 'medium',
              due_date: null,
              position: product.position || 0,
              assigned_to: parentTask.assigned_to,
              created_by: parentTask.created_by,
              created_at: product.created_at,
              updated_at: product.updated_at,
              status_changed_at: product.updated_at,
              assigned_by: null,
              client_name: parentTask.client_name,
              my_status: 'pending',
              supplier_name: null,
              type: 'product',
              came_from_designer_done: false,
              sent_back_to_designer: false,
              admin_remarks: null,
              is_product: true, // Flag to identify this is a product, not a task
              parent_task_id: parentTask.id,
              product_data: product,
            } as Task & { is_product: boolean; parent_task_id: string; product_data: any };
          })
          .filter(Boolean) || [];

      console.log('🎯 Approved products as tasks for FOR PRODUCTION:', approvedProductTasks.length);
      }

      // Combine all tasks using the filtered versions (parent tasks with approved products already removed)
      let allTasks = [...filteredApprovalTasks, ...filteredWithClientTasksFinal, ...filteredQuotationBillTasks, ...designerDoneWithStatus, ...approvedProductTasks];
      
      // Final deduplication by ID to ensure no duplicates
      const seenIds = new Set();
      allTasks = allTasks.filter(task => {
        if (seenIds.has(task.id)) {
          console.warn('⚠️ Duplicate task found:', task.id, task.title);
          return false;
        }
        seenIds.add(task.id);
        return true;
      });
      
      console.log('📦 Total tasks in admin panel:', allTasks.length);
      console.log('🚫 Excluded parent tasks with approved products:', tasksWithApprovedProducts.length);
      
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
          const updatePromises = tasksToFix.map(task =>
            supabase
              .from('tasks')
              .update({
                assigned_to: estimationUserId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id)
          );
          
          await Promise.all(updatePromises);
          console.log(`✅ Fixed ${tasksToFix.length} task(s) - assigned to estimation user`);
          toast.info(`Auto-fixed ${tasksToFix.length} task(s) - assigned to estimation team`);
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
    console.log('🚀 AdminKanbanBoard: useEffect triggered');
    
    // Set a safety timeout in case fetch hangs
    const safetyTimeout = setTimeout(() => {
      console.warn('⚠️ AdminKanbanBoard: fetchTasks taking too long, forcing loading off');
      setLoading(false);
    }, 15000); // 15 second timeout
    
    fetchTasks().finally(() => {
      clearTimeout(safetyTimeout);
    });
    
    // Listen for custom task-completed events
    const handleTaskCompleted = (event: CustomEvent) => {
      console.log('🎉 AdminKanbanBoard: Task completed event received', event.detail);
      setTimeout(() => fetchTasks(), 300); // Small delay to ensure DB is updated
    };
    
    window.addEventListener('task-completed', handleTaskCompleted as EventListener);
    
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

    return () => {
      clearTimeout(safetyTimeout);
      window.removeEventListener('task-completed', handleTaskCompleted as EventListener);
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
      // Handle designer approval flow: with_client → approved_designer → production (NOT production_file)
      else if (task.status === 'with_client' && newStatus === 'approved_designer') {
        console.log('✅ Admin approving designer task - moving to production');
        
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
          status: 'production' as any,
          previous_status: 'with_client' as any,
          assigned_to: assignTo,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        await fetchTasks();
        
        console.log('✅ Designer task approved and moved to Production');
        
        if (!navigator.onLine) {
          toast.success("Task approved (offline - will sync when online)");
        } else {
          toast.success("Task approved! Moved to Production in designer's panel");
        }
      }
      else {
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

  const handleSendToProduction = async (taskId: string) => {
    try {
      // Move task from designer's done to production pipeline
      // Unassign from designer so estimation/operations can see it
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'production',
          previous_status: 'done',
          assigned_to: null,  // Unassign from designer
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString(),
          came_from_designer_done: true
        })
        .eq('id', taskId);

      if (error) throw error;

      toast.success("Task sent to Production pipeline for estimation and operations teams");
      await fetchTasks();
    } catch (error) {
      console.error('Error sending task to production:', error);
      toast.error('Failed to send task to production');
    }
  };

  const handleDeleteFromProduction = async (taskId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (!confirm("Remove this item from FOR PRODUCTION?")) {
        return;
      }

      console.log('🗑️ Attempting to delete from FOR PRODUCTION:', taskId);

      // Try deleting as product first (products are shown with product ID)
      const { error: productError, count: productCount } = await supabase
        .from('task_products')
        .delete({ count: 'exact' })
        .eq('id', taskId);

      console.log('📦 Product delete result:', { productError, productCount });

      // Try task delete
      const { error: taskError, count: taskCount } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
        .eq('id', taskId);

      console.log('📋 Task delete result:', { taskError, taskCount });

      // Success if either delete worked
      if ((!productError && productCount && productCount > 0) || (!taskError && taskCount && taskCount > 0)) {
        console.log('✅ Successfully deleted item');
        toast.success("Removed from FOR PRODUCTION");
        await fetchTasks();
        return;
      }

      // Both failed
      console.error('❌ Delete failed - both operations returned 0 rows or errors:', { productError, taskError });
      toast.error('Failed to remove. Item may not exist or you lack permission.');
    } catch (error: any) {
      console.error('❌ Error removing item:', error);
      toast.error('Failed to remove item');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <StatusChangeNotification />
      
      {/* FOR PRODUCTION Section - Separate from regular Kanban */}
      {tasks.filter(t => t.status === 'designer_done_production').length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border-2 border-blue-300 dark:border-blue-700 p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                FOR PRODUCTION
              </h2>
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                {tasks.filter(t => t.status === 'designer_done_production').length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Tasks completed by designer ready for production</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto">
            {tasks
              .filter(t => t.status === 'designer_done_production')
              .map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteFromProduction}
                  isAdminView={true}
                  onTaskUpdated={fetchTasks}
                  userRole="admin"
                  isAdminOwnPanel={true}
                  showFullCrud={true}
                  onSendBack={(task) => {
                    setSendBackTask(task);
                    setSendBackDialogOpen(true);
                  }}
                />
              ))
            }
          </div>
        </div>
      )}
      
      {/* Regular Admin Approval Kanban Board */}
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3 px-2">Admin Approval Pipeline</h3>
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
                const columnTasks = column.status === 'approved' || column.status === 'approved_designer'
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
      </div>

      <EditTaskDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        task={editingTask}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
        isAdmin={true}
      />
      
      {sendBackTask && (
        <SendBackToDesignerDialog
          open={sendBackDialogOpen}
          onOpenChange={setSendBackDialogOpen}
          taskId={sendBackTask.id}
          taskTitle={sendBackTask.title}
          onSuccess={fetchTasks}
        />
      )}
    </div>
  );
};
