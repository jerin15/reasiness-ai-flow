import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const { input, userId } = await req.json();
    
    if (!input || !userId) {
      return new Response(JSON.stringify({ error: "Missing input or userId" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const currentDate = new Date().toISOString().split('T')[0];
    const systemPrompt = `You are a task parser for REAHUB - ANIMA Tech. Extract task details from natural language input.
Current date: ${currentDate}

Available fields:
- title (required): Brief, clear task name
- description: Detailed information about the task
- client_name: Client or company name (e.g., "Al Ain Zoo", "GULFTAINER", "Al Bustan")
- supplier_name: Supplier name if mentioned (e.g., "Al Baraka")
- priority: Must be one of: "low", "medium", "high", "urgent"
- type: Must be one of: "quotation", "invoice", "design", "general", "production"
- due_date: Parse dates intelligently:
  - "tomorrow" -> next day
  - "Friday", "next Friday" -> specific day
  - "in 3 days", "3 days from now" -> calculated date
  - "end of week" -> this coming Friday
  - "end of month" -> last day of current month
  Format as ISO date string (YYYY-MM-DD)

Rules:
- Always infer priority from urgency words (urgent, asap, rush = "urgent", important = "high", etc.)
- Infer type from context (quotation, invoice, design mockup, etc.)
- If client mentions company/organization, extract to client_name
- Be confident but realistic - return confidence 0.0-1.0 for each field
- If unsure about a field, set confidence low and provide best guess

Example inputs:
"Create urgent quotation task for Al Ain Zoo, supplier Al Baraka, deadline Friday"
"Need design mockup for GULFTAINER campaign by end of week"
"Invoice for Al Bustan, due tomorrow"`;

    console.log('Parsing input:', input);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input }
        ],
        tools: [{
          type: "function",
          function: {
            name: "parse_task",
            description: "Extract task information from natural language",
            parameters: {
              type: "object",
              properties: {
                title: { 
                  type: "string", 
                  description: "Clear, concise task title" 
                },
                description: { 
                  type: "string", 
                  description: "Detailed task description" 
                },
                client_name: { 
                  type: "string", 
                  description: "Client or company name if mentioned" 
                },
                supplier_name: { 
                  type: "string", 
                  description: "Supplier name if mentioned" 
                },
                priority: { 
                  type: "string", 
                  enum: ["low", "medium", "high", "urgent"],
                  description: "Task priority level"
                },
                type: { 
                  type: "string", 
                  enum: ["quotation", "invoice", "design", "general", "production"],
                  description: "Task type category"
                },
                due_date: { 
                  type: "string", 
                  description: "Due date in ISO format (YYYY-MM-DD)" 
                },
                confidence_scores: {
                  type: "object",
                  description: "Confidence score (0.0-1.0) for each extracted field",
                  properties: {
                    title: { type: "number" },
                    description: { type: "number" },
                    client_name: { type: "number" },
                    supplier_name: { type: "number" },
                    priority: { type: "number" },
                    type: { type: "number" },
                    due_date: { type: "number" }
                  }
                }
              },
              required: ["title", "confidence_scores"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "parse_task" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('AI response:', JSON.stringify(aiData, null, 2));

    // Extract parsed data from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call in AI response');
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    console.log('Parsed data:', parsedData);

    // Calculate overall confidence
    const confidenceScores = parsedData.confidence_scores || {};
    const scores = Object.values(confidenceScores) as number[];
    const avgConfidence = scores.length > 0 
      ? scores.reduce((a, b) => a + b, 0) / scores.length 
      : 0.5;

    // Store AI suggestion in database
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: insertError } = await supabase
      .from('ai_task_suggestions')
      .insert({
        user_id: userId,
        raw_input: input,
        parsed_data: parsedData,
        was_accepted: false
      });

    if (insertError) {
      console.error('Error storing AI suggestion:', insertError);
    }

    return new Response(JSON.stringify({
      success: true,
      parsedData: {
        ...parsedData,
        ai_generated: true,
        ai_confidence_score: Number(avgConfidence.toFixed(2)),
        original_input: input
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-task-parser:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});