import { describe, expect, it } from "vitest";
import {
  computeFit,
  computeIntent,
  DEFAULT_RUBRIC,
  scoreLead,
  type IcpInput,
  type LeadInput,
  type SignalEventInput,
} from "../../supabase/functions/_shared/lead-scoring.ts";

const NOW = Date.parse("2026-08-13T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const ICP: IcpInput = {
  industries: ["computer software"],
  company_size_min: 51,
  company_size_max: 200,
  seniority_levels: ["vp"],
  geographies: ["US"],
};

const IN_ICP: LeadInput = {
  job_title: "VP of Sales",
  industry: "computer software",
  company_size: "51-200",
  country: "US",
};

const OUT_OF_ICP: LeadInput = {
  job_title: "Intern",
  industry: "mining & metals",
  company_size: "10001+",
  country: "BR",
};

const techChange = (days: number): SignalEventInput => ({
  signal_type: "tech_stack_change",
  weight: 35,
  occurred_at: daysAgo(days),
  metadata: { product: "Salesforce", change: "removed" },
});

describe("a tech signal drives intent", () => {
  it("lifts intent above a lead with nothing on record", () => {
    // The whole point of detecting a tech-stack change: an account that just
    // dropped a tool should not read the same as one where nothing happened.
    const quiet = computeIntent([], DEFAULT_RUBRIC, NOW);
    const churned = computeIntent([techChange(2)], DEFAULT_RUBRIC, NOW);

    expect(quiet.score).toBe(0);
    expect(churned.score).toBeGreaterThan(0);
    expect(churned.top_signal).toBe("tech_stack_change");
  });

  it("decays as the change gets older", () => {
    // A tool dropped today is a reason to write today. Six months on it is not.
    const fresh = computeIntent([techChange(0)], DEFAULT_RUBRIC, NOW).score;
    const stale = computeIntent([techChange(180)], DEFAULT_RUBRIC, NOW).score;

    expect(fresh).toBeGreaterThan(stale);
  });

  it("reports how recent the change was, for the opener to use", () => {
    expect(computeIntent([techChange(6)], DEFAULT_RUBRIC, NOW).most_recent_days).toBe(6);
  });
});

describe("fit and intent are independent measurements", () => {
  // They were not: the v1 scorer wrote one blend of fit, contact quality and
  // data freshness into both icp_score and intent_score, so the two badges
  // shown side by side always carried the identical number and neither one
  // meant what its label said.

  it("a perfect ICP match with no signals has fit without intent", () => {
    const r = scoreLead(IN_ICP, ICP, [], DEFAULT_RUBRIC, NOW);

    expect(r.fit_score).toBe(100);
    expect(r.breakdown.intent.score).toBe(0);
    // The displayed intent still shows a quality baseline rather than a bare 0,
    // but it must stay well clear of the fit score.
    expect(r.intent_score).toBeLessThan(r.fit_score);
  });

  it("a poor ICP match with a fresh signal has intent without fit", () => {
    const r = scoreLead(OUT_OF_ICP, ICP, [techChange(1)], DEFAULT_RUBRIC, NOW);

    expect(r.fit_score).toBe(0);
    expect(r.breakdown.intent.score).toBeGreaterThan(0);
  });

  it("the two move on different inputs", () => {
    const noSignal = scoreLead(IN_ICP, ICP, [], DEFAULT_RUBRIC, NOW);
    const withSignal = scoreLead(IN_ICP, ICP, [techChange(1)], DEFAULT_RUBRIC, NOW);

    // Same lead, same ICP: fit cannot move, intent must.
    expect(withSignal.fit_score).toBe(noSignal.fit_score);
    expect(withSignal.intent_score).toBeGreaterThan(noSignal.intent_score);
  });
});

describe("fit is measured against the stated ICP", () => {
  // Search used a generic seniority table instead — CEO 38, VP 22, director 18
  // — so a lead outside every stated industry, size band and geography still
  // scored highly on the strength of their job title alone.

  it("scores a lead outside the ICP low regardless of seniority", () => {
    const senior = { ...OUT_OF_ICP, job_title: "Chief Executive Officer" };

    expect(computeFit(senior, ICP, DEFAULT_RUBRIC).score).toBe(0);
  });

  it("only counts dimensions the ICP actually states", () => {
    // An ICP naming only an industry must not penalise a lead for a geography
    // that was never specified.
    const industryOnly: IcpInput = { industries: ["computer software"] };

    expect(computeFit(IN_ICP, industryOnly, DEFAULT_RUBRIC).score).toBe(100);
  });

  it("returns 0 when there is no ICP to measure against", () => {
    // Callers turn this into null rather than showing 0, which would read as
    // "matches nothing" when the truth is "nothing was stated".
    expect(computeFit(IN_ICP, null, DEFAULT_RUBRIC).score).toBe(0);
  });

  it("counts a matching tech stack when the ICP names one", () => {
    const techIcp: IcpInput = { tech_stack: ["salesforce"] };
    const running = { ...IN_ICP, technologies: ["Salesforce", "Slack"] };

    expect(computeFit(running, techIcp, DEFAULT_RUBRIC).score).toBe(100);
    expect(computeFit(IN_ICP, techIcp, DEFAULT_RUBRIC).applicable).toEqual([]);
  });
});
