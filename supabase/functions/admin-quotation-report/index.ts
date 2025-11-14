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

    console.log('📊 Running 7 PM admin quotation report...');

    // Get all admin users
    const { data: adminUsers, error: adminError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminError) throw adminError;

    if (!adminUsers || adminUsers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No admin users found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get quotation tasks statistics for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Count quotations worked on (status changed today)
    const { data: workedTasks, error: workedError } = await supabase
      .from('tasks')
      .select('id, title, status, assigned_to, profiles:assigned_to(full_name)')
      .eq('type', 'quotation')
      .gte('updated_at', todayISO);

    if (workedError) throw workedError;

    // Count quotations completed today
    const { data: completedTasks, error: completedError } = await supabase
      .from('tasks')
      .select('id, title, assigned_to, profiles:assigned_to(full_name)')
      .eq('type', 'quotation')
      .eq('status', 'done')
      .gte('completed_at', todayISO);

    if (completedError) throw completedError;

    const workedCount = workedTasks?.length || 0;
    const completedCount = completedTasks?.length || 0;

    // Count in-progress quotations
    const { data: inProgressTasks, error: inProgressError } = await supabase
      .from('tasks')
      .select('id')
      .eq('type', 'quotation')
      .in('status', ['in_progress', 'quotation_in_progress', 'quotation_review']);

    if (inProgressError) throw inProgressError;
    const inProgressCount = inProgressTasks?.length || 0;

    // Build report message
    const title = '📊 Daily Quotation Report (7 PM)';
    const message = `Today's Quotation Activity:\n\n✅ Completed: ${completedCount} quotations\n🔄 Worked Upon: ${workedCount} quotations\n⏳ In Progress: ${inProgressCount} quotations\n\nKeep up the great work!`;

    // Send notification to all admin users
    const notifications = adminUsers.map(admin => ({
      sender_id: adminUsers[0].user_id,
      recipient_id: admin.user_id,
      title: title,
      message: message,
      priority: 'medium',
      is_broadcast: true
    }));

    await supabase.from('urgent_notifications').insert(notifications);

    console.log(`✅ Report sent to ${adminUsers.length} admin users`);

    return new Response(
      JSON.stringify({ 
        message: 'Admin report completed',
        adminCount: adminUsers.length,
        stats: {
          completed: completedCount,
          workedUpon: workedCount,
          inProgress: inProgressCount
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in admin-quotation-report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
