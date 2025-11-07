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

    console.log('🔔 Starting hourly estimation team reminder check...');

    // Get all estimation team members
    const { data: estimationUsers, error: usersError } = await supabase
      .from('user_roles')
      .select('user_id, profiles!inner(id, full_name, email)')
      .eq('role', 'estimation');

    if (usersError) {
      console.error('Error fetching estimation users:', usersError);
      throw usersError;
    }

    console.log(`📊 Found ${estimationUsers?.length || 0} estimation team members`);

    // For each estimation team member, check their pending tasks
    for (const userRole of estimationUsers || []) {
      const userId = userRole.user_id;
      const profile = userRole.profiles as any;

      // Count pending tasks by type
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, type, priority, due_date, client_name')
        .eq('assigned_to', userId)
        .not('status', 'in', '(done,pending_invoices,quotation_bill)')
        .is('deleted_at', null);

      if (tasksError) {
        console.error(`Error fetching tasks for user ${userId}:`, tasksError);
        continue;
      }

      // Group tasks by type
      const quotationTasks = tasks?.filter(t => t.type === 'quotation') || [];
      const invoiceTasks = tasks?.filter(t => t.type === 'invoice') || [];
      const generalTasks = tasks?.filter(t => t.type === 'general') || [];

      const totalPending = tasks?.length || 0;

      if (totalPending > 0) {
        console.log(`📋 User ${profile.full_name} has ${totalPending} pending tasks`);
        console.log(`  - Quotations: ${quotationTasks.length}`);
        console.log(`  - Invoices: ${invoiceTasks.length}`);
        console.log(`  - General: ${generalTasks.length}`);

        // Create a reminder notification in task_reminders table
        const reminderTime = new Date();
        reminderTime.setHours(reminderTime.getHours() + 1); // Next hour

        // Insert individual reminders for high priority tasks
        const highPriorityTasks = tasks?.filter(t => t.priority === 'high') || [];
        
        for (const task of highPriorityTasks) {
          const { error: reminderError } = await supabase
            .from('task_reminders')
            .insert({
              task_id: task.id,
              user_id: userId,
              reminder_time: reminderTime.toISOString(),
              is_dismissed: false,
              is_snoozed: false
            });

          if (reminderError) {
            console.error(`Error creating reminder for task ${task.id}:`, reminderError);
          }
        }

        // Log summary
        console.log(`✅ Created reminders for ${highPriorityTasks.length} high priority tasks for ${profile.full_name}`);
      } else {
        console.log(`✨ User ${profile.full_name} has no pending tasks`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Hourly estimation reminders processed',
        usersProcessed: estimationUsers?.length || 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error('❌ Error in hourly-estimation-reminder:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
