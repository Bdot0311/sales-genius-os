import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

/**
 * Records genuine recipient opens.
 *
 * Mail providers (Gmail's image proxy in particular) fetch every image the
 * moment a message is created/stored — including the sender's own copy in
 * Sent. That prefetch used to be recorded as an "open" seconds after send,
 * which made open rates fiction. Every pixel hit is now logged to
 * email_open_events, but only hits that pass the guards below move
 * opened_at / open_count on sent_emails.
 */
const PREFETCH_GRACE_SECONDS = 90;

// Security/appliance scanners and link-checkers — never real human opens.
const SCANNER_UA = /(barracuda|proofpoint|mimecast|symantec|forcepoint|trendmicro|messagelabs|bitdefender|virustotal|slackbot|whatsapp|discordbot|facebookexternalhit|twitterbot|linkedinbot|bingpreview|python-requests|curl\/|wget|okhttp|axios|node-fetch|headlesschrome|monitoring|uptime)/i;

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
        .select("id, user_id, to_email, sent_at, opened_at, open_count")
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

        let skipReason: string | null = null;
        if (SCANNER_UA.test(userAgent)) {
          skipReason = "scanner_user_agent";
        } else if (secondsSinceSend !== null && secondsSinceSend < PREFETCH_GRACE_SECONDS) {
          skipReason = "provider_prefetch";
        }

        const counted = skipReason === null;

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
