import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

/**
 * Records a real link click on a tracked outbound email, then redirects the
 * recipient to the original destination. Unauthenticated by design (the
 * recipient's mail client calls it), matched only by tracking_pixel_id.
 */
serve(async (req) => {
  const url = new URL(req.url);
  const pixelId = url.searchParams.get("id");
  const target = url.searchParams.get("u") || "";

  const safeTarget = /^https?:\/\//i.test(target) ? target : null;

  try {
    if (pixelId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const now = new Date().toISOString();

      // First click wins for clicked_at; a click also proves an open.
      const { data: row } = await supabase
        .from("sent_emails")
        .select("id, user_id, lead_id, opened_at, clicked_at")
        .eq("tracking_pixel_id", pixelId)
        .maybeSingle();

      if (row) {
        const patch: Record<string, string> = {};
        if (!row.clicked_at) patch.clicked_at = now;
        if (!row.opened_at) patch.opened_at = now;
        if (Object.keys(patch).length > 0) {
          const { error } = await supabase.from("sent_emails").update(patch).eq("id", row.id);
          if (error) console.error("Failed to record click:", error.message);
        }

        // Log the click as lead activity so the pipeline reflects engagement.
        if (!row.clicked_at && row.lead_id && row.user_id) {
          await supabase.from("activities").insert({
            user_id: row.user_id,
            lead_id: row.lead_id,
            type: "email_click",
            description: `Clicked a link in your email${safeTarget ? `: ${safeTarget}` : ""}`,
          }).then(({ error }) => {
            if (error) console.error("Failed to log click activity:", error.message);
          });
        }
      } else {
        console.log("No sent_emails row for pixel:", pixelId);
      }
    }
  } catch (err) {
    console.error("track-email-click error:", err);
  }

  if (safeTarget) {
    return new Response(null, { status: 302, headers: { Location: safeTarget, "Cache-Control": "no-store" } });
  }
  return new Response("Invalid link", { status: 400 });
});
