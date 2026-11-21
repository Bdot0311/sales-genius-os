import { corsHeaders, requireInternalOrAdmin } from "../_shared/internal-auth.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { csvCell } from "../_shared/csv-cell.ts";
export { csvCell } from "../_shared/csv-cell.ts";

/**
 * Founder-only reporting on the outcome dataset.
 *
 * Two answers: is there enough finished, labelled data to train a scoring
 * model yet, and does Lead Intelligence's own recommendation predict a reply
 * at all. The second matters more. If the positive rate is flat across every
 * band of send_recommendation then the scores predict nothing, and a model
 * trained on them would inherit exactly that.
 *
 * The counting is in the database (dataset_readiness) so this function cannot
 * compute a rate one way while an export computes it another, and so the work
 * stays where the rows are as the dataset grows.
 */

/**
 * The columns an export may contain. An allowlist, not an exclusion list: a
 * column added to training_examples later is withheld until somebody decides
 * it belongs in an export, rather than appearing in one by default.
 *
 * No user_id, lead_id, send_id or snapshot_id. They are not names or addresses,
 * but they are the join keys back to the person, and an export that carries
 * them is re-identifiable by anyone holding the database. Features and labels
 * are what a model needs; who it was is not.
 */
export const EXPORT_COLUMNS = [
  "outcome",
  "touches",
  "icp_fit", "icp_fit_confidence",
  "buying_intent", "buying_intent_confidence",
  "email_priority",
  "send_recommendation", "send_recommendation_confidence",
  "fit_score", "intent_score", "signal_score",
  "seniority", "department", "company_size_band", "industry", "country",
  "email_verification_status", "source", "tier",
  "strongest_signal_type", "signal_recency_days", "signal_count",
  "send_hour_local", "send_weekday",
  "subject_word_count", "body_word_count",
  "has_question_cta", "has_link", "personalization_type", "quality_checker_score",
  "ai_generated", "user_edited", "edit_ratio", "sent_by", "agent_tier",
  "scorer", "scorer_version",
  "positives", "human_replies", "human_labelled",
] as const;

/** Columns that must never reach an export, whatever is added to the view. */
export const FORBIDDEN_EXPORT_COLUMNS = [
  "user_id", "lead_id", "send_id", "snapshot_id", "enrollment_id", "sequence_id",
  "to_email", "contact_email", "contact_name", "company_name",
  "subject", "body_html", "body_text", "reply_content",
] as const;

export function toCsv(rows: Record<string, unknown>[], columns: readonly string[]): string {
  const head = columns.join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c])).join(","));
  // Trailing newline: a file without one makes the last row look truncated to
  // some readers, and appending to it silently joins two rows.
  return [head, ...body].join("\n") + "\n";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireInternalOrAdmin(req);
  if (denied) return denied;

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const wantsCsv = body?.format === "csv";

    if (wantsCsv) {
      /*
       * Finished rows only. A pending conversation has no outcome yet, and
       * exporting one would label an open thread as whatever it looks like
       * today -- usually a failure.
       */
      const { data, error } = await admin
        .from("training_examples")
        .select(EXPORT_COLUMNS.join(","))
        .eq("is_final", true)
        .order("sent_at", { ascending: true });

      if (error) {
        console.error(`[admin-dataset-readiness] export_failed: ${error.message}`);
        return new Response(JSON.stringify({ error: "Could not build the export." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      /*
       * Through unknown: the column list is joined at runtime, so the typed
       * client cannot resolve it statically and infers an error shape. The
       * allowlist is the real guarantee about these columns, and a test asserts
       * every name in it exists on the view.
       */
      const csv = toCsv((data ?? []) as unknown as Record<string, unknown>[], EXPORT_COLUMNS);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="training-examples-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const { data, error } = await admin.rpc("dataset_readiness");
    if (error) {
      console.error(`[admin-dataset-readiness] readiness_failed: ${error.message}`);
      return new Response(JSON.stringify({ error: "Could not read the dataset." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /*
     * How much the consent gate is withholding, sent alongside the counts.
     * Without it a meter reading zero because nobody has answered yet looks
     * identical to one reading zero because capture is broken. Counts only:
     * no row belonging to a non-consenting owner is returned here.
     */
    const { data: consent, error: consentError } = await admin.rpc("outcome_consent_summary");
    if (consentError) console.error(`[admin-dataset-readiness] consent_summary_failed: ${consentError.message}`);

    return new Response(JSON.stringify({ ...(data as Record<string, unknown>), consent: consent ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[admin-dataset-readiness] threw: ${e instanceof Error ? e.message : String(e)}`);
    return new Response(JSON.stringify({ error: "Could not read the dataset." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
