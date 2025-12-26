import { useState, useEffect, useCallback, useRef } from "react";
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
import { SendToProductionDialog } from "./SendToProductionDialog";
import { useConnectionAwareRefetch } from "@/hooks/useConnectionAwareRefetch";
import { useDebouncedCallback } from "@/hooks/useVisibilityAwareSubscription";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  suppliers: string[] | null;
  delivery_instructions: string | null;
  delivery_address: string | null;
  type: string;
  came_from_designer_done?: boolean;
  sent_back_to_designer?: boolean;
  admin_remarks?: string | null;
  admin_removed_from_production?: boolean;
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
  const [sendToProductionDialogOpen, setSendToProductionDialogOpen] = useState(false);
  const [sendToProductionTask, setSendToProductionTask] = useState<Task | null>(null);

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

      // Fetch tasks from designer's DONE pipeline
      // These are tasks that designers see in their DONE column
      // Show EXACTLY what designer sees: status='done' AND assigned_to=designer
      // IMPORTANT: For FOR PRODUCTION section, include tasks even if soft-deleted by weekly cleanup
      // These tasks should remain visible to admins for production tracking
      const { data: designerUsers } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'designer');
      
      const designerUserIds = designerUsers?.map(u => u.user_id) || [];
      
      // Fetch designer done tasks - include soft-deleted ones for FOR PRODUCTION visibility
      const { data: designerDoneTasks, error: designerDoneError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'done')
        .in('assigned_to', designerUserIds)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      // Filter in JavaScript for additional conditions
      const designerDoneFiltered = designerDoneTasks?.filter(task => {
        // Exclude tasks that admin removed from FOR PRODUCTION
        if (task.admin_removed_from_production) return false;

        // Only filter by personal tasks - ALL shared tasks visible to ALL admins
        const isAccessible = !task.is_personal_admin_task || task.created_by === user.id;
        
        return isAccessible;
      }) || [];

      // Filter out tasks that have approved products - those products go through separate production flow
      const designerDoneFilteredFinal = designerDoneFiltered.filter(
        task => !tasksWithApprovedProducts.includes(task.id)
      );

      console.log('🎨 Designer DONE pipeline tasks (what designers see):', designerDoneFilteredFinal.length, designerDoneFilteredFinal);
      console.log('🎨 These are the EXACT tasks in designer\'s DONE column that will show in FOR PRODUCTION');
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

      // Keep designer done tasks as 'done' status
      const designerDoneWithStatus = designerDoneFilteredFinal.map(task => ({
        ...task,
        status: 'done',
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
              status: 'done',
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

  // Debounced fetch to prevent rapid successive calls
  const debouncedFetchTasks = useDebouncedCallback(fetchTasks, 300);
  
  // Connection-aware refetch: auto-refetch on internet restore, tab focus, and fallback polling
  useConnectionAwareRefetch(fetchTasks, { pollingInterval: 30000, enablePolling: true });
  
  // Channel ref for managing subscription lifecycle
  const channelRef = useRef<RealtimeChannel | null>(null);

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
      setTimeout(() => debouncedFetchTasks(), 300); // Small delay to ensure DB is updated
    };
    
    window.addEventListener('task-completed', handleTaskCompleted as EventListener);
    
    // Subscribe function for visibility-aware subscription
    const subscribe = () => {
      if (channelRef.current) return;
      
      const channel = supabase
        .channel('admin-kanban-realtime-' + Date.now(), {
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
            // Debounced refetch on any task change
            debouncedFetchTasks();
          }
        )
        .subscribe((status) => {
          console.log('📡 Admin subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('✅ Admin real-time connected');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('⚠️ Admin subscription error, will retry on visibility');
            // Clean up failed channel
            if (channelRef.current) {
              supabase.removeChannel(channelRef.current);
              channelRef.current = null;
            }
          }
        });
      
      channelRef.current = channel;
    };
    
    const unsubscribe = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    
    // Visibility-aware subscription management
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden - unsubscribe to save resources
        unsubscribe();
      } else {
        // Tab visible - resubscribe and refetch
        subscribe();
        debouncedFetchTasks();
      }
    };
    
    // Initial subscription if tab is visible
    if (!document.hidden) {
      subscribe();
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(safetyTimeout);
      window.removeEventListener('task-completed', handleTaskCompleted as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unsubscribe();
    };
  }, [debouncedFetchTasks]);

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
      // Handle COST APPROVAL flow: admin_cost_approval → quotation_bill
      // This is when estimation submits supplier quotes for cost approval
      if (task.status === 'admin_cost_approval' && newStatus === 'approved') {
        console.log('💰 Admin approving COST - moving back to quotation_bill for estimation');
        
        // CRITICAL: Assign back to the estimation user who created the task
        // This completes the loop: estimation → admin cost approval → estimation (quotation_bill)
        const assignTo = task.created_by;
        
        console.log('📝 Assigning back to original estimation user:', assignTo);
        
        const updates = {
          status: 'quotation_bill' as any,
          previous_status: 'admin_cost_approval' as any,
          assigned_to: assignTo,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString()
        };
        
        const { error } = await updateTaskOffline(taskId, updates);

        if (error) throw error;
        
        await fetchTasks();
        
        console.log('✅ Cost approved - task sent back to estimation for quotation');
        
        if (!navigator.onLine) {
          toast.success("Cost approved (offline - will sync when online)");
        } else {
          toast.success("💰 Cost approved! Task sent back to estimation for quotation");
        }
        return;
      }

      // Handle GENERAL APPROVAL flow: admin_approval → quotation_bill
      // This is for general estimation task approval
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
          toast.success("✅ Task approved! Moved to Quotation Bill in estimation's panel");
        }
        return;
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
    // Find the item to check if it's a product or regular task
    const item = tasks.find(t => t.id === taskId) as any;
    
    if (!item) {
      console.error('❌ Item not found:', taskId);
      toast.error('Item not found');
      return;
    }

    // First check if a linked operations task already exists to prevent duplicates
    const targetTaskId = item.is_product && item.parent_task_id ? item.parent_task_id : taskId;
    
    const { data: existingLinkedTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('linked_task_id', targetTaskId)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingLinkedTask) {
      console.log('⚠️ Operations task already exists for this task:', existingLinkedTask.id);
      // Just update the original task and show success - don't create duplicate
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'production',
          previous_status: 'done',
          assigned_to: null,
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString(),
          came_from_designer_done: false,
          admin_removed_from_production: true // Hide from FOR PRODUCTION since it's already sent
        })
        .eq('id', targetTaskId);

      if (error) {
        console.error('Error updating task:', error);
      }
      
      toast.success("Task sent to Production pipeline for operations team");
      await fetchTasks();
      return;
    }

    // If it's a product, update the parent task to production
    if (item.is_product && item.parent_task_id) {
      console.log('📦 Sending product to production via parent task:', item.parent_task_id);
      
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'production',
          previous_status: 'done',
          assigned_to: null,  // Unassign from designer
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString(),
          came_from_designer_done: false  // Clear flag so it leaves FOR PRODUCTION panel
        })
        .eq('id', item.parent_task_id);

      if (error) {
        console.error('Error updating parent task:', error);
        // Don't show error toast - the task may still have been sent
      }
    } else {
      // Regular task - update it directly
      console.log('📋 Sending regular task to production:', taskId);
      
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: 'production',
          previous_status: 'done',
          assigned_to: null,  // Unassign from designer
          updated_at: new Date().toISOString(),
          status_changed_at: new Date().toISOString(),
          came_from_designer_done: false  // Clear flag so it leaves FOR PRODUCTION panel
        })
        .eq('id', taskId);

      if (error) {
        console.error('Error updating task:', error);
        // Don't show error toast - the task may still have been sent
      }
    }

    // Always show success since the database trigger handles creating the operations task
    toast.success("Task sent to Production pipeline for operations team");
    await fetchTasks();
  };

  const handleDeleteFromProduction = async (taskId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ No user found');
        return;
      }

      if (!confirm("Remove this item from FOR PRODUCTION?")) {
        return;
      }

      console.log('🗑️ Removing from FOR PRODUCTION:', taskId);
      console.log('🔍 Current user:', user.id);

      // Find the task to check if it's a product or regular task
      const task = tasks.find(t => t.id === taskId) as any;
      
      console.log('🔍 Found task in state:', {
        found: !!task,
        taskId,
        isProduct: task?.is_product,
        taskStatus: task?.status,
        originalStatus: task?.original_status,
        parentTaskId: task?.parent_task_id
      });
      
      if (!task) {
        console.error('❌ Task not found in state:', taskId);
        toast.error('Item not found');
        return;
      }

      // If it's a product, delete from task_products
      if (task.is_product) {
        console.log('📦 This is a PRODUCT - deleting from task_products table');
        
        const { error: productError } = await supabase
          .from('task_products')
          .delete()
          .eq('id', taskId);

        if (productError) {
          console.error('❌ Error removing product:', productError);
          toast.error(`Failed to remove: ${productError.message}`);
          return;
        }

        console.log('✅ Product removed successfully');
        toast.success("Removed successfully");
        await fetchTasks();
      } else {
        // It's a regular task - set flag to permanently hide from FOR PRODUCTION
        // DO NOT delete it or change status, just mark as removed by admin
        console.log('📋 This is a TASK - marking as removed from FOR PRODUCTION');
        console.log('📋 Task details:', {
          taskId,
          currentStatus: task.status,
          originalStatus: task.original_status || 'done'
        });
        
        const { error: taskError } = await supabase
          .from('tasks')
          .update({ 
            admin_removed_from_production: true
          })
          .eq('id', taskId);

        if (taskError) {
          console.error('❌ Error removing task:', taskError);
          toast.error(`Failed to remove: ${taskError.message}`);
          return;
        }

        console.log('✅ Task removed from FOR PRODUCTION successfully');
        toast.success("Removed successfully");
        await fetchTasks();
      }
    } catch (error: any) {
      console.error('❌ Unexpected error removing item:', error);
      toast.error(`Failed to remove: ${error.message}`);
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
      
      {/* FOR PRODUCTION Section - Shows EXACT tasks from designer's DONE pipeline */}
      {tasks.filter(t => t.status === 'done' && !t.admin_removed_from_production).length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-lg border-2 border-blue-300 dark:border-blue-700 p-3 md:p-4 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-bold text-blue-900 dark:text-blue-100">
                FOR PRODUCTION
              </h2>
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                {tasks.filter(t => t.status === 'done' && !t.admin_removed_from_production).length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">Tasks from designer's DONE pipeline ready for production</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto">
            {tasks
              .filter(t => t.status === 'done' && !t.admin_removed_from_production)
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
                  onSendToProduction={(task) => {
                    setSendToProductionTask(task);
                    setSendToProductionDialogOpen(true);
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
                    onSendBack={column.status === 'with_client' ? (task) => {
                      setSendBackTask(task);
                      setSendBackDialogOpen(true);
                    } : undefined}
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
        isAdminDashboard={true}
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

      <SendToProductionDialog
        open={sendToProductionDialogOpen}
        onOpenChange={setSendToProductionDialogOpen}
        task={sendToProductionTask}
        onSuccess={fetchTasks}
      />
    </div>
  );
};
