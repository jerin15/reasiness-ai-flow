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

    // Build headers for the external webhook
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (webhookSecret) {
      headers['x-webhook-secret'] = webhookSecret;
    }

    // Forward the payload directly to the external webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
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
