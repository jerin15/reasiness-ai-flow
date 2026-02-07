import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Calls our edge function proxy which forwards to the estimator CRM webhook.
 */
async function callSyncFunction(payload: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-to-estimator-crm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

/**
 * Hook that:
 * 1. On mount, performs a bulk sync of ALL tasks where source_app = 'REA FLOW'
 * 2. Subscribes to realtime changes on those tasks and pushes updates automatically
 */
export function useEstimatorSync(currentUserId: string | undefined) {
  const hasSynced = useRef(false);

  // Bulk sync on startup
  useEffect(() => {
    if (!currentUserId || hasSynced.current) return;

    const doBulkSync = async () => {
      try {
        const { data: tasks, error } = await supabase
          .from('tasks')
          .select('external_task_id, status, category, revision_notes')
          .eq('source_app', 'REA FLOW')
          .not('external_task_id', 'is', null)
          .is('deleted_at', null);

        if (error) {
          console.error('Failed to fetch REA FLOW tasks for bulk sync:', error);
          return;
        }

        if (!tasks || tasks.length === 0) {
          console.log('No REA FLOW tasks to sync');
          hasSynced.current = true;
          return;
        }

        const bulkPayload = {
          action: 'bulk_sync',
          tasks: tasks.map(t => ({
            external_task_id: t.external_task_id,
            status: t.status,
            category: t.category || undefined,
            notes: t.revision_notes || undefined,
          })),
        };

        console.log(`📤 Bulk syncing ${tasks.length} REA FLOW tasks to estimator CRM`);
        const result = await callSyncFunction(bulkPayload);
        console.log('📤 Bulk sync result:', result);
        hasSynced.current = true;
      } catch (err) {
        console.error('Bulk sync error:', err);
      }
    };

    // Delay slightly to not block initial render
    const timer = setTimeout(doBulkSync, 3000);
    return () => clearTimeout(timer);
  }, [currentUserId]);

  // Subscribe to realtime changes on tasks where source_app = 'REA FLOW'
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('estimator-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
        },
        async (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;

          // Only sync tasks from REA FLOW with an external ID
          if (newRow.source_app !== 'REA FLOW' || !newRow.external_task_id) return;

          // Check if relevant fields changed
          const statusChanged = oldRow.status !== newRow.status;
          const categoryChanged = oldRow.category !== newRow.category;
          const notesChanged = oldRow.revision_notes !== newRow.revision_notes;

          if (!statusChanged && !categoryChanged && !notesChanged) return;

          const updatePayload: Record<string, unknown> = {
            external_task_id: newRow.external_task_id,
          };
          if (statusChanged) updatePayload.status = newRow.status;
          if (categoryChanged) updatePayload.category = newRow.category;
          if (notesChanged) updatePayload.notes = newRow.revision_notes;

          console.log('📤 Syncing task update to estimator CRM:', updatePayload);
          try {
            const result = await callSyncFunction(updatePayload);
            console.log('📤 Sync result:', result);
          } catch (err) {
            console.error('Failed to sync task update:', err);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Manual sync function for imperative use
  const syncTaskUpdate = useCallback(async (task: {
    external_task_id: string;
    status?: string;
    category?: string;
    revision_notes?: string;
  }) => {
    if (!task.external_task_id) return;

    const payload: Record<string, unknown> = {
      external_task_id: task.external_task_id,
    };
    if (task.status) payload.status = task.status;
    if (task.category) payload.category = task.category;
    if (task.revision_notes) payload.notes = task.revision_notes;

    try {
      const result = await callSyncFunction(payload);
      console.log('📤 Manual sync result:', result);
      return result;
    } catch (err) {
      console.error('Manual sync error:', err);
      throw err;
    }
  }, []);

  return { syncTaskUpdate };
}
