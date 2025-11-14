import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StuckTask {
  id: string;
  title: string;
  status: string;
  assigned_to: string;
  hours_idle: number;
  time_limit: number;
  assigned_user_name: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Checking for stuck estimation quotation tasks...');

    // Get all stuck quotation tasks in critical stages
    const { data: stuckTasks, error: tasksError } = await supabase
      .rpc('get_stuck_quotation_tasks');

    if (tasksError) {
      console.error('Error fetching stuck tasks:', tasksError);
      throw tasksError;
    }

    if (!stuckTasks || stuckTasks.length === 0) {
      console.log('✅ No stuck tasks found');
      return new Response(
        JSON.stringify({ message: 'No stuck tasks', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`⚠️ Found ${stuckTasks.length} stuck quotation tasks`);

    // Process each stuck task
    for (const task of stuckTasks as StuckTask[]) {
      const hoursIdle = task.hours_idle;
      console.log(`Processing task: ${task.title} (${hoursIdle.toFixed(1)}h idle)`);

      // Escalation ladder based on idle time
      if (hoursIdle >= 5) {
        // 5+ hours: AUTO-REASSIGN to least busy estimation member
        await handleAutoReassignment(supabase, task);
      } else if (hoursIdle >= 4) {
        // 4+ hours: BROADCAST to all estimation team
        await handleBroadcastAlert(supabase, task);
      } else if (hoursIdle >= 3) {
        // 3+ hours: ADMIN ALERT
        await handleAdminAlert(supabase, task);
      } else if (hoursIdle >= 2) {
        // 2+ hours: URGENT NOTIFICATION to assignee
        await handleUrgentNotification(supabase, task);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Escalation completed', 
        tasksProcessed: stuckTasks.length,
        tasks: stuckTasks.map((t: StuckTask) => ({ title: t.title, hoursIdle: t.hours_idle }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in auto-escalate-estimation-tasks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleUrgentNotification(supabase: any, task: StuckTask) {
  console.log(`📢 Sending urgent notification for task: ${task.title}`);
  
  await supabase.from('urgent_notifications').insert({
    sender_id: task.assigned_to,
    recipient_id: task.assigned_to,
    title: '🚨 URGENT: Quotation Task Stuck >2 Hours',
    message: `TASK: ${task.title}\n\nSTATUS: ${task.status}\nIDLE TIME: ${task.hours_idle.toFixed(1)} hours\nLIMIT: ${task.time_limit} hours\n\n⚠️ This task is approaching the time limit. Please take immediate action!`,
    priority: 'urgent',
    is_broadcast: false
  });
}

async function handleAdminAlert(supabase: any, task: StuckTask) {
  console.log(`🔔 Sending admin alert for task: ${task.title}`);
  
  // Get all admin and technical_head users
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', ['admin', 'technical_head']);

  if (admins && admins.length > 0) {
    const notifications = admins.map((admin: { user_id: string }) => ({
      sender_id: task.assigned_to,
      recipient_id: admin.user_id,
      title: '⚠️ ADMIN ALERT: Quotation Task Stuck >3 Hours',
      message: `TASK: ${task.title}\nASSIGNED TO: ${task.assigned_user_name}\n\nSTATUS: ${task.status}\nIDLE TIME: ${task.hours_idle.toFixed(1)} hours\nLIMIT: ${task.time_limit} hours\n\n🔴 This task requires admin intervention. Consider reassigning or providing support.`,
      priority: 'high',
      is_broadcast: false
    }));

    await supabase.from('urgent_notifications').insert(notifications);
  }
}

async function handleBroadcastAlert(supabase: any, task: StuckTask) {
  console.log(`📣 Broadcasting alert to all estimation team for task: ${task.title}`);
  
  // Get all estimation team members
  const { data: estimationUsers } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'estimation');

  if (estimationUsers && estimationUsers.length > 0) {
    const notifications = estimationUsers.map((user: { user_id: string }) => ({
      sender_id: task.assigned_to,
      recipient_id: user.user_id,
      title: '🚨 TEAM ALERT: Quotation Task Stuck >4 Hours',
      message: `TASK: ${task.title}\nCURRENTLY WITH: ${task.assigned_user_name}\n\nSTATUS: ${task.status}\nIDLE TIME: ${task.hours_idle.toFixed(1)} hours\n\n📢 Can anyone help move this task forward? It's been stuck for over 4 hours.`,
      priority: 'urgent',
      is_broadcast: true
    }));

    await supabase.from('urgent_notifications').insert(notifications);
  }
}

async function handleAutoReassignment(supabase: any, task: StuckTask) {
  console.log(`🔄 Auto-reassigning task: ${task.title}`);
  
  // Find least busy estimation team member
  const { data: leastBusy } = await supabase
    .rpc('get_least_busy_estimation_member')
    .single();

  if (leastBusy && leastBusy.user_id !== task.assigned_to) {
    // Update task assignment
    await supabase
      .from('tasks')
      .update({ 
        assigned_to: leastBusy.user_id,
        last_activity_at: new Date().toISOString()
      })
      .eq('id', task.id);

    // Notify old assignee
    await supabase.from('urgent_notifications').insert({
      sender_id: leastBusy.user_id,
      recipient_id: task.assigned_to,
      title: '🔄 Task Auto-Reassigned Due to Inactivity',
      message: `TASK: ${task.title}\n\nThis task has been idle for ${task.hours_idle.toFixed(1)} hours and has been reassigned to ${leastBusy.full_name} to ensure timely completion.`,
      priority: 'high',
      is_broadcast: false
    });

    // Notify new assignee
    await supabase.from('urgent_notifications').insert({
      sender_id: task.assigned_to,
      recipient_id: leastBusy.user_id,
      title: '📥 New Quotation Task Auto-Assigned',
      message: `TASK: ${task.title}\n\nSTATUS: ${task.status}\n\nThis task was stuck with ${task.assigned_user_name} for ${task.hours_idle.toFixed(1)} hours and needs immediate attention.`,
      priority: 'urgent',
      is_broadcast: false
    });

    console.log(`✅ Task reassigned from ${task.assigned_user_name} to ${leastBusy.full_name}`);
  }
}
