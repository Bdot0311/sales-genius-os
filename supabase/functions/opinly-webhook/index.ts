/**
 * Receives Opinly's Svix-signed `content.routes-changed` webhook and refreshes
 * only the posts named in it, so a publish or edit in Opinly shows up in the
 * blog within seconds instead of waiting for the hourly sweep.
 *
 * There is no page cache to invalidate here: the blog reads `blog_posts` at
 * request time, so re-ingesting the changed rows *is* the invalidation. A
 * "home"/"category"/"author"/"tag" entry means the listing changed, which is
 * covered by a full sweep.
 */
import { Webhook } from "https://esm.sh/svix@1.24.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, svix-id, svix-timestamp, svix-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const secret = Deno.env.get("OPINLY_WEBHOOK_SIGNING_SECRET");
  if (!secret) return json({ error: "webhook signing secret not configured" }, 500);

  const raw = await req.text();

  let event: { type?: string; data?: { changed?: Array<{ type: string; slug: string }> } };
  try {
    event = new Webhook(secret).verify(raw, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    }) as typeof event;
  } catch (e) {
    console.error("[opinly-webhook] invalid signature:", e instanceof Error ? e.message : e);
    return json({ error: "invalid signature" }, 400);
  }

  const changed = event.data?.changed ?? [];
  const slugs = changed.filter((c) => c.type === "post" && c.slug).map((c) => c.slug);
  const needsFullSweep = changed.some((c) => c.type !== "post");

  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-opinly-posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slugs.length && !needsFullSweep ? { slugs } : {}),
    });
    const result = await res.json().catch(() => ({}));
    console.log(`[opinly-webhook] ${event.type} slugs=${slugs.length} sweep=${needsFullSweep}`, result);
  } catch (e) {
    // The event was genuine and verified; acknowledge it and let the hourly
    // sweep catch up rather than having Svix retry a signature that is fine.
    console.error("[opinly-webhook] sync call failed:", e instanceof Error ? e.message : e);
  }

  return json({ received: true }, 200);
});
