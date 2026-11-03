/**
 * Pulls published Opinly content into `blog_posts` so it appears in the
 * existing blog section (list, article page, sitemap, RSS) with no parallel
 * routes and no second CMS in the front end.
 *
 * Called three ways:
 *   - hourly by pg_cron (full sweep, cheap: only changed posts are written)
 *   - by opinly-webhook with { slugs: [...] } when Opinly publishes an update
 *   - manually with { force: true } to rewrite every post
 *
 * Posts written by the AI generator (source='ai') are never touched: this only
 * inserts or updates rows it owns (source='opinly').
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, requireInternalOrAdmin } from "../_shared/internal-auth.ts";
import { getPost, listPosts, toBlogPostRow, OpinlyError, type OpinlyPostSummary } from "../_shared/opinly.ts";

const MAX_PAGES = 20;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Cron/service role, or an admin pressing "sync now".
  const unauthorized = await requireInternalOrAdmin(req);
  if (unauthorized) return unauthorized;

  const apiKey = Deno.env.get("OPINLY_API_KEY");
  if (!apiKey) return json({ success: false, error: "OPINLY_API_KEY is not configured" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const requestedSlugs = Array.isArray(body.slugs) ? (body.slugs as string[]).filter(Boolean) : null;
  const force = body.force === true;

  try {
    // 1. Decide which slugs to look at.
    let summaries: Array<Pick<OpinlyPostSummary, "slug" | "lastPublishedAt">> = [];

    if (requestedSlugs?.length) {
      summaries = requestedSlugs.map((slug) => ({ slug, lastPublishedAt: new Date().toISOString() }));
    } else {
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await listPosts(apiKey, { limit: 50, cursor });
        summaries.push(...res.data.map((p) => ({ slug: p.slug, lastPublishedAt: p.lastPublishedAt })));
        if (!res.has_more || !res.next_cursor) break;
        cursor = res.next_cursor;
      }
    }

    if (!summaries.length) return json({ success: true, checked: 0, inserted: 0, updated: 0, skipped: 0, errors: [] });

    // 2. What we already hold, so unchanged posts cost nothing to re-check.
    const { data: existingRows } = await supabase
      .from("blog_posts")
      .select("slug, source, updated_at")
      .in("slug", summaries.map((s) => s.slug));

    const existing = new Map((existingRows ?? []).map((r) => [r.slug as string, r]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ slug: string; error: string }> = [];

    for (const summary of summaries) {
      const current = existing.get(summary.slug);

      // A slug already owned by the AI generator stays the generator's. Two
      // sources writing one row would flip the article back and forth.
      if (current && current.source !== "opinly") {
        skipped++;
        continue;
      }

      if (
        current && !force && !requestedSlugs &&
        current.updated_at && new Date(current.updated_at) >= new Date(summary.lastPublishedAt)
      ) {
        skipped++;
        continue;
      }

      try {
        const full = await getPost(apiKey, summary.slug);
        const row = toBlogPostRow(full);
        if (!row.content.trim()) throw new Error("post body is empty");

        const { error } = await supabase.from("blog_posts").upsert(row, { onConflict: "slug" });
        if (error) throw new Error(error.message);

        if (current) updated++;
        else inserted++;
      } catch (e) {
        // One bad post must not abort the sweep — the rest still publish.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[sync-opinly-posts] ${summary.slug}: ${msg}`);
        if (!(e instanceof OpinlyError && e.status === 404)) errors.push({ slug: summary.slug, error: msg });
        else skipped++;
      }
    }

    console.log(
      `[sync-opinly-posts] checked=${summaries.length} inserted=${inserted} updated=${updated} skipped=${skipped} errors=${errors.length}`,
    );

    return json({ success: true, checked: summaries.length, inserted, updated, skipped, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-opinly-posts] failed:", msg);
    // 200 with an error body: cron callers log this, they do not retry-storm.
    return json({ success: false, error: msg });
  }
});
