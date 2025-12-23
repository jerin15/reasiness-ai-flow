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
    const { kpiData, periodLabel, previousPeriodData } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing KPI data for insights...");
    console.log("Current period:", periodLabel);
    console.log("Users count:", kpiData?.length || 0);

    // Build a simple, easy-to-understand prompt
    const systemPrompt = `You are a friendly team performance coach. Write in simple, everyday English that anyone can understand. Avoid business jargon.

Rules:
- Use simple words (e.g. "finished" not "completed", "sent" not "dispatched")
- Keep sentences short
- Use emojis to make it friendly
- Be encouraging and positive
- Only give 2 short sections: "What's Going Well" and "Quick Tips"`;

    const userPrompt = `Look at this team's work for ${periodLabel} and tell me in simple words:

Team Data:
${JSON.stringify(kpiData, null, 2)}

Give me only 2 things:

🌟 WHAT'S GOING WELL (2-3 good things about the team, mention names)

💡 QUICK TIPS (2 simple suggestions to do better)

Keep it super short and easy to read. Use everyday words.`;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const insights = data.choices?.[0]?.message?.content || "Unable to generate insights.";

    console.log("Successfully generated KPI insights");

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in ai-kpi-insights:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate insights";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
