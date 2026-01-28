import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret if provided
    const webhookSecret = Deno.env.get('INCOMING_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');
    
    if (webhookSecret && providedSecret !== webhookSecret) {
      console.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = await req.json();
    console.log('📥 Received task webhook payload:', JSON.stringify(payload, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle UPDATE action for revision notes
    if (payload.action === 'update') {
      if (!payload.external_task_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required field: external_task_id for update action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('📝 Processing update action for external_task_id:', payload.external_task_id);

      // Find the task by external_task_id
      const { data: existingTask, error: findError } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('external_task_id', payload.external_task_id)
        .single();

      if (findError || !existingTask) {
        console.error('Task not found for external_task_id:', payload.external_task_id);
        return new Response(
          JSON.stringify({ error: 'Task not found for the given external_task_id' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update the task with revision notes
      const updateData: Record<string, unknown> = {
        last_activity_at: new Date().toISOString(),
      };

      if (payload.revision_notes !== undefined) {
        updateData.revision_notes = payload.revision_notes;
      }

      // Allow updating other fields if provided
      if (payload.description !== undefined) {
        updateData.description = payload.description;
      }
      if (payload.priority !== undefined) {
        updateData.priority = payload.priority;
      }
      if (payload.due_date !== undefined) {
        updateData.due_date = payload.due_date;
      }

      const { error: updateError } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', existingTask.id);

      if (updateError) {
        console.error('Error updating task:', updateError);
        throw updateError;
      }

      console.log('✅ Task updated successfully:', existingTask.id, 'with revision notes');

      return new Response(
        JSON.stringify({ 
          success: true, 
          task_id: existingTask.id,
          message: 'Task updated with revision notes'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle CREATE action (default behavior)
    // Validate required fields for create
    if (!payload.title) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the Estimator user specifically (the one with 'estimation' role)
    const { data: estimationUsers, error: usersError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'estimation');

    if (usersError) {
      console.error('Error fetching estimation users:', usersError);
      throw usersError;
    }

    if (!estimationUsers || estimationUsers.length === 0) {
      console.error('No estimation user found to assign the task');
      return new Response(
        JSON.stringify({ error: 'No estimation user configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Assign to the first (primary) Estimator
    const assignedTo = estimationUsers[0].user_id;
    console.log('📋 Assigning task to Estimator:', assignedTo);

    // Create the task in the Estimator's RFQ pipeline
    // ALWAYS set type to 'quotation' and status to 'todo' for RFQ pipeline
    const taskData = {
      title: payload.title,
      description: payload.description || null,
      client_name: payload.client_name || null,
      supplier_name: payload.supplier_name || null,
      priority: payload.priority || 'medium',
      type: 'quotation' as const,  // Always quotation for RFQ pipeline
      status: 'todo' as const,     // Always start in todo for RFQ pipeline
      created_by: assignedTo,      // Required field - use estimation user as creator
      assigned_to: assignedTo,
      due_date: payload.due_date || null,
      source_app: payload.source_app || 'external',
      external_task_id: payload.external_task_id || null,
    };

    const { data: insertedTask, error: insertError } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting task:', insertError);
      throw insertError;
    }

    console.log('✅ Task created successfully:', insertedTask.id);

    // If products are included, insert them too
    if (payload.products && Array.isArray(payload.products) && payload.products.length > 0) {
      const productsToInsert = payload.products.map((product: any, index: number) => ({
        task_id: insertedTask.id,
        name: product.name || 'Unnamed Product',
        description: product.description || null,
        quantity: product.quantity || 1,
        unit_price: product.unit_price || null,
        position: index,
      }));

      const { error: productsError } = await supabase
        .from('task_products')
        .insert(productsToInsert);

      if (productsError) {
        console.error('Error inserting products:', productsError);
        // Don't fail the whole request, just log the error
      } else {
        console.log(`✅ Added ${productsToInsert.length} products to task`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        task_id: insertedTask.id,
        message: 'Task created successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('❌ Webhook error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});