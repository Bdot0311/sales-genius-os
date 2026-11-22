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

    const { email, password, full_name, plan = 'free', is_admin = false } = await req.json();
    
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const makeAdmin = is_admin === true;
    if (!makeAdmin && plan !== 'free') throw new Error('Paid plans require Stripe subscription checkout');
    logStep("Creating user", { plan, is_admin: makeAdmin });

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

    // Assign a protected role before the paid-plan write. Customers are
    // always provisioned Free; only Stripe can activate their paid tier.
    if (makeAdmin) {
      const { error: roleError } = await supabaseClient.from('user_roles')
        .insert({ user_id: newUser.user.id, role: 'admin' });
      if (roleError) throw roleError;
    }
    const planLimits: Record<string, number> = {
      free: 100, starter: 1000, growth: 2500, pro: 5000, agency: 15000,
    };
    const leadsLimit = planLimits[plan] ?? 100;
    const { error: subscriptionError } = await supabaseClient.from('subscriptions').update({
      plan, leads_limit: leadsLimit, search_credits_base: leadsLimit,
      search_credits_remaining: leadsLimit, status: 'active',
      account_status: makeAdmin ? 'admin' : 'active',
    }).eq('user_id', newUser.user.id);
    if (subscriptionError) throw subscriptionError;

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
      "Paid plans require Stripe subscription checkout": "Create a Free account first. Paid access starts after Stripe subscription checkout.",
      "Password is known to be weak and easy to guess, please choose a different one.": "This password is known to be weak or easy to guess. Please use a strong, unique password.",
    };
    
    const clientMessage = safeErrors[errorMessage] || "Failed to create user";
    
    return new Response(
      JSON.stringify({ error: clientMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});