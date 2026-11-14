import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { classifyOpen } from "../_shared/open-tracking.ts";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

/**
 * Records genuine recipient opens.
 *
 * Every pixel hit is logged to email_open_events. Only hits that clear the
 * guards in _shared/open-tracking.ts move opened_at / open_count on
 * sent_emails, so a filtered hit stays visible and auditable rather than
 * disappearing.
 */
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
    const userAgent = req.headers.get("user-agent") || "";

    if (pixelId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: row } = await supabase
        .from("sent_emails")
        .select("id, user_id, to_email, sent_at, opened_at, open_count, last_opened_at")
        .eq("tracking_pixel_id", pixelId)
        .maybeSingle();

      const now = new Date();

      if (!row) {
        console.log("No sent_emails row for pixel:", pixelId);
      } else {
        const sentAt = row.sent_at ? new Date(row.sent_at) : null;
        const secondsSinceSend = sentAt
          ? Math.max(0, Math.round((now.getTime() - sentAt.getTime()) / 1000))
          : null;

        // Warmup / seed traffic to the user's own connected mailboxes is not a
        // real prospect opening the email.
        let ownMailbox = false;
        const toEmail = (row.to_email || "").toLowerCase();
        if (toEmail) {
          const { data: integrations } = await supabase
            .from("integrations")
            .select("config")
            .eq("user_id", row.user_id)
            .eq("integration_id", "google");
          ownMailbox = (integrations || []).some(
            (i: any) => (i?.config?.googleEmail || "").toLowerCase() === toEmail
          );
        }

        // Repeat hits inside a short window are the same render, not a new open.
        const lastOpened = row.last_opened_at ? new Date(row.last_opened_at) : null;
        const secondsSinceLast = lastOpened
          ? (now.getTime() - lastOpened.getTime()) / 1000
          : null;

        const { counted, skipReason } = classifyOpen({
          userAgent,
          secondsSinceSend,
          secondsSinceLastCounted: secondsSinceLast,
          ownMailbox,
        });

        await supabase.from("email_open_events").insert({
          sent_email_id: row.id,
          user_id: row.user_id,
          tracking_pixel_id: pixelId,
          occurred_at: now.toISOString(),
          seconds_since_send: secondsSinceSend,
          user_agent: userAgent.slice(0, 500),
          counted,
          skip_reason: skipReason,
        });


        if (counted) {
          const patch: Record<string, unknown> = {
            last_opened_at: now.toISOString(),
            open_count: (row.open_count ?? 0) + 1,
          };
          if (!row.opened_at) patch.opened_at = now.toISOString();

          const { error } = await supabase.from("sent_emails").update(patch).eq("id", row.id);
          if (error) console.error("Failed to track open:", error.message);
          else console.log("Counted open for pixel:", pixelId, `${secondsSinceSend}s after send`);
        } else {
          console.log("Ignored pixel hit:", pixelId, skipReason, `${secondsSinceSend}s after send`);
        }
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
