import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { classifyOpen } from "../_shared/open-tracking.ts";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

/**
 * Open tracking for the platform's own outbound app emails (founder notes,
 * re-engagement, onboarding nudges) sent through Lovable's managed email API.
 *
 * Lovable records sends, bounces, complaints and unsubscribes but never
 * delivered/opened outcomes, so this is the only way the admin panel can show
 * whether a re-engagement email was actually looked at. Each send embeds a
 * pixel carrying its email_send_log.pixel_id; the same prefetch/scanner guards
 * used for user outreach decide whether a hit counts as a person.
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
    const pixelId = new URL(req.url).searchParams.get("id");
    const userAgent = req.headers.get("user-agent") || "";

    if (pixelId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: row } = await supabase
        .from("email_send_log")
        .select("id, created_at, opened_at, last_opened_at, open_count")
        .eq("pixel_id", pixelId)
        .maybeSingle();

      if (!row) {
        console.log("No email_send_log row for pixel:", pixelId);
      } else {
        const now = new Date();
        const sentAt = row.created_at ? new Date(row.created_at) : null;
        const secondsSinceSend = sentAt
          ? Math.max(0, Math.round((now.getTime() - sentAt.getTime()) / 1000))
          : null;
        const lastOpened = row.last_opened_at ? new Date(row.last_opened_at) : null;
        const secondsSinceLastCounted = lastOpened
          ? (now.getTime() - lastOpened.getTime()) / 1000
          : null;

        const { counted, skipReason } = classifyOpen({
          userAgent,
          secondsSinceSend,
          secondsSinceLastCounted,
          ownMailbox: false,
        });

        if (counted) {
          const patch: Record<string, unknown> = {
            last_opened_at: now.toISOString(),
            open_count: (row.open_count ?? 0) + 1,
          };
          if (!row.opened_at) patch.opened_at = now.toISOString();

          const { error } = await supabase
            .from("email_send_log")
            .update(patch)
            .eq("id", row.id);
          if (error) console.error("Failed to record app email open:", error.message);
          else console.log("Counted app email open:", pixelId, `${secondsSinceSend}s after send`);
        } else {
          console.log("Ignored app email pixel hit:", pixelId, skipReason);
        }
      }
    }
  } catch (err) {
    console.error("Track app email open error:", err);
  }

  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});
