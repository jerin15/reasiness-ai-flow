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

    console.log('📊 Calculating efficiency scores...');

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id');

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw usersError;
    }

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const user of users || []) {
      // Get tasks completed in last 7 days
      const { count: completedCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .eq('status', 'done')
        .gte('completed_at', weekAgo);

      // Get daily reviews completed
      const { count: reviewsCount } = await supabase
        .from('user_daily_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('completed', true)
        .gte('review_date', weekAgo);

      // Get quick responses (tasks updated within 2 hours of creation)
      const { data: quickResponses } = await supabase
        .from('task_activity_log')
        .select('task_id')
        .eq('user_id', user.id)
        .gte('created_at', weekAgo);

      // Get abandoned tasks (no activity in 3+ days)
      const { count: abandonedCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
        .neq('status', 'done')
        .is('deleted_at', null)
        .lt('last_activity_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());

      // Calculate efficiency score
      const score = Math.max(0, 
        (completedCount || 0) * 10 +
        (reviewsCount || 0) * 5 +
        (quickResponses?.length || 0) * 3 -
        (abandonedCount || 0) * 15
      );

      // Update or create streak record
      const { data: existingStreak } = await supabase
        .from('user_activity_streaks')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Check if user was active today
      const { count: todayActivity } = await supabase
        .from('task_activity_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      let currentStreak = existingStreak?.current_streak || 0;
      let longestStreak = existingStreak?.longest_streak || 0;
      const lastActivity = existingStreak?.last_activity_date;

      if (todayActivity && todayActivity > 0) {
        if (!lastActivity || lastActivity !== today) {
          // Continuing or starting streak
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          if (lastActivity === yesterday) {
            currentStreak++;
          } else if (!lastActivity) {
            currentStreak = 1;
          } else {
            currentStreak = 1; // Streak broken, restart
          }
          longestStreak = Math.max(longestStreak, currentStreak);
        }
      } else if (lastActivity) {
        // Check if streak is broken (no activity for 2+ days)
        const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceActivity >= 2) {
          currentStreak = 0;
        }
      }

      await supabase
        .from('user_activity_streaks')
        .upsert({
          user_id: user.id,
          current_streak: currentStreak,
          longest_streak: longestStreak,
          last_activity_date: todayActivity && todayActivity > 0 ? today : lastActivity,
          total_tasks_completed: (existingStreak?.total_tasks_completed || 0) + (completedCount || 0),
          total_quick_responses: (existingStreak?.total_quick_responses || 0) + (quickResponses?.length || 0),
          efficiency_score: score,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      // Award achievements
      if (currentStreak >= 5) {
        await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_type: '5_day_streak',
            metadata: { streak: currentStreak }
          })
          .select()
          .single();
      }

      if (completedCount && completedCount >= 10) {
        await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_type: 'task_master',
            metadata: { tasks: completedCount }
          })
          .select()
          .single();
      }

      console.log(`✅ Updated score for user ${user.id}: ${score} points, ${currentStreak} day streak`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        usersProcessed: users?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in calculate-efficiency-scores:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});