import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This edge function has been disabled per admin request.
// The escalation alerts were cluttering the admin dashboard.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('⏸️ auto-escalate-estimation-tasks is disabled');
  return new Response(
    JSON.stringify({ message: 'Escalation disabled', count: 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
