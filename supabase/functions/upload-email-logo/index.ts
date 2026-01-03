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
    console.log("Starting logo upload to storage...");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch the logo from the existing URL
    const logoSourceUrl = "https://salesos.alephwavex.io/salesos-logo.webp";
    console.log("Fetching logo from:", logoSourceUrl);
    
    const logoResponse = await fetch(logoSourceUrl);
    if (!logoResponse.ok) {
      throw new Error(`Failed to fetch logo: ${logoResponse.status}`);
    }

    const logoBlob = await logoResponse.blob();
    const logoArrayBuffer = await logoBlob.arrayBuffer();
    const logoUint8Array = new Uint8Array(logoArrayBuffer);

    console.log("Logo fetched, size:", logoUint8Array.length, "bytes");

    // Upload to storage bucket
    const { data, error } = await supabaseAdmin.storage
      .from("email-assets")
      .upload("salesos-logo.webp", logoUint8Array, {
        contentType: "image/webp",
        upsert: true,
      });

    if (error) {
      console.error("Storage upload error:", error);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    console.log("Logo uploaded successfully:", data);

    // Get the public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from("email-assets")
      .getPublicUrl("salesos-logo.webp");

    console.log("Public URL:", publicUrlData.publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        path: data.path,
        publicUrl: publicUrlData.publicUrl
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});