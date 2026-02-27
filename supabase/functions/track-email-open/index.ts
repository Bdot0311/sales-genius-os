import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const pixelId = url.searchParams.get("id");

    if (pixelId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Update opened_at only if not already set (first open)
      const { error } = await supabase
        .from("sent_emails")
        .update({ opened_at: new Date().toISOString() })
        .eq("tracking_pixel_id", pixelId)
        .is("opened_at", null);

      if (error) {
        console.error("Failed to track open:", error);
      } else {
        console.log("Tracked email open for pixel:", pixelId);
      }
    }
  } catch (err) {
    console.error("Track open error:", err);
  }

  // Always return the pixel regardless of tracking success
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});
