// Unit tests for the deterministic lead scoring engine (Phase 1).
// Run: deno test supabase/functions/_tests/lead-scoring.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_RUBRIC,
  scoreLead,
  computeIntent,
  buildReason,
  computeFit,
  SignalEventInput,
} from "../_shared/lead-scoring.ts";

const NOW = Date.parse("2026-07-26T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const ICP = {
  industries: ["Computer Software"],
  company_size_min: 51,
  company_size_max: 200,
  seniority_levels: ["VP", "Director"],
  departments: ["Sales"],
  target_titles: ["VP of Sales"],
  geographies: ["United States"],
  tech_stack: null,
};

const STRONG_LEAD = {
  industry: "Computer Software",
  company_size: "51-200",
  job_title: "VP of Sales",
  country: "United States",
  company_name: "Acme",
};

Deno.test("determinism: same inputs return the same tier and scores", () => {
  const events: SignalEventInput[] = [{ signal_type: "hiring", weight: 20, occurred_at: daysAgo(2) }];
  const a = scoreLead(STRONG_LEAD, ICP, events, DEFAULT_RUBRIC, NOW);
  const b = scoreLead(STRONG_LEAD, ICP, events, DEFAULT_RUBRIC, NOW);
  assertEquals(a.tier, b.tier);
  assertEquals(a.fit_score, b.fit_score);
  assertEquals(a.intent_score, b.intent_score);
});

Deno.test("strong fit with no signals is never A", () => {
  const r = scoreLead(STRONG_LEAD, ICP, [], DEFAULT_RUBRIC, NOW);
  assert(r.fit_score >= 70, `expected strong fit, got ${r.fit_score}`);
  // Displayed intent shows the quality baseline (never a bare 0), but the
  // underlying signal intent is 0 and tier must not reach A without a signal.
  assert(r.intent_score > 0, `baseline intent should be > 0, got ${r.intent_score}`);
  assertEquals(r.breakdown.intent.score, 0);
  assert(r.tier !== "A", `expected B or C, got ${r.tier}`);
});

Deno.test("a fired signal raises intent above the no-signal baseline", () => {
  const baseline = scoreLead(STRONG_LEAD, ICP, [], DEFAULT_RUBRIC, NOW).intent_score;
  const withSignal = scoreLead(
    STRONG_LEAD, ICP,
    [{ signal_type: "hiring_gtm", weight: 40, occurred_at: daysAgo(1) }],
    DEFAULT_RUBRIC, NOW,
  ).intent_score;
  assert(withSignal > baseline, `signal intent ${withSignal} should exceed baseline ${baseline}`);
});

Deno.test("a fired recent signal on a strong-fit lead reaches A", () => {
  const events: SignalEventInput[] = [{ signal_type: "hiring", weight: 40, occurred_at: daysAgo(1) }];
  const r = scoreLead(STRONG_LEAD, ICP, events, DEFAULT_RUBRIC, NOW);
  assertEquals(r.tier, "A");
});

Deno.test("intent decays with age", () => {
  const recent = computeIntent([{ signal_type: "x", weight: 40, occurred_at: daysAgo(1) }], DEFAULT_RUBRIC, NOW);
  const old = computeIntent([{ signal_type: "x", weight: 40, occurred_at: daysAgo(60) }], DEFAULT_RUBRIC, NOW);
  assert(recent.score > old.score, `recent ${recent.score} should exceed old ${old.score}`);
});

Deno.test("repeat account on the same company adds intent", () => {
  const single = computeIntent(
    [{ signal_type: "x", weight: 20, occurred_at: daysAgo(1), metadata: { company_name: "Acme" } }],
    DEFAULT_RUBRIC, NOW,
  );
  const repeat = computeIntent(
    [
      { signal_type: "x", weight: 20, occurred_at: daysAgo(1), metadata: { company_name: "Acme" } },
      { signal_type: "y", weight: 20, occurred_at: daysAgo(3), metadata: { company_name: "Acme" } },
    ],
    DEFAULT_RUBRIC, NOW,
  );
  assert(repeat.repeat_account, "two signals at one company should flag repeat_account");
  assert(repeat.score > single.score);
});

Deno.test("fit only counts criteria the ICP specifies", () => {
  const fit = computeFit(STRONG_LEAD, { industries: ["Computer Software"] }, DEFAULT_RUBRIC);
  assertEquals(fit.applicable, ["industry"]);
  assertEquals(fit.score, 100);
});

Deno.test("reason strings contain no em-dashes and are lowercase-first", () => {
  const events: SignalEventInput[] = [{ signal_type: "hiring_signal", weight: 30, occurred_at: daysAgo(3) }];
  const r = scoreLead(STRONG_LEAD, ICP, events, DEFAULT_RUBRIC, NOW);
  const reason = buildReason(r.breakdown.fit, r.breakdown.intent);
  assert(!reason.includes("—") && !reason.includes("–"), "no em-dashes");
  assert(!reason.includes("!"), "no exclamation");
  assert(/^[a-z]/.test(reason), `should start lowercase: ${reason}`);
});

// The leads table stores technographics in `technologies`, and both callers
// pass the raw row, so reading only `tech_stack` made the tech dimension
// permanently inapplicable. These pin the alias so it cannot regress.
Deno.test("tech fit matches on the leads `technologies` column", () => {
  const icp = { tech_stack: ["Salesforce"] };
  const fit = computeFit({ ...STRONG_LEAD, technologies: ["Salesforce", "Slack"] }, icp, DEFAULT_RUBRIC);
  assertEquals(fit.applicable, ["tech"]);
  assertEquals(fit.matched.tech, true);
  assertEquals(fit.score, 100);
});

Deno.test("tech fit still honours the legacy tech_stack field", () => {
  const icp = { tech_stack: ["Salesforce"] };
  const fit = computeFit({ ...STRONG_LEAD, tech_stack: ["Salesforce"] }, icp, DEFAULT_RUBRIC);
  assertEquals(fit.matched.tech, true);
});

Deno.test("tech fit is not applicable when the lead has no technographics", () => {
  const fit = computeFit(STRONG_LEAD, { tech_stack: ["Salesforce"] }, DEFAULT_RUBRIC);
  assertEquals(fit.applicable, []);
});

Deno.test("a non-matching stack scores the tech dimension zero rather than skipping it", () => {
  const fit = computeFit({ ...STRONG_LEAD, technologies: ["HubSpot"] }, { tech_stack: ["Salesforce"] }, DEFAULT_RUBRIC);
  assertEquals(fit.applicable, ["tech"]);
  assertEquals(fit.matched.tech, false);
  assertEquals(fit.score, 0);
});
