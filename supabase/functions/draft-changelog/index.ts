// draft-changelog — turns a merged pull request into a changelog draft.
//
// Called by .github/workflows/changelog-draft.yml when something lands on main,
// authenticated with CHANGELOG_DRAFT_SECRET — a key that unlocks this function
// and nothing else, because it lives in a GitHub repository secret. See
// _shared/changelog-auth.ts for why it is not the shared internal secret.
// It never publishes: it writes into today's `draft` entry, and an admin
// reviews and publishes from the Admin Panel.
//
// The gate is the whole point. Generating entries straight from merged PRs is
// what produced the version this replaces: four entries dated the same day
// because four branches landed, titles joining unrelated fixes with "and"
// because they shipped together, and a page that was almost entirely bug fixes
// because that is what a week of engineering looks like from the inside. The
// model here is given the editorial rules that were missing, and a human still
// decides what customers see.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { aiFetch } from "../_shared/ai-provider.ts";
import { corsHeaders, requireChangelogCaller } from "../_shared/changelog-auth.ts";
import {
  DRAFT_SYSTEM_PROMPT,
  isWorthAnnouncing,
  mergeItems,
  parseDraft,
  saidNothingToAnnounce,
  type DraftItem,
} from "../_shared/changelog-draft.ts";

const MODEL = "google/gemini-2.5-flash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const unauthorized = requireChangelogCaller(req);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json().catch(() => ({}));
    const prNumber = Number(body.pr_number) || null;
    const prTitle = String(body.pr_title ?? "").trim();
    const prBody = String(body.pr_body ?? "").slice(0, 8000);
    const labels: string[] = Array.isArray(body.labels) ? body.labels.map(String) : [];
    // What the merge touched. A title is a claim about a change; this is the
    // change, and it is what decides whether the change is news at all.
    const files: string[] = Array.isArray(body.files) ? body.files.map(String) : [];
    const filesComplete = body.files_complete !== false;
    const sha = String(body.sha ?? "").slice(0, 40);
    // The release date, in UTC, from when it merged — not when this ran.
    const mergedAt = body.merged_at ? new Date(String(body.merged_at)) : new Date();
    const entryDate = mergedAt.toISOString().slice(0, 10);

    if (!prTitle) return json({ error: "pr_title is required" }, 400);

    // Not every merge is news. A test, a script, a CI workflow, the skills
    // bundle, the admin panel and a new marketing page are all things a
    // customer cannot observe, and an entry about one is worse than no entry.
    const verdict = isWorthAnnouncing({ title: prTitle, body: prBody, labels, files, filesComplete });
    if (!verdict.announce) {
      console.log(`[draft-changelog] PR #${prNumber ?? "?"} skipped: ${verdict.reason}`);
      return json({ skipped: true, reason: verdict.reason, entry_date: entryDate });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.error("[draft-changelog] LOVABLE_API_KEY is not configured");
      return json({ error: "AI provider is not configured" }, 500);
    }

    const res = await aiFetch("draft-changelog", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        // The same PR should draft the same entry. At the default sampling
        // temperature a re-run produces different copy, which makes reviewing
        // a re-drafted entry a fresh read every time.
        temperature: 0,
        messages: [
          { role: "system", content: DRAFT_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Pull request #${prNumber ?? "?"}\n\nTitle: ${prTitle}\n\nDescription:\n${prBody || "(none)"}` +
              // The files a customer could notice, so a merge that changed one
              // product file and nine internal ones is written up as the one.
              (verdict.product.length
                ? `\n\nCustomer-facing files changed:\n${verdict.product.slice(0, 40).join("\n")}`
                : ""),
          },
        ],
      }),
    }, { fn: "draft-changelog" });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[draft-changelog] model call failed:", res.status, detail.slice(0, 300));
      return json({ error: "Could not draft the entry" }, 502);
    }

    const completion = await res.json();
    const raw = completion?.choices?.[0]?.message?.content ?? "";
    const draft = parseDraft(raw);
    if (!draft || draft.items.length === 0) {
      // Declining is not failing. The prompt tells the model to return no items
      // for a change a customer cannot observe, and reporting that as a failure
      // put a warning in the workflow run asking for an entry by hand.
      if (saidNothingToAnnounce(raw)) {
        console.log(`[draft-changelog] PR #${prNumber ?? "?"}: the model found nothing to announce`);
        return json({
          skipped: true,
          reason: "the model found nothing a customer would notice",
          entry_date: entryDate,
        });
      }
      console.error("[draft-changelog] unusable model output:", String(raw).slice(0, 300));
      return json({ error: "The model returned nothing usable" }, 502);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Today's entry, or a new one. Several merges on one day belong to one
    // entry — a customer reading four entries dated the same day is reading
    // four branches.
    const { data: existing } = await supabase
      .from("changelog_entries")
      .select("id, title, summary, items, status, source")
      .eq("entry_date", entryDate)
      .maybeSingle();

    const sourceRef = { pr: prNumber, title: prTitle, sha };

    if (existing) {
      // A published entry is not amended behind a customer's back: the day's
      // later merges start their own draft the admin can fold in or leave.
      if (existing.status === "published") {
        return json({
          skipped: true,
          reason: "today's entry is already published; draft it manually if it belongs there",
          entry_date: entryDate,
          entry_id: existing.id,
        });
      }

      const merged = mergeItems(existing.items as DraftItem[], draft.items);
      const sources = Array.isArray((existing.source as Record<string, unknown>)?.prs)
        ? ((existing.source as { prs: unknown[] }).prs as unknown[])
        : [];

      const { error } = await supabase
        .from("changelog_entries")
        .update({
          // The title follows the day's largest change, so a day that starts
          // with a fix and then ships a feature is not still titled after the
          // fix.
          title: merged.length > (existing.items as DraftItem[]).length ? draft.title : existing.title,
          summary: draft.summary || existing.summary,
          items: merged,
          source: { prs: [...sources, sourceRef] },
        })
        .eq("id", existing.id);

      if (error) {
        console.error("[draft-changelog] update failed:", error.message);
        return json({ error: "Could not update the draft" }, 500);
      }
      return json({ drafted: true, entry_id: existing.id, entry_date: entryDate, items: merged.length });
    }

    const { data: created, error } = await supabase
      .from("changelog_entries")
      .insert({
        entry_date: entryDate,
        title: draft.title,
        summary: draft.summary,
        items: draft.items,
        status: "draft",
        source: { prs: [sourceRef] },
      })
      .select("id")
      .single();

    if (error) {
      console.error("[draft-changelog] insert failed:", error.message);
      return json({ error: "Could not create the draft" }, 500);
    }

    return json({ drafted: true, entry_id: created.id, entry_date: entryDate, items: draft.items.length });
  } catch (err) {
    console.error("[draft-changelog] error:", err instanceof Error ? err.message : err);
    return json({ error: "Drafting failed" }, 500);
  }
});
