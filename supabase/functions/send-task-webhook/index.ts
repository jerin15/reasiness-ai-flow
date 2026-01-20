import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('TARGET_WEBHOOK_URL');
    const webhookSecret = Deno.env.get('TARGET_WEBHOOK_SECRET');

    if (!webhookUrl) {
      console.error('TARGET_WEBHOOK_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json();
    console.log('📤 Sending task to webhook:', JSON.stringify(payload, null, 2));

    // Initialize Supabase client to get task details if only task_id provided
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let taskData = payload;

    // If task_id is provided, fetch full task details
    if (payload.task_id && !payload.title) {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', payload.task_id)
        .single();

      if (taskError) {
        console.error('Error fetching task:', taskError);
        throw taskError;
      }

      // Also fetch products
      const { data: products } = await supabase
        .from('task_products')
        .select('*')
        .eq('task_id', payload.task_id)
        .order('position');

      taskData = {
        ...task,
        products: products || [],
        source_app: 'reassist',
        external_task_id: task.id,
      };
    }

    // Add source info
    taskData.source_app = taskData.source_app || 'reassist';
    taskData.sent_at = new Date().toISOString();

    // Send to target webhook
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhookSecret) {
      headers['x-webhook-secret'] = webhookSecret;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(taskData),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Webhook request failed:', response.status, responseText);
      return new Response(
        JSON.stringify({ 
          error: 'Webhook request failed', 
          status: response.status,
          response: responseData 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Task sent successfully to webhook');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Task sent to target app',
        response: responseData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('❌ Error sending webhook:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
