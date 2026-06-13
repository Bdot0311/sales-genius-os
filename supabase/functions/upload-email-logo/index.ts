import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require auth + admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const logoSourceUrl = "https://outreign.io/outreign-logo.webp";
    const logoResponse = await fetch(logoSourceUrl);
    if (!logoResponse.ok) {
      throw new Error(`Failed to fetch logo: ${logoResponse.status}`);
    }
    const logoArrayBuffer = await logoResponse.arrayBuffer();
    const logoUint8Array = new Uint8Array(logoArrayBuffer);

    const { data, error } = await supabaseAdmin.storage
      .from("email-assets")
      .upload("outreign-logo.webp", logoUint8Array, {
        contentType: "image/webp",
        upsert: true,
      });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("email-assets")
      .getPublicUrl("outreign-logo.webp");

    return new Response(
      JSON.stringify({ success: true, path: data.path, publicUrl: publicUrlData.publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
