import { briefHasFacts, briefToPromptBlock, isResearchFresh, type LeadResearchBrief } from "./lead-research.ts";
import { evaluateStoredSnapshots } from "./evidence-contract.ts";
import { researchStep, type RetrievalReceipt } from "./research-orchestration.ts";

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
  /** A retrieval already ran inside the retry window and approved nothing. */
  | "held"
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
  userId = "",
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

    const payloads = await readSnapshotPayloads(admin, userId, leadId);
    const latestRun = await readLatestRun(admin, userId, leadId);
    const decision = evaluateStoredSnapshots({
      userId: userId || "unknown",
      leadId,
      company: String(row?.company_name ?? ""),
      websiteHost: (() => {
        const raw = String(row?.company_website ?? "");
        try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, ""); }
        catch { return null; }
      })(),
      now: new Date().toISOString(),
      stored: payloads,
    });
    const step = researchStep({
      hasTrustedFacts: decision.status === "ready",
      receipt: latestRun,
      now: new Date().toISOString(),
    });
    if (row && isResearchFresh(row as Record<string, unknown>) && step !== "fetch") {
      const cached = row.research_brief as LeadResearchBrief;
      if (step === "hold") return { block: "", outcome: "held", detail: "retrieval_recent" };
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

async function readLatestRun(admin: { from: (table: string) => any }, userId: string, leadId: string): Promise<RetrievalReceipt | null> {
  if (!userId) return null;
  try {
    const first = admin.from("research_runs").select("attempted_at, receipt").eq("user_id", userId);
    if (!first || typeof first.eq !== "function") return null;
    const second = first.eq("lead_id", leadId);
    if (!second || typeof second.order !== "function") return null;
    const query = second.order("attempted_at", { ascending: false }).limit(1);
    if (!query || typeof query.maybeSingle !== "function") return null;
    const result = await query.maybeSingle();
    const row = result?.data;
    if (!row?.attempted_at) return null;
    const receipt = (row.receipt ?? {}) as RetrievalReceipt;
    receipt.attemptedAt = String(row.attempted_at);
    return receipt;
  } catch {
    return null;
  }
}

async function readSnapshotPayloads(admin: { from: (table: string) => any }, userId: string, leadId: string): Promise<unknown[]> {
  if (!userId) return [];
  try {
    const first = admin.from("research_snapshots").select("payload").eq("user_id", userId);
    if (!first || typeof first.eq !== "function") return [];
    const query = first.eq("lead_id", leadId);
    if (!query || typeof query.then !== "function") return [];
    const result = await query;
    const rows = Array.isArray(result?.data) ? result.data : [];
    return rows.map((row: { payload?: unknown }) => row.payload).filter(Boolean);
  } catch {
    return [];
  }
}
