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

    console.log('🤖 Applying automation rules...');

    // Get enabled automation rules
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('enabled', true);

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      throw rulesError;
    }

    console.log(`Found ${rules?.length || 0} active automation rules`);

    let totalActionsApplied = 0;

    for (const rule of rules || []) {
      // Find tasks matching this rule
      const thresholdTime = new Date(Date.now() - rule.threshold_hours * 60 * 60 * 1000).toISOString();
      
      const { data: matchingTasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*, assigned_to, created_by')
        .eq('status', rule.source_status)
        .is('deleted_at', null)
        .lt('last_activity_at', thresholdTime);

      if (tasksError) {
        console.error(`Error fetching tasks for rule ${rule.rule_name}:`, tasksError);
        continue;
      }

      console.log(`Rule "${rule.rule_name}": Found ${matchingTasks?.length || 0} matching tasks`);

      for (const task of matchingTasks || []) {
        // Update task status if target_status is specified
        if (rule.target_status && rule.target_status !== task.status) {
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ 
              status: rule.target_status,
              last_activity_at: new Date().toISOString()
            })
            .eq('id', task.id);

          if (updateError) {
            console.error(`Error updating task ${task.id}:`, updateError);
            continue;
          }

          console.log(`✅ Auto-moved task "${task.title}" from ${task.status} to ${rule.target_status}`);
        }

        // Send notifications to specified roles
        if (rule.notify_roles && rule.notify_roles.length > 0) {
          // Get users with specified roles
          const { data: usersToNotify, error: usersError } = await supabase
            .from('user_roles')
            .select('user_id')
            .in('role', rule.notify_roles);

          if (!usersError && usersToNotify && usersToNotify.length > 0) {
            const notifications = usersToNotify.map(user => ({
              recipient_id: user.user_id,
              sender_id: task.created_by,
              title: `🤖 Automated Task Update`,
              message: `Rule "${rule.rule_name}" triggered:\n\nTask: ${task.title}\nStatus: ${task.status}\nInactive for: ${rule.threshold_hours} hours\n\n${rule.target_status ? `Auto-moved to: ${rule.target_status}` : 'Please review this task.'}`,
              priority: 'medium',
              is_broadcast: false,
              is_acknowledged: false
            }));

            const { error: notifError } = await supabase
              .from('urgent_notifications')
              .insert(notifications);

            if (notifError) {
              console.error('Error creating notifications:', notifError);
            }
          }
        }

        totalActionsApplied++;
      }
    }

    console.log(`✅ Applied ${totalActionsApplied} automation actions`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        rulesProcessed: rules?.length || 0,
        actionsApplied: totalActionsApplied
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in apply-automation-rules:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});