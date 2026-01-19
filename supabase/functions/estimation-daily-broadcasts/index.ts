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

    const { broadcastType } = await req.json();

    console.log(`📊 Running ${broadcastType} broadcast...`);

    // Get all estimation team members
    const { data: estimationUsers, error: usersError } = await supabase
      .from('user_roles')
      .select('user_id, profiles:user_id(full_name)')
      .eq('role', 'estimation');

    if (usersError) throw usersError;
    if (!estimationUsers || estimationUsers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No estimation users found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let message = '';
    let title = '';

    if (broadcastType === 'morning') {
      // Morning kickoff broadcast
      const stats = await getDailyStats(supabase);
      title = '🌅 GOOD MORNING ESTIMATION TEAM!';
      message = `Today's Goal: ${stats.dailyGoal} quotations\n\nCurrent Pipeline:\n- ${stats.rfqCount} RFQs waiting\n- ${stats.inProgressCount} in progress\n- ${stats.completedToday} completed today\n\nYour Daily Quota: ${Math.ceil(stats.dailyGoal / estimationUsers.length)} quotations each\n\nLet's make it happen! 🚀`;
    } else if (broadcastType === 'progress') {
      // Progress update
      const stats = await getDailyStats(supabase);
      const percentage = Math.round((stats.completedToday / stats.dailyGoal) * 100);
      title = `📊 PROGRESS UPDATE`;
      message = `Team Progress: ${stats.completedToday}/${stats.dailyGoal} quotations (${percentage}%)\n\n`;
      
      if (stats.stuckCount > 0) {
        message += `⚠️ ${stats.stuckCount} tasks need attention (>2 hours idle)\n\n`;
      }
      
      message += `Keep pushing! 💪`;
    } else if (broadcastType === 'endofday') {
      // End of day summary
      const stats = await getDailyStats(supabase);
      const goalMet = stats.completedToday >= stats.dailyGoal;
      title = goalMet ? '🎉 DAILY GOAL ACHIEVED!' : '📊 END OF DAY SUMMARY';
      message = `Today's Results: ${stats.completedToday}/${stats.dailyGoal} quotations ${goalMet ? '✅' : ''}\n\n`;
      
      if (stats.topPerformer) {
        message += `🏆 Top Performer: ${stats.topPerformer.name} (${stats.topPerformer.count} quotations)\n\n`;
      }
      
      if (goalMet) {
        message += 'Outstanding work team! 🌟';
      } else {
        message += `Let's aim for ${stats.dailyGoal} tomorrow!`;
      }
    }

    // Send notification to all estimation users
    const notifications = estimationUsers.map(user => ({
      sender_id: estimationUsers[0].user_id, // Use first estimation user as sender
      recipient_id: user.user_id,
      title: title,
      message: message,
      priority: 'medium',
      is_broadcast: true
    }));

    await supabase.from('urgent_notifications').insert(notifications);

    console.log(`✅ Broadcast sent to ${estimationUsers.length} estimation users`);

    return new Response(
      JSON.stringify({ 
        message: 'Broadcast completed',
        type: broadcastType,
        recipientCount: estimationUsers.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in estimation-daily-broadcasts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getDailyStats(supabase: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get quotations completed today
  const { count: completedToday } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'quotation')
    .eq('status', 'done')
    .gte('completed_at', today.toISOString());

  // Get RFQs waiting
  const { count: rfqCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'quotation')
    .eq('status', 'todo')
    .is('deleted_at', null);

  // Get in progress
  const { count: inProgressCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'quotation')
    .in('status', ['supplier_quotes', 'client_approval', 'admin_approval'])
    .is('deleted_at', null);

  // Get stuck tasks (>2 hours idle)
  const { count: stuckCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'quotation')
    .in('status', ['todo', 'supplier_quotes', 'client_approval', 'admin_approval'])
    .is('deleted_at', null)
    .lt('last_activity_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  // Get top performer (most quotations completed today)
  const { data: topPerformerData } = await supabase
    .from('tasks')
    .select('assigned_to, profiles:assigned_to(full_name)')
    .eq('type', 'quotation')
    .eq('status', 'done')
    .gte('completed_at', today.toISOString())
    .order('completed_at', { ascending: false });

  let topPerformer = null;
  if (topPerformerData && topPerformerData.length > 0) {
    const counts: Record<string, { name: string; count: number }> = {};
    topPerformerData.forEach((task: any) => {
      const userId = task.assigned_to;
      const name = task.profiles?.full_name || 'Unknown';
      if (!counts[userId]) {
        counts[userId] = { name, count: 0 };
      }
      counts[userId].count++;
    });
    
    const topEntry = Object.values(counts).sort((a, b) => b.count - a.count)[0];
    if (topEntry) {
      topPerformer = topEntry;
    }
  }

  return {
    dailyGoal: 10,
    completedToday: completedToday || 0,
    rfqCount: rfqCount || 0,
    inProgressCount: inProgressCount || 0,
    stuckCount: stuckCount || 0,
    topPerformer
  };
}
