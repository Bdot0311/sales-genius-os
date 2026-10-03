import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
const GUARD = readFileSync("supabase/functions/_shared/internal-auth.ts", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260926090000_generalize_agent_jobs.sql",
  "utf8",
);
const SEARCH = readFileSync("supabase/functions/fetch-external-leads/index.ts", "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const W = code(WORKER);

describe("the items table carries work that is not about a lead", () => {
  it("lead_id is nullable, with a payload beside it", () => {
    expect(MIGRATION).toContain("ALTER COLUMN lead_id DROP NOT NULL");
    expect(MIGRATION).toContain("ADD COLUMN IF NOT EXISTS payload jsonb");
  });

  it("the uniqueness rule still means what it meant, where it applied", () => {
    // Postgres treats NULLs as distinct, so leaving the old index in place
    // would have left it constraining nothing while still existing.
    expect(MIGRATION).toContain("uq_agent_job_items_job_lead");
    expect(MIGRATION).toContain("WHERE lead_id IS NOT NULL");
  });

  it("a lead-shaped item still has to carry a lead", () => {
    expect(MIGRATION).toContain("CHECK (lead_id IS NOT NULL OR payload IS NOT NULL)");
  });

  it("an unknown kind cannot be enqueued", () => {
    // Unconstrained, a typo enqueues cleanly and sits at 0 of N forever with no
    // worker that recognises it, which reads as stuck rather than as a mistake.
    expect(MIGRATION).toContain("CHECK (kind IN ('draft', 'enrich', 'score', 'research', 'search'))");
  });
});

describe("the worker runs each kind", () => {
  it("search returns before the lead lookup, because it has no lead", () => {
    const branch = W.indexOf('if (job.kind === "search")');
    const leadLookup = W.indexOf('.eq("id", item.lead_id)');
    expect(branch).toBeGreaterThan(-1);
    expect(leadLookup).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(leadLookup);
  });

  it("enrich, score and research each map to their function", () => {
    expect(W).toContain('enrich: "enrich-lead"');
    expect(W).toContain('score: "score-lead"');
    expect(W).toContain('research: "research-lead"');
  });

  it("those kinds branch before drafting's own setup", () => {
    // The agent config, sender profile, mailbox and subject history are
    // drafting's; running them for an enrich is wasted queries.
    const kindBranch = W.indexOf("const leadFunction = LEAD_FUNCTION[String(job.kind)];");
    const draftSetup = W.indexOf('.from("agent_configs")');
    expect(kindBranch).toBeGreaterThan(-1);
    expect(kindBranch).toBeLessThan(draftSetup);
  });

  it("the already-drafted skip applies only to drafting", () => {
    // It asks whether the lead has a draft. For an enrich that is irrelevant,
    // and skipping on it would silently drop the work.
    expect(W).toContain('if (job.kind === "draft" && !job.feedback)');
  });

  it("a body error is a failure even when the transport succeeded", () => {
    // These report a dry well and a broken key the same way at the HTTP layer,
    // so the body is what decides. Pinned to the branch rather than the old
    // `failedHere` literal: the settling moved into settleFailure so a rate
    // limit can be handed back instead of retiring the lead.
    expect(W).toMatch(/if \(r\?\.error\) \{\s*\n\s*await settleFailure\(item, r\.error\);/);
  });
});

describe("search results survive leaving the page", () => {
  it("results are written back onto the item", () => {
    expect(W).toContain("results: leads,");
    expect(W).toContain('.from("agent_job_items")');
  });

  it("they are not auto-saved into the lead list", () => {
    // Saving is the user's choice; a background search filling their list with
    // people they never picked is a different bug.
    expect(code(WORKER)).not.toMatch(/runSearchItem[\s\S]{0,1500}from\("leads"\)\s*\.insert/);
  });

  it("finding nobody is a finished search, not a failed one", () => {
    const fn = W.slice(W.indexOf("async function runSearchItem"));
    const ret = fn.indexOf("return { ok: true };");
    expect(ret).toBeGreaterThan(-1);
  });

  it("a search with no query fails rather than running an empty one", () => {
    expect(W).toContain('return { ok: false, error: "Search item has no query" };');
  });
});

describe("one implementation of who a caller is", () => {
  it("the helper is shared, not copied into each function", () => {
    expect(code(GUARD)).toContain("export async function resolveCaller(");
    expect(code(GUARD)).toContain("export async function ownerOf(");
    for (const f of [
      "supabase/functions/generate-email/index.ts",
      "supabase/functions/enrich-lead/index.ts",
      "supabase/functions/score-lead/index.ts",
      "supabase/functions/research-lead/index.ts",
      "supabase/functions/fetch-external-leads/index.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} must not re-implement the check`).not.toContain("auth.getUser(token)");
    }
  });

  it("an internal caller is trusted but anonymous", () => {
    expect(code(GUARD)).toContain('if (isInternalCaller(req)) return { ok: true, internal: true, userId: null };');
  });

  it("a signed-in caller cannot reach another user's row", () => {
    expect(code(GUARD)).toContain("if (!caller.internal && owner !== caller.userId) return null;");
  });

  it("a missing row and a forbidden one answer the same", () => {
    // Otherwise the reply tells you whether a record exists and whose it is.
    expect(code(GUARD)).toContain("if (!owner) return null;");
  });

  it("search establishes its owner from the job, having no lead", () => {
    expect(code(SEARCH)).toContain("await ownerOf(supabase, 'agent_jobs', jobId, caller)");
    expect(W).toContain("job_id: job.id");
  });

  it("no function reads a user id out of a request body", () => {
    for (const f of [
      "supabase/functions/generate-email/index.ts",
      "supabase/functions/enrich-lead/index.ts",
      "supabase/functions/score-lead/index.ts",
      "supabase/functions/research-lead/index.ts",
      "supabase/functions/fetch-external-leads/index.ts",
    ]) {
      const src = code(readFileSync(f, "utf8"));
      expect(src, `${f} must not take a user id from the caller`)
        .not.toMatch(/(body|requestData|filters)\s*\.\s*user_?[Ii]d/);
    }
  });
});
