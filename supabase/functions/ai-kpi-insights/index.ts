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

    // Build a comprehensive prompt for analysis
    const systemPrompt = `You are an expert business analyst for an advertising/signage company. Analyze the KPI data and provide actionable insights.

Your role is to:
1. Identify top performers and areas of concern
2. Highlight unusual patterns or anomalies
3. Suggest actionable improvements
4. Compare current vs previous period if data available

Keep responses concise but insightful. Use bullet points. Focus on business impact.
Do not use markdown headers, just plain text with bullet points.`;

    const userPrompt = `Analyze this team KPI data for ${periodLabel}:

CURRENT PERIOD DATA:
${JSON.stringify(kpiData, null, 2)}

${previousPeriodData ? `PREVIOUS PERIOD DATA FOR COMPARISON:
${JSON.stringify(previousPeriodData, null, 2)}` : 'No previous period data available for comparison.'}

Provide:
1. TOP INSIGHTS (3-4 key observations about team performance)
2. ANOMALIES (any unusual patterns - very high or low numbers)
3. TOP PERFORMERS (who is excelling and in what area)
4. AREAS OF CONCERN (what needs attention)
5. RECOMMENDATIONS (2-3 actionable suggestions)

Keep it brief and business-focused. No long explanations.`;

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
