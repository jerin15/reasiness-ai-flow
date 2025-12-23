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

    console.log("Analyzing detailed KPI data...");
    console.log("Role:", roleType);
    console.log("Period:", periodLabel);
    console.log("Team members:", kpiData?.length || 0);

    // Build detailed analysis prompt
    const systemPrompt = `You are a work analyst. Look at the data and tell everyone how they are doing. 

Write in simple English:
- Use names
- Talk about time taken (use the formatted times given)
- Say who is fast and who could be faster
- Give specific numbers
- Be helpful and fair
- Keep each point short (1-2 lines)`;

    const userPrompt = `Here is the ${roleType || 'team'} data for ${periodLabel}:

${JSON.stringify(kpiData, null, 2)}

Write a detailed analysis for EACH person. Include:

📊 **Individual Breakdown:**
(For each person, say: their name, how many tasks they did, their average time, and if they are fast/normal/slow)

⏱️ **Time Comparison:**
(Who is the fastest? Who takes the longest? Give actual times)

💡 **Tips:**
(2 specific things the slower people can do to speed up)

Be specific. Use the actual numbers and times from the data. Mention everyone by name.`;

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

    console.log("Got detailed insights successfully");

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