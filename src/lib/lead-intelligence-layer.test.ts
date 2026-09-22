import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONFIDENCE,
  DECISION_KEYS,
  LEAD_INTELLIGENCE_FLAG,
  decisionFromRow,
  decisionPromptBlock,
  isDecisionFresh,
  leadIntelligenceMode,
  unavailableDecision,
} from "../../supabase/functions/_shared/lead-intelligence";
import { JevError, readChoice } from "../../supabase/functions/_shared/jev-provider";

const LAYER = readFileSync("supabase/functions/_shared/lead-intelligence.ts", "utf8");
const PROVIDER = readFileSync("supabase/functions/_shared/jev-provider.ts", "utf8");
const GENERATE = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const AGENT_RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
const AGENT_CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const MIGRATION = readFileSync("drizzle/migrations/0012_lead_decisions_intelligence_layer.sql", "utf8");

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** A Supabase stand-in that answers only the feature-flag read. */
const withFlag = (isEnabled: boolean) => ({
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_enabled: isEnabled } }) }) }),
  }),
});

const withJevMode = async <T>(value: string | undefined, fn: () => Promise<T>): Promise<T> => {
  const prior = (globalThis as Record<string, unknown>).Deno;
  (globalThis as Record<string, unknown>).Deno = { env: { get: (k: string) => (k === "JEV_MODE" ? value : undefined) } };
  try {
    return await fn();
  } finally {
    if (prior === undefined) delete (globalThis as Record<string, unknown>).Deno;
    else (globalThis as Record<string, unknown>).Deno = prior;
  }
};

/**
 * The decision layer evaluates; Bedrock still writes. These pin the boundary
 * between the two, and the fail-safe behaviour that lets the layer be switched
 * on without putting the existing SDR at risk.
 */
describe("the layer decides and generation still writes", () => {
  it("hands generation strategy, never sentences", () => {
    const decision = decisionFromRow({
      lead_id: "l1",
      status: "ok",
      personalization_depth: "deep",
      personalization_depth_confidence: 0.9,
      subject_strategy: "pain_point",
      subject_strategy_confidence: 0.9,
      cta_strategy: "soft_question",
      cta_strategy_confidence: 0.9,
    });
    const block = decisionPromptBlock(decision);
    expect(block).toContain("EMAIL STRATEGY");
    expect(block).toContain("Personalization:");
    expect(block).toContain("Subject angle:");
    // The labels themselves must not be handed over as copy to paste in.
    expect(block).not.toContain("pain_point");
    expect(block).not.toContain("soft_question");
  });

  it("says nothing at all when there is no usable decision", () => {
    // Which is what makes every failure path below harmless: the prompt is
    // byte-for-byte what it was before this layer existed.
    expect(decisionPromptBlock(null)).toBe("");
    expect(decisionPromptBlock(unavailableDecision("l1", "provider down"))).toBe("");
  });

  it("ignores a field the provider was not confident about", () => {
    const shaky = decisionFromRow({
      lead_id: "l1",
      status: "ok",
      subject_strategy: "pain_point",
      subject_strategy_confidence: CONFIDENCE.advisory - 0.01,
    });
    expect(decisionPromptBlock(shaky)).toBe("");
  });

  it("is injected into generation rather than replacing its prompt", () => {
    // The existing system prompt survives; the block is appended to it.
    expect(code(GENERATE)).toMatch(/systemPrompt \+ NO_PLATFORM_BRAND_RULE \+ strategyBlock/);
    expect(code(GENERATE)).toContain("decisionPromptBlock(decision)");
    expect(code(AGENT_RUN)).toContain("decisionPromptBlock(leadDecision)");
  });
});

/**
 * Requirement: the existing SDR must keep working when the provider does not.
 */
describe("every provider failure degrades instead of breaking", () => {
  it("names each failure kind the transport can raise", () => {
    for (const kind of ["not_configured", "timeout", "malformed", "rate_limit", "http", "unknown"]) {
      expect(PROVIDER).toContain(`"${kind}"`);
    }
    expect(new JevError("timeout", "x").kind).toBe("timeout");
  });

  it("aborts rather than hanging the caller", () => {
    expect(code(PROVIDER)).toContain("AbortController");
    expect(code(PROVIDER)).toMatch(/TIMEOUT_MS = \d+/);
    expect(code(PROVIDER)).toContain('throw new JevError(aborted ? "timeout"');
  });

  it("treats an unreadable body and an answerless body the same way", () => {
    expect(code(PROVIDER)).toContain('throw new JevError("malformed"');
    expect(code(PROVIDER)).toContain("!parsed.answers");
  });

  it("refuses a choice the provider invented", () => {
    const allowed = ["excellent", "good"];
    expect(readChoice({ icp_fit: { type: "choice", choice: "excellent", confidence: 0.9 } }, "icp_fit", allowed))
      .toEqual({ choice: "excellent", confidence: 0.9 });
    // Not in the allowed set, so it is dropped rather than passed through.
    expect(readChoice({ icp_fit: { type: "choice", choice: "amazing" } } as never, "icp_fit", allowed)).toBeNull();
    expect(readChoice({}, "icp_fit", allowed)).toBeNull();
    expect(readChoice({ icp_fit: "nonsense" } as never, "icp_fit", allowed)).toBeNull();
  });

  it("clamps a confidence outside the range it promises", () => {
    expect(readChoice({ icp_fit: { type: "choice", choice: "good", confidence: 4 } }, "icp_fit", ["good"])?.confidence).toBe(1);
    expect(readChoice({ icp_fit: { type: "choice", choice: "good", confidence: -2 } }, "icp_fit", ["good"])?.confidence).toBe(0);
    expect(readChoice({ icp_fit: { type: "choice", choice: "good" } }, "icp_fit", ["good"])?.confidence).toBe(0);
  });

  it("the evaluator returns an unavailable decision rather than throwing", () => {
    const down = unavailableDecision("l1", "provider down");
    expect(down.status).toBe("unavailable");
    expect(decisionPromptBlock(down)).toBe("");
    // And the draft-time path swallows anything left over.
    const draft = code(LAYER).slice(code(LAYER).indexOf("async function resolveDecisionForDrafting"));
    expect(draft).toContain("catch (err)");
    // The catch returns null rather than rethrowing, so a provider problem
    // cannot reach the code that is about to write an email.
    const caught = draft.slice(draft.indexOf("catch (err)"));
    expect(caught).toContain("return null;");
    expect(caught).not.toContain("throw");
  });
});

/**
 * Requirement: off behaves exactly as before, and shadow collects evidence
 * without touching a single email.
 */
describe("off, shadow, assist", () => {
  it("the flag is the master switch", async () => {
    expect(LEAD_INTELLIGENCE_FLAG).toBe("jevLeadIntelligence");
    expect(await withJevMode(undefined, () => leadIntelligenceMode(withFlag(false)))).toBe("off");
    // JEV_MODE cannot switch the layer on by itself.
    expect(await withJevMode("shadow", () => leadIntelligenceMode(withFlag(false)))).toBe("off");
    expect(await withJevMode("assist", () => leadIntelligenceMode(withFlag(false)))).toBe("off");
  });

  it("defaults to assist when the flag is on, and reads shadow when asked", async () => {
    expect(await withJevMode(undefined, () => leadIntelligenceMode(withFlag(true)))).toBe("assist");
    expect(await withJevMode("shadow", () => leadIntelligenceMode(withFlag(true)))).toBe("shadow");
    expect(await withJevMode("  SHADOW ", () => leadIntelligenceMode(withFlag(true)))).toBe("shadow");
    // Anything unrecognised is assist, not an outage.
    expect(await withJevMode("banana", () => leadIntelligenceMode(withFlag(true)))).toBe("assist");
  });

  it("off stops a decision that was already saved, not just new ones", () => {
    // It read the saved row before the flag was ever consulted, so switching
    // the feature off left every previously evaluated lead still steering its
    // own email — the one thing the flag exists to prevent.
    const draft = code(LAYER).slice(code(LAYER).indexOf("export async function decisionForDrafting"));
    const modeAt = draft.indexOf("leadIntelligenceMode(supabase)");
    const resolveAt = draft.indexOf("resolveDecisionForDrafting(");
    expect(modeAt).toBeGreaterThan(-1);
    expect(modeAt).toBeLessThan(resolveAt);
    expect(draft.slice(0, resolveAt)).toContain('if (mode === "off") return null;');
  });

  it("shadow evaluates and saves, and hands generation nothing", () => {
    const draft = code(LAYER).slice(code(LAYER).indexOf("export async function decisionForDrafting"));
    // The evaluation still runs — that is the whole point of shadow — and the
    // return is null, so decisionPromptBlock produces "".
    expect(draft).toContain("resolveDecisionForDrafting(supabase, leadId, userId, options)");
    expect(draft).toMatch(/return mode === "shadow" \? null : decision;/);
  });
});

/**
 * Requirement: the layer produces intelligence and nothing else.
 */
describe("the layer cannot act", () => {
  it("never sends, schedules or enrolls", () => {
    for (const forbidden of ["send-email", "send_drafts", "sendEmail", "schedule_drafts", "enroll"]) {
      expect(code(LAYER), forbidden).not.toContain(forbidden);
      expect(code(PROVIDER), forbidden).not.toContain(forbidden);
    }
  });

  it("writes only its own table", () => {
    const writes = [...code(LAYER).matchAll(/\.from\("(\w+)"\)[\s\S]{0,400}?\.(insert|update|upsert|delete)\(/g)]
      .map((m) => m[1]);
    for (const table of writes) {
      expect(["lead_decisions", "lead_decision_events"]).toContain(table);
    }
  });

  it("keeps its credentials on the server", () => {
    // The key is read in the edge function only; nothing under src/ names it.
    expect(PROVIDER).toContain('"TYPESAFE_API_KEY"');
    // Read at call time, so the key is never captured at module load.
    expect(code(PROVIDER)).toMatch(/const apiKey = \(\): string =>/);
    const clientSide = readFileSync("src/lib/lead-intelligence.ts", "utf8");
    expect(clientSide).not.toContain("TYPESAFE");
    expect(clientSide).not.toContain("api.typesafe.ai");
  });

  it("the browser can read decisions and never write them", () => {
    expect(MIGRATION).toContain("GRANT SELECT ON public.lead_decisions TO authenticated");
    expect(MIGRATION).toContain("FOR SELECT TO authenticated");
    expect(MIGRATION).toContain("USING (auth.uid() = user_id)");
    expect(MIGRATION).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL) TO authenticated/);
  });
});

/**
 * Requirement: do not evaluate the same unchanged lead over and over.
 */
describe("re-evaluation is driven by change, not by clock alone", () => {
  it("a changed lead invalidates the saved decision", () => {
    const row = { evaluated_at: new Date().toISOString(), input_fingerprint: "abc" };
    expect(isDecisionFresh(row, "abc")).toBe(true);
    expect(isDecisionFresh(row, "different")).toBe(false);
  });

  it("an old decision goes stale even when nothing changed", () => {
    const old = { evaluated_at: new Date(Date.now() - 400 * 86_400_000).toISOString(), input_fingerprint: "abc" };
    expect(isDecisionFresh(old, "abc")).toBe(false);
  });

  it("a row that was never evaluated is never fresh", () => {
    expect(isDecisionFresh({}, "abc")).toBe(false);
  });

  it("one evaluation answers every question, rather than one call per field", () => {
    // Ten separate provider calls for one lead is the thing the batch exists to
    // avoid, and it is what "do not double-call AI" asks for.
    expect(DECISION_KEYS.length).toBeGreaterThanOrEqual(8);
    const evaluate = code(LAYER).slice(code(LAYER).indexOf("export async function evaluateLeadWithJEV"));
    expect(evaluate).toContain("for (const key of DECISION_KEYS) questions[key]");
    expect((evaluate.match(/await askJev\(/g) ?? []).length).toBe(1);
  });
});

describe("what reads the saved intelligence", () => {
  it("the agent chat reads it and never evaluates on a chat message", () => {
    expect(AGENT_CHAT).toContain('case "get_lead_intelligence"');
    expect(AGENT_CHAT).toContain('.from("lead_decisions")');
    // Calling the provider per chat turn is the cost this avoids.
    expect(code(AGENT_CHAT)).not.toContain("evaluateLeadWithJEV");
    expect(code(AGENT_CHAT)).not.toContain("askJev");
  });

  it("the drafting surfaces share one entry point", () => {
    expect(code(GENERATE)).toContain("decisionForDrafting(");
    expect(code(AGENT_RUN)).toContain("decisionForDrafting(");
  });
});
