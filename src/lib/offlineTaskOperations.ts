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
    // Queue for sync
    await deleteTaskLocally(taskId);
    await addToSyncQueue('delete', 'tasks', { id: taskId });
    toast.success('Task deleted offline. Will sync when online.');
    return { error: null };
  }

  // Online - delete normally
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (!error) {
    await deleteTaskLocally(taskId);
  }
  return { error };
};
