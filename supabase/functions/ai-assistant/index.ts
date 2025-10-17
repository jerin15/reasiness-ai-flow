import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get user's tasks
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    // Fetch user's tasks
    const { data: tasks } = await supabaseClient
      .from("tasks")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const urgentTasks = tasks?.filter((t) => t.priority === "urgent") || [];
    const pendingTasks = tasks?.filter((t) => t.status !== "done") || [];

    const systemPrompt = `You are a helpful AI assistant for R-EAsiness, a task management system for REA Creative Agency. 

Current user's task summary:
- Total active tasks: ${pendingTasks.length}
- Urgent tasks: ${urgentTasks.length}
- Tasks by status: ${tasks?.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)}

${
  urgentTasks.length > 0
    ? `URGENT TASKS requiring attention:\n${urgentTasks
        .map((t) => `- ${t.title} (${t.status})`)
        .join("\n")}`
    : ""
}

Your role:
1. Help users understand their task status
2. Remind them of urgent and pending items
3. Provide insights about workload
4. Suggest task prioritization
5. Answer questions about their tasks

Be concise, friendly, and action-oriented.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ message: assistantMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
