import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { classifyFailure } from "./draft-failures";
import { classifyFailure as bulkClassify } from "../../supabase/functions/_shared/bulk-run-logic";
import { evaluateStoredSnapshots } from "../../supabase/functions/_shared/evidence-contract";
import { isResearchFresh, resolveLeadDomain } from "../../supabase/functions/_shared/lead-research";
import { researchAction, researchReservation, researchStep } from "../../supabase/functions/_shared/research-orchestration";
import { FALLBACK_PATHS } from "../../supabase/functions/_shared/site-discovery";

/**
 * A research job and a draft job for one lead are queued together, and the
 * worker runs four at once. Both passes can read research_runs before either
 * calls begin_research_run. The loser is refused the claim. If it still judges
 * in-flight from the row it read first — an older finished run, or none — it
 * answers with the permanent empty-research error on its first attempt.
 *
 * The competing reservation is inserted when begin_research_run is called,
 * which is after that first read and before the loser decides.
 */
const IN_FLIGHT = "Research for this company is already running in another pass. Temporarily unavailable, try again shortly.";
const USER = "user-1";
const LEAD = "lead-1";

const researchSource = readFileSync("supabase/functions/research-lead/index.ts", "utf8")
  .replace(/import[\s\S]*?from\s+["'][^"']+["'];\s*/g, "");
const researchJs = ts.transpileModule(researchSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const loadResearchLead = new Function(
  "serve",
  "createClient",
  "resolveCaller",
  "isDemoMode",
  "Deno",
  "resolveLeadDomain",
  "evaluateStoredSnapshots",
  "researchStep",
  "researchAction",
  "isResearchFresh",
  "researchReservation",
  "FALLBACK_PATHS",
  researchJs,
);

type RunRow = { attempted_at: string; receipt: Record<string, unknown> };
type RunQuery = { select: string; eqs: Record<string, unknown>; orderedDesc: boolean };

function finishedHoursAgo(hours: number): RunRow {
  const attempted_at = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return {
    attempted_at,
    receipt: {
      attemptedAt: attempted_at,
      site: { configured: true, called: true, error: "no_page", count: 0, statuses: [404], finalHosts: [] },
      parallel: { configured: false, called: false, error: "not_configured", count: 0 },
      context_dev: { configured: false, called: false, error: "not_configured", count: 0 },
      firecrawl: { configured: false, called: false, error: "not_configured", count: 0 },
      snapshotWrite: "none",
    },
  };
}

function loser(stale: RunRow | null) {
  const runs: RunRow[] = stale ? [stale] : [];
  const queries: RunQuery[] = [];
  let reserved = false;
  const lead = {
    id: LEAD,
    user_id: USER,
    company_name: "Acme Freight",
    company_website: "https://acme.example",
    contact_email: "a@acme.example",
    research_brief: null,
    researched_at: null,
  };
  const client = {
    from(table: string) {
      const shape: RunQuery = { select: "", eqs: {}, orderedDesc: false };
      const query: Record<string, unknown> = {
        select(cols: string) { shape.select = cols; return query; },
        eq(key: string, value: unknown) { shape.eqs[key] = value; return query; },
        order(col: string, opts?: { ascending?: boolean }) {
          shape.orderedDesc = col === "attempted_at" && opts?.ascending === false;
          return query;
        },
        limit() { return query; },
        maybeSingle: async () => {
          if (table === "leads") return { data: lead, error: null };
          if (table !== "research_runs") throw new Error(`unexpected maybeSingle on ${table}`);
          queries.push({ select: shape.select, eqs: { ...shape.eqs }, orderedDesc: shape.orderedDesc });
          const row = shape.orderedDesc
            ? runs.slice().sort((a, b) => b.attempted_at.localeCompare(a.attempted_at))[0] ?? null
            : runs[0] ?? null;
          return { data: row, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const result = table === "research_snapshots" ? { data: [], error: null } : { data: null, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name: string, args: { p_user_id: string; p_lead_id: string; p_force: boolean }) {
      expect(name).toBe("begin_research_run");
      expect(args).toEqual({ p_user_id: USER, p_lead_id: LEAD, p_force: false });
      expect(queries).toHaveLength(1);
      expect(reserved).toBe(false);
      reserved = true;
      runs.push({ attempted_at: new Date().toISOString(), receipt: { status: "started" } });
      return { data: null, error: null };
    },
  };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  loadResearchLead(
    (fn: (req: Request) => Promise<Response>) => { handler = fn; },
    () => client,
    async () => ({ ok: true, internal: false, userId: USER }),
    async () => false,
    { env: { get: () => "test" } },
    resolveLeadDomain,
    evaluateStoredSnapshots,
    researchStep,
    researchAction,
    isResearchFresh,
    researchReservation,
    FALLBACK_PATHS,
  );
  if (!handler) throw new Error("research-lead did not register a handler");
  return { handler, queries };
}

describe("a reserve that lands between the read and the claim is still in flight", () => {
  it.each([
    ["no earlier row", null],
    ["an older finished row", finishedHoursAgo(2)],
  ] as const)("the loser retries when the first read saw %s", async (_label, stale) => {
    const { handler, queries } = loser(stale);
    const res = await handler(new Request("https://example.test/functions/v1/research-lead", {
      method: "POST",
      headers: { Authorization: "Bearer user-jwt", "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: LEAD }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBe(IN_FLIGHT);
    expect(body.error_code).toBe("research_in_flight");
    expect(classifyFailure(body.error)).toEqual({ label: "waiting on research already in progress", retryable: true });
    expect(bulkClassify(body.error)).toBe("transient");
    expect(queries).toHaveLength(2);
    expect(queries[1]).toEqual({
      select: "attempted_at, receipt",
      eqs: { user_id: USER, lead_id: LEAD },
      orderedDesc: true,
    });
  });
});
