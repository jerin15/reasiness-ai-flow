import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Maps internal estimator statuses to CRM-friendly statuses.
 * CRM columns: sent, in_progress, revision, completed, cancelled
 */
function mapToCrmStatus(internalStatus: string, isDeleted?: boolean): string {
  if (isDeleted) return 'cancelled';

  switch (internalStatus) {
    // Task just received, not yet worked on
    case 'todo':
      return 'sent';

    // Actively being worked on by estimation team
    case 'supplier_quotes':
    case 'admin_approval':
    case 'admin_cost_approval':
    case 'quotation_bill':
    case 'production':
    case 'production_pending':
    case 'mockup_pending':
    case 'mockup':
    case 'production_file':
    case 'developing':
    case 'testing':
    case 'trial_and_error':
      return 'in_progress';

    // Sent back for revision / under review
    case 'under_review':
    case 'follow_up':
      return 'revision';

    // Quotation sent to client / completed stages
    case 'with_client':
    case 'client_approval':
    case 'approval':
    case 'approved':
    case 'final_invoice':
    case 'delivery':
    case 'done':
    case 'deployed':
    case 'quotation':
      return 'completed';

    case 'rejected':
      return 'cancelled';

    default:
      return 'in_progress';
  }
}

function enrichPayloadWithCrmStatus(payload: Record<string, unknown>): Record<string, unknown> {
  // Single task update
  if (payload.status && typeof payload.status === 'string') {
    payload.crm_status = mapToCrmStatus(payload.status);
  }

  // Bulk sync
  if (Array.isArray(payload.tasks)) {
    payload.tasks = (payload.tasks as Record<string, unknown>[]).map(t => ({
      ...t,
      crm_status: mapToCrmStatus(t.status as string || ''),
    }));
  }

  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('ESTIMATOR_WEBHOOK_URL');
    const webhookSecret = Deno.env.get('ESTIMATOR_WEBHOOK_SECRET');

    if (!webhookUrl) {
      console.error('ESTIMATOR_WEBHOOK_URL not configured');
      return jsonResponse({ error: 'Webhook URL not configured' }, 500);
    }

    const payload = await req.json();
    console.log('📤 Syncing to estimator CRM:', payload.action || 'single_update');

    // Enrich payload with mapped CRM status
    const enrichedPayload = enrichPayloadWithCrmStatus(payload);

    // Build headers for the external webhook
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (webhookSecret) {
      headers['x-webhook-secret'] = webhookSecret;
    }

    // Forward the enriched payload to the external webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(enrichedPayload),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      console.error('❌ Estimator CRM webhook failed:', response.status, responseText);
      return jsonResponse({
        error: 'Webhook request failed',
        status: response.status,
        response: responseData,
      }, response.status);
    }

    console.log('✅ Synced to estimator CRM successfully');
    return jsonResponse({
      success: true,
      message: 'Synced to estimator CRM',
      response: responseData,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('❌ Error syncing to estimator CRM:', error);
    return jsonResponse({ error: errorMessage }, 500);
  }
});
