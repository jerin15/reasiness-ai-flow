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

    const { reviewType } = await req.json().catch(() => ({ reviewType: 'morning' }));

    console.log(`📋 Scheduling ${reviewType} daily reviews...`);

    // Get all active users (who have tasks)
    const { data: activeUsers, error: usersError } = await supabase
      .from('tasks')
      .select('assigned_to, created_by')
      .is('deleted_at', null)
      .neq('status', 'done');

    if (usersError) {
      console.error('Error fetching active users:', usersError);
      throw usersError;
    }

    // Get unique user IDs
    const userIds = new Set();
    activeUsers?.forEach(task => {
      if (task.assigned_to) userIds.add(task.assigned_to);
      if (task.created_by) userIds.add(task.created_by);
    });

    console.log(`Found ${userIds.size} active users`);

    const today = new Date().toISOString().split('T')[0];

    // Check who hasn't completed today's review
    const { data: completedReviews, error: reviewsError } = await supabase
      .from('user_daily_reviews')
      .select('user_id')
      .eq('review_date', today)
      .eq('completed', true);

    if (reviewsError) {
      console.error('Error fetching completed reviews:', reviewsError);
    }

    const completedUserIds = new Set(completedReviews?.map(r => r.user_id) || []);

    // Create notifications for users who haven't reviewed
    const notifications = [];
    
    for (const userId of userIds) {
      if (!completedUserIds.has(userId)) {
        // Ensure review record exists
        await supabase
          .from('user_daily_reviews')
          .upsert({
            user_id: userId,
            review_date: today,
            completed: false,
            tasks_reviewed: 0
          }, { onConflict: 'user_id,review_date' });

        // Get user's pending task count
        const { count } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .or(`assigned_to.eq.${userId},created_by.eq.${userId}`)
          .is('deleted_at', null)
          .neq('status', 'done');

        notifications.push({
          recipient_id: userId,
          sender_id: userId,
          title: reviewType === 'morning' ? '☀️ Morning Task Review Required' : '🌙 Evening Task Review Required',
          message: `${reviewType === 'morning' ? 'Good morning!' : 'Good evening!'}\n\nYou have ${count || 0} active tasks.\n\n✅ Please review your tasks:\n• Update status of any in-progress tasks\n• Mark completed tasks as done\n• Check for urgent items\n• Plan your priorities\n\n⚠️ This review cannot be dismissed until completed.`,
          priority: 'high',
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
        console.error('Error creating review notifications:', notifError);
      } else {
        console.log(`✅ Sent ${notifications.length} daily review reminders`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        remindersSent: notifications.length,
        reviewType
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in schedule-daily-reviews:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});