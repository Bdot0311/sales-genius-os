import { briefHasFacts, briefToPromptBlock, isResearchFresh, type LeadResearchBrief } from "./lead-research.ts";

/**
 * Why a draft had no research, which is the number nobody could answer.
 *
 * Five separate paths through this function produce an empty block, and they
 * were indistinguishable from each other and from success. "How often does
 * the agent write with no facts?" had no answer short of reading logs, so the
 * question stayed arguable while the drafts kept going out.
 *
 * `cached` and `researched` are the working cases. Every other value is a
 * draft written from the lead row alone.
 */
export type ResearchOutcome =
  | "cached"
  | "researched"
  /** A brief exists and yielded no usable line. Thin, not broken. */
  | "empty_brief"
  /** research-lead answered, with no brief and no error to explain it. */
  | "no_brief"
  /** research-lead declined, with a reason. Usually an unconfigured provider. */
  | "skipped"
  /** It threw, or the 60s timeout fired. */
  | "failed";

export interface ResearchResult {
  block: string;
  outcome: ResearchOutcome;
  /** research-lead's own error code, when it gave one. */
  detail?: string;
}

export async function researchBlockForLead(
  admin: any,
  supabaseUrl: string,
  authHeader: string,
  anonKey: string,
  leadId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResearchResult> {
  try {
    const { data: row } = await admin
      .from("leads")
      .select(
        // The fields the brief was built from, because freshness now compares
        // the inputs rather than the row's last write. Reading the brief
        // without them computes an empty fingerprint and never matches.
        "research_brief, research_sources, research_confidence, researched_at, research_inputs, company_website, contact_email, company_name, linkedin_url, company_linkedin, enriched_at",
      )
      .eq("id", leadId)
      .maybeSingle();

    if (row && isResearchFresh(row as Record<string, unknown>)) {
      const cached = row.research_brief as LeadResearchBrief;
      /*
       * Facts, not string length. A brief with nothing in it still produces a
       * block of sources, timing and a confidence score, which is a non-empty
       * string that tells the model research succeeded and gives it nothing to
       * write from. Returning "" here is what makes the prompt say the empty
       * case out loud instead.
       */
      if (!briefHasFacts(cached)) return { block: "", outcome: "empty_brief" };
      return {
        block: briefToPromptBlock(cached, (row.research_sources as string[]) ?? []),
        outcome: "cached",
      };
    }

    const res = await fetchImpl(`${supabaseUrl}/functions/v1/research-lead`, {
      method: "POST",
      headers: { Authorization: authHeader, apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
      signal: AbortSignal.timeout(60_000),
    });
    const rj = await res.json().catch(() => ({}));
    if (rj?.brief) {
      const fresh = rj.brief as LeadResearchBrief;
      if (!briefHasFacts(fresh)) return { block: "", outcome: "empty_brief" };
      return {
        block: briefToPromptBlock(fresh, Array.isArray(rj.sources) ? rj.sources : []),
        outcome: "researched",
      };
    }
    if (rj?.error) {
      const detail = String(rj.error_code || rj.error);
      console.warn("[agent-run] research skipped:", detail);
      return { block: "", outcome: "skipped", detail };
    }
    return { block: "", outcome: "no_brief" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn("[agent-run] research step failed:", detail);
    return { block: "", outcome: "failed", detail };
  }
}
