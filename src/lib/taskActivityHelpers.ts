import { supabase } from "@/integrations/supabase/client";

export interface QuickActionData {
  action: string;
  details: any;
  created_at: string;
  user_id: string;
  profiles?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface TaskActivity {
  id: string;
  action: string;
  details: any;
  created_at: string;
  user_id: string;
  task_id: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
  tasks: {
    title: string;
    status: string;
  };
}

export async function getLatestQuickAction(taskId: string): Promise<QuickActionData | null> {
  const { data, error } = await supabase
    .from('task_activity_log')
    .select('action, details, created_at, user_id, profiles!task_activity_log_user_id_fkey(full_name, avatar_url)')
    .eq('task_id', taskId)
    .not('details->quick_action', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as any;
}

export async function getRecentTeamActivities(limit: number = 20): Promise<TaskActivity[]> {
  const { data, error } = await supabase
    .from('task_activity_log')
    .select(`
      id,
      action,
      details,
      created_at,
      user_id,
      task_id,
      profiles!task_activity_log_user_id_fkey(full_name, avatar_url),
      tasks!task_activity_log_task_id_fkey(title, status)
    `)
    .not('details->quick_action', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as any;
}

export async function getTaskActivityTimeline(taskId: string): Promise<TaskActivity[]> {
  const { data, error } = await supabase
    .from('task_activity_log')
    .select(`
      id,
      action,
      details,
      created_at,
      user_id,
      task_id,
      profiles!task_activity_log_user_id_fkey(full_name, avatar_url),
      tasks!task_activity_log_task_id_fkey(title, status)
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as any;
}

export async function getQuickActionStats() {
  const { data, error } = await supabase
    .from('task_activity_log')
    .select('details')
    .not('details->quick_action', 'is', null)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error || !data) {
    return {
      workingOnIt: 0,
      waiting: 0,
      needHelp: 0,
      almostDone: 0,
      notesAdded: 0,
    };
  }

  const stats = {
    workingOnIt: 0,
    waiting: 0,
    needHelp: 0,
    almostDone: 0,
    notesAdded: 0,
  };

  data.forEach((item: any) => {
    const quickAction = item.details?.quick_action;
    switch (quickAction) {
      case 'working_on_it':
        stats.workingOnIt++;
        break;
      case 'waiting_for_client':
        stats.waiting++;
        break;
      case 'help_requested':
        stats.needHelp++;
        break;
      case 'almost_done':
        stats.almostDone++;
        break;
      default:
        if (item.action === 'commented') {
          stats.notesAdded++;
        }
    }
  });

  return stats;
}

export function getQuickActionDisplay(quickAction: string) {
  switch (quickAction) {
    case 'working_on_it':
      return { label: 'Working On It', color: 'bg-green-500', icon: '🟢' };
    case 'waiting_for_client':
      return { label: 'Waiting', color: 'bg-yellow-500', icon: '🟡' };
    case 'help_requested':
      return { label: 'Need Help', color: 'bg-red-500 animate-pulse', icon: '🔴' };
    case 'almost_done':
      return { label: 'Almost Done', color: 'bg-blue-500', icon: '🔵' };
    default:
      return { label: 'Note Added', color: 'bg-gray-500', icon: '💬' };
  }
}
