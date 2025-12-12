import { supabase } from '@/integrations/supabase/client';
import { addToSyncQueue, saveTaskLocally, deleteTaskLocally } from './offlineStorage';
import { toast } from 'sonner';

export const createTaskOffline = async (taskData: any) => {
  if (!navigator.onLine) {
    // Store locally and queue for sync
    await saveTaskLocally(taskData);
    await addToSyncQueue('insert', 'tasks', taskData);
    toast.success('Task created offline. Will sync when online.');
    return { data: taskData, error: null };
  }

  // Online - create normally
  const { data, error } = await supabase.from('tasks').insert(taskData).select().single();
  if (!error && data) {
    await saveTaskLocally(data);
  }
  return { data, error };
};

export const updateTaskOffline = async (taskId: string, updates: any) => {
  if (!navigator.onLine) {
    // Store locally and queue for sync
    const taskData = { id: taskId, ...updates };
    await saveTaskLocally(taskData);
    await addToSyncQueue('update', 'tasks', taskData);
    toast.success('Task updated offline. Will sync when online.');
    return { error: null };
  }

  // Online - update normally
  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId);
  
  if (!error) {
    await saveTaskLocally({ id: taskId, ...updates });
  }
  return { error };
};

export const deleteTaskOffline = async (taskId: string) => {
  if (!navigator.onLine) {
    // Queue for sync - use soft delete instead of hard delete
    await deleteTaskLocally(taskId);
    await addToSyncQueue('soft_delete', 'tasks', { id: taskId, deleted_at: new Date().toISOString() });
    toast.success('Task deleted offline. Will sync when online.');
    return { error: null };
  }

  // Online - soft delete with audit trail instead of hard delete
  const { error } = await supabase
    .from('tasks')
    .update({ 
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);
    
  if (!error) {
    await deleteTaskLocally(taskId);
    
    // Log the deletion
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('task_audit_log').insert({
        task_id: taskId,
        action: 'soft_deleted',
        changed_by: user.id,
        old_values: null,
        new_values: { deleted_at: new Date().toISOString() },
        role: 'user'
      });
    }
  }
  return { error };
};
