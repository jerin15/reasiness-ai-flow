import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  role: string; // Can be any custom role name now
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !requestingUser) {
      throw new Error("Invalid authorization token");
    }

    // Check if requesting user is admin
    const { data: adminRoleData, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin")
      .single();

    if (roleError || !adminRoleData) {
      throw new Error("Only admins can create users");
    }

    // Get request body
    const { email, password, full_name, role }: CreateUserRequest = await req.json();

    // Validate input
    if (!email || !password || !full_name || !role) {
      throw new Error("Missing required fields: email, password, full_name, role");
    }

    if (password.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    // Validate that the role exists in custom_roles table
    const { data: roleData, error: roleCheckError } = await supabaseClient
      .from("custom_roles")
      .select("role_name")
      .eq("role_name", role)
      .single();

    if (roleCheckError || !roleData) {
      throw new Error(`Invalid role: ${role}. Role does not exist.`);
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    if (!newUser.user) {
      throw new Error("User creation returned no user data");
    }

    console.log("User created successfully:", newUser.user.id);

    // The profile should be created automatically by the trigger
    // But we'll verify and update if needed
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        email,
        full_name,
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error("Error creating profile:", profileError);
    }

    // Assign the role
    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: newUser.user.id,
        role,
      });

    if (roleInsertError) {
      console.error("Error assigning role:", roleInsertError);
      throw new Error(`User created but failed to assign role: ${roleInsertError.message}`);
    }

    console.log("Role assigned successfully:", role);

    return new Response(
      JSON.stringify({
        success: true,
        message: "User created successfully",
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name,
          role,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in create-user function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
