import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { kpiData, periodLabel, roleType } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing time-based KPI data...");
    console.log("Role:", roleType);
    console.log("Period:", periodLabel);
    console.log("Team members:", kpiData?.length || 0);

    // Build a simple prompt focused on TIME and SPEED
    const systemPrompt = `You are a friendly team helper. Write in very simple English that anyone can understand.

Rules:
- Use simple words like "fast", "slow", "quick", "takes time"
- Keep sentences super short (5-10 words max)
- Use emojis to make it friendly
- Focus ONLY on time and speed
- Mention team member names
- Be nice and helpful
- Just 2-3 short lines each section`;

    const userPrompt = `Look at this ${roleType} team's speed for ${periodLabel}:

${JSON.stringify(kpiData, null, 2)}

Tell me in simple words:

⏱️ SPEED CHECK (who is fast, who needs help)

💡 QUICK TIP (one simple way to be faster)

Keep each point to 1-2 short sentences. Use names. Be friendly.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests. Try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits used up. Please add more credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI error:", response.status, errorText);
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const insights = data.choices?.[0]?.message?.content || "No insights right now.";

    console.log("Got time insights successfully");

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in ai-kpi-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Something went wrong";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});