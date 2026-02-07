import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Valid task statuses in the app's enum
const VALID_TASK_STATUSES = [
  'todo', 'supplier_quotes', 'client_approval', 'admin_approval',
  'quotation_bill', 'production', 'final_invoice', 'done',
  'mockup', 'with_client', 'new_calls', 'follow_up', 'quotation',
  'developing', 'testing', 'under_review', 'deployed', 'trial_and_error', 'approval', 'delivery'
];

function initSupabase() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

function verifySecret(req: Request): boolean {
  const webhookSecret = Deno.env.get('INCOMING_WEBHOOK_SECRET');
  const providedSecret = req.headers.get('x-webhook-secret');
  if (webhookSecret && providedSecret !== webhookSecret) {
    console.error('Invalid webhook secret');
    return false;
  }
  return true;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── UPDATE handler ──────────────────────────────────────────────────────
async function handleUpdate(payload: Record<string, unknown>) {
  if (!payload.external_task_id) {
    return jsonResponse({ error: 'Missing required field: external_task_id for update action' }, 400);
  }

  const supabase = initSupabase();
  console.log('📝 Processing update action for external_task_id:', payload.external_task_id);

  // Try mockup_tasks first
  const mockupUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.revision_notes !== undefined) mockupUpdate.revision_notes = payload.revision_notes;

  const { data: mockupTask } = await supabase
    .from('mockup_tasks')
    .update(mockupUpdate)
    .eq('external_task_id', payload.external_task_id)
    .select()
    .maybeSingle();

  if (mockupTask) {
    console.log('✅ Mockup task updated:', mockupTask.id);
    return jsonResponse({ success: true, task_id: mockupTask.id, pipeline: 'mockup', message: 'Mockup task updated' });
  }

  // Fallback to regular tasks table
  const { data: existingTask, error: findError } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('external_task_id', payload.external_task_id)
    .maybeSingle();

  if (findError || !existingTask) {
    console.error('Task not found for external_task_id:', payload.external_task_id);
    return jsonResponse({ error: 'Task not found for the given external_task_id' }, 404);
  }

  const updateData: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  if (payload.revision_notes !== undefined) updateData.revision_notes = payload.revision_notes;
  if (payload.description !== undefined) updateData.description = payload.description;
  if (payload.priority !== undefined) updateData.priority = payload.priority;
  if (payload.due_date !== undefined) updateData.due_date = payload.due_date;
  if (payload.category !== undefined) updateData.category = payload.category;
  if (payload.origin_label !== undefined) updateData.origin_label = payload.origin_label;
  if (payload.source_origin !== undefined) updateData.source_origin = payload.source_origin;
  if (payload.task_type !== undefined) updateData.task_type = payload.task_type;

  // Only update status if the CRM value maps to a valid app enum
  if (payload.status !== undefined && typeof payload.status === 'string') {
    if (VALID_TASK_STATUSES.includes(payload.status)) {
      updateData.status = payload.status;
      updateData.status_changed_at = new Date().toISOString();
    } else {
      console.warn('⚠️ Ignoring unknown status from CRM:', payload.status);
    }
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', existingTask.id);

  if (updateError) {
    console.error('Error updating task:', updateError);
    throw updateError;
  }

  console.log('✅ Task updated:', existingTask.id);
  return jsonResponse({ success: true, task_id: existingTask.id, pipeline: 'quotation', message: 'Task updated' });
}

// ── CREATE: Design / Mockup ─────────────────────────────────────────────
async function handleCreateDesign(payload: Record<string, unknown>) {
  const supabase = initSupabase();
  console.log('🎨 Routing to MOCKUP pipeline for JAIRAJ');

  const { data: mockupTask, error } = await supabase
    .from('mockup_tasks')
    .upsert({
      title: payload.title,
      description: payload.description || null,
      client_name: payload.client_name || null,
      priority: payload.priority || 'medium',
      design_type: payload.design_type || 'mockup',
      due_date: payload.due_date || null,
      source_app: payload.source_app || 'REA FLOW',
      external_task_id: payload.external_task_id || null,
      status: 'pending',
      assigned_to: 'JAIRAJ',
    }, { onConflict: 'external_task_id' })
    .select()
    .single();

  if (error) {
    console.error('Error inserting mockup task:', error);
    return jsonResponse({ error: error.message }, 500);
  }

  console.log('✅ Mockup task created:', mockupTask.id);
  return jsonResponse({ success: true, task_id: mockupTask.id, pipeline: 'mockup', message: 'Mockup task created for JAIRAJ' });
}

// ── CREATE: Regular quotation task ──────────────────────────────────────
async function handleCreateQuotation(payload: Record<string, unknown>) {
  const supabase = initSupabase();
  console.log('📋 Routing to QUOTATION pipeline');

  if (!payload.title) {
    return jsonResponse({ error: 'Missing required field: title' }, 400);
  }

  // Find estimation user
  const { data: estimationUsers, error: usersError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'estimation');

  if (usersError) throw usersError;
  if (!estimationUsers?.length) {
    return jsonResponse({ error: 'No estimation user configured' }, 500);
  }

  const assignedTo = estimationUsers[0].user_id;
  console.log('📋 Assigning task to Estimator:', assignedTo);

  const taskData = {
    title: payload.title as string,
    description: (payload.description as string) || null,
    client_name: (payload.client_name as string) || null,
    supplier_name: (payload.supplier_name as string) || null,
    priority: (payload.priority as string) || 'medium',
    type: 'quotation' as const,
    status: 'todo' as const,
    created_by: assignedTo,
    assigned_to: assignedTo,
    due_date: (payload.due_date as string) || null,
    source_app: (payload.source_app as string) || 'external',
    external_task_id: (payload.external_task_id as string) || null,
    // New CRM differentiation fields
    source_origin: (payload.source_origin as string) || null,
    task_type: (payload.task_type as string) || null,
    origin_label: (payload.origin_label as string) || null,
    category: (payload.category as string) || null,
  };

  const { data: insertedTask, error: insertError } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single();

  if (insertError) throw insertError;
  console.log('✅ Task created:', insertedTask.id);

  // Insert products if provided
  if (Array.isArray(payload.products) && (payload.products as any[]).length > 0) {
    const productsToInsert = (payload.products as any[]).map((product: any, index: number) => ({
      task_id: insertedTask.id,
      name: product.name || 'Unnamed Product',
      description: product.description || null,
      quantity: product.quantity || 1,
      unit_price: product.unit_price || null,
      position: index,
    }));

    const { error: productsError } = await supabase.from('task_products').insert(productsToInsert);
    if (productsError) {
      console.error('Error inserting products:', productsError);
    } else {
      console.log(`✅ Added ${productsToInsert.length} products to task`);
    }
  }

  return jsonResponse({
    success: true,
    task_id: insertedTask.id,
    pipeline: 'quotation',
    message: 'Task created successfully',
  });
}

// ── Main handler ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!verifySecret(req)) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const payload = await req.json();
    console.log('📥 Received task webhook payload:', JSON.stringify(payload, null, 2));

    // Route by action
    if (payload.action === 'update') {
      return await handleUpdate(payload);
    }

    // Route by type for CREATE
    const isDesignTask = payload.type === 'design' || payload.assigned_to_pipeline === 'mockup';
    if (isDesignTask) {
      return await handleCreateDesign(payload);
    }

    return await handleCreateQuotation(payload);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('❌ Webhook error:', error);
    return jsonResponse({ error: errorMessage }, 500);
  }
});
