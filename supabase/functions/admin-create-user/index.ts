import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-CREATE-USER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) throw new Error("Admin privileges required");

    const { email, password, full_name, plan = 'growth', is_admin = false } = await req.json();
    
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    logStep("Creating user", { email, plan, is_admin });

    // Create the user in auth
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name }
    });

    if (createError) throw createError;
    if (!newUser.user) throw new Error("Failed to create user");

    logStep("User created", { userId: newUser.user.id });

    // Profile and subscription will be created by triggers
    // Update the subscription plan if needed
    const leadsLimit = plan === 'growth' ? 1000 : plan === 'pro' ? 10000 : 999999;
    await supabaseClient
      .from('subscriptions')
      .update({ 
        plan, 
        leads_limit: leadsLimit,
        // Admins get unlimited access - set account to permanent active
        account_status: is_admin ? 'admin' : 'active',
      })
      .eq('user_id', newUser.user.id);

    // If user should be admin, add admin role
    if (is_admin) {
      const { error: roleError } = await supabaseClient
        .from('user_roles')
        .insert({
          user_id: newUser.user.id,
          role: 'admin'
        });
      
      if (roleError) {
        logStep("Error adding admin role", { error: roleError });
        // Don't throw - user is created, role just failed
      } else {
        logStep("Admin role assigned");
      }
    }

    logStep("User setup complete");

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: newUser.user.id,
          email: newUser.user.email
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage }); // Log internally for debugging
    
    // Return generic error message to client - don't expose internal details
    const safeErrors: Record<string, string> = {
      "No authorization header": "Authentication required",
      "Unauthorized": "Authentication failed",
      "Admin privileges required": "Insufficient permissions",
      "Email and password are required": "Email and password are required",
    };
    
    const clientMessage = safeErrors[errorMessage] || "Failed to create user";
    
    return new Response(
      JSON.stringify({ error: clientMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});