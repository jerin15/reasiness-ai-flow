import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting report generation...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all completed tasks from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        *,
        creator:profiles!tasks_created_by_fkey(full_name, email),
        assignee:profiles!tasks_assigned_to_fkey(full_name, email)
      `)
      .eq('status', 'done')
      .gte('completed_at', sevenDaysAgo.toISOString())
      .order('completed_at', { ascending: false });

    if (tasksError) throw tasksError;

    console.log(`Found ${tasks?.length || 0} completed tasks`);

    // Generate CSV content
    const csvHeaders = [
      'ID', 'Title', 'Type', 'Priority', 'Client', 'Supplier',
      'Created By', 'Assigned To', 'Created At', 'Completed At', 'Description'
    ];
    
    const csvRows = tasks?.map(task => [
      task.id,
      `"${task.title.replace(/"/g, '""')}"`,
      task.type || 'general',
      task.priority,
      task.client_name || 'N/A',
      task.supplier_name || 'N/A',
      task.creator?.full_name || task.creator?.email || 'Unknown',
      task.assignee?.full_name || task.assignee?.email || 'Unassigned',
      new Date(task.created_at).toLocaleDateString(),
      task.completed_at ? new Date(task.completed_at).toLocaleDateString() : 'N/A',
      `"${(task.description || '').replace(/"/g, '""')}"`
    ].join(',')) || [];

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

    // Generate simple text report
    const reportDate = new Date().toISOString().split('T')[0];
    const textReport = `
COMPLETED TASKS REPORT
Generated: ${new Date().toLocaleString()}
Period: Last 7 days

Total Completed Tasks: ${tasks?.length || 0}

SUMMARY BY TYPE:
${generateSummary(tasks || [], 'type')}

SUMMARY BY PRIORITY:
${generateSummary(tasks || [], 'priority')}

SUMMARY BY USER:
${generateUserSummary(tasks || [])}

DETAILED TASKS:
${tasks?.map(task => `
- ${task.title}
  Type: ${task.type || 'general'}
  Priority: ${task.priority}
  Client: ${task.client_name || 'N/A'}
  Completed: ${task.completed_at ? new Date(task.completed_at).toLocaleString() : 'N/A'}
  Assigned to: ${task.assignee?.full_name || task.assignee?.email || 'Unassigned'}
`).join('\n') || 'No tasks'}
`;

    // Store reports in storage
    const timestamp = Date.now();
    
    // Upload CSV
    const { error: csvError } = await supabase.storage
      .from('task-reports')
      .upload(`reports/completed-tasks-${reportDate}-${timestamp}.csv`, csvContent, {
        contentType: 'text/csv',
        upsert: true
      });

    if (csvError) {
      console.error('CSV upload error:', csvError);
      throw csvError;
    }

    // Upload text report
    const { error: txtError } = await supabase.storage
      .from('task-reports')
      .upload(`reports/completed-tasks-${reportDate}-${timestamp}.txt`, textReport, {
        contentType: 'text/plain',
        upsert: true
      });

    if (txtError) {
      console.error('Text report upload error:', txtError);
      throw txtError;
    }

    console.log('Reports generated and stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reports generated successfully',
        taskCount: tasks?.length || 0,
        csvFile: `completed-tasks-${reportDate}-${timestamp}.csv`,
        txtFile: `completed-tasks-${reportDate}-${timestamp}.txt`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: any) {
    console.error('Error generating reports:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'Unknown error',
        details: error?.toString() || 'No details available'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

function generateSummary(tasks: any[], field: string): string {
  const counts: Record<string, number> = {};
  tasks.forEach(task => {
    const value = task[field] || 'N/A';
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([key, count]) => `  ${key}: ${count}`)
    .join('\n');
}

function generateUserSummary(tasks: any[]): string {
  const counts: Record<string, number> = {};
  tasks.forEach(task => {
    const user = task.assignee?.full_name || task.assignee?.email || 'Unassigned';
    counts[user] = (counts[user] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([user, count]) => `  ${user}: ${count}`)
    .join('\n');
}