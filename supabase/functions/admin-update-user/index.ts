import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateUserRequest {
  user_id: string;
  new_email?: string;
  new_password?: string;
  full_name?: string;
  avatar_url?: string | null;
  terminate_sessions?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check if requesting user is admin
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single()

    if (!roleData || roleData.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { user_id, new_email, new_password, full_name, avatar_url, terminate_sessions }: UpdateUserRequest = await req.json()

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update auth.users if email or password provided
    if (new_email || new_password) {
      const updateData: any = {}
      if (new_email) updateData.email = new_email
      if (new_password) updateData.password = new_password

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, updateData)
      
      if (updateError) {
        console.error('Error updating auth user:', updateError)
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Update profile if name or avatar provided
    if (full_name !== undefined || avatar_url !== undefined) {
      const profileUpdate: any = { updated_at: new Date().toISOString() }
      if (full_name !== undefined) profileUpdate.full_name = full_name
      if (avatar_url !== undefined) profileUpdate.avatar_url = avatar_url

      // Also update email in profile if changed
      if (new_email) profileUpdate.email = new_email

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user_id)

      if (profileError) {
        console.error('Error updating profile:', profileError)
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (new_email) {
      // Update email in profile even if no other profile changes
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ email: new_email, updated_at: new Date().toISOString() })
        .eq('id', user_id)

      if (profileError) {
        console.error('Error updating profile email:', profileError)
      }
    }

    // Terminate all sessions for the user if requested
    if (terminate_sessions) {
      const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(user_id, 'global')
      
      if (signOutError) {
        console.error('Error terminating sessions:', signOutError)
        // Don't fail the whole request for this
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'User updated successfully',
      sessions_terminated: terminate_sessions || false
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: unknown) {
    console.error('Error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
