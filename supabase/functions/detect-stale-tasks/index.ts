import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Detecting stale tasks...');

    // Get tasks not updated in 24+ hours that aren't done or deleted
    const { data: staleTasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*, assigned_to, created_by, profiles:assigned_to(full_name, email)')
      .is('deleted_at', null)
      .neq('status', 'done')
      .lt('last_activity_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (tasksError) {
      console.error('Error fetching stale tasks:', tasksError);
      throw tasksError;
    }

    console.log(`Found ${staleTasks?.length || 0} stale tasks`);

    const notifications = [];
    
    for (const task of staleTasks || []) {
      const hoursStale = Math.floor((Date.now() - new Date(task.last_activity_at).getTime()) / (1000 * 60 * 60));
      
      let priority = 'medium';
      let title = '⚠️ Task Needs Attention';
      
      if (hoursStale >= 72) {
        priority = 'urgent';
        title = '🔴 CRITICAL: Task Abandoned for 3+ Days';
      } else if (hoursStale >= 48) {
        priority = 'high';
        title = '🟠 HIGH: Task Inactive for 2+ Days';
      }

      const message = `Task: ${task.title}\n\nStatus: ${task.status}\nLast Activity: ${hoursStale} hours ago\n\n⚠️ Please update this task immediately or explain any delays.`;

      const recipientId = task.assigned_to || task.created_by;
      
      if (recipientId) {
        notifications.push({
          recipient_id: recipientId,
          sender_id: task.created_by,
          title,
          message,
          priority,
          is_broadcast: false,
          is_acknowledged: false
        });
      }
    }

    // Batch insert notifications
    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from('urgent_notifications')
        .insert(notifications);

      if (notifError) {
        console.error('Error creating notifications:', notifError);
      } else {
        console.log(`✅ Created ${notifications.length} stale task notifications`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        staleTasks: staleTasks?.length || 0,
        notificationsCreated: notifications.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in detect-stale-tasks:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});