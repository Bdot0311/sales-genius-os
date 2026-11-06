import { describe, expect, it } from "vitest";
import { parseDimensionScore } from "../../supabase/functions/check-email-rubric/prompt";
import {
  AGENT_TARGET_SCORE,
  autonomousSendAllowed,
  type Attempt,
} from "../../supabase/functions/_shared/email-quality";
import { failingCheckerFindings, outboundGateFindings, reviseUntilClear } from "../../supabase/functions/_shared/quality-gate";
import { unsupportedClaims } from "../../supabase/functions/_shared/evidence";
import { redQualityRows, scoreEmailQuality } from "@/components/outreach/EmailQualityChecker";

const attempt = (overall: number | null, blocking: Attempt["blocking"] = []): Attempt => ({
  subject: "follow-up",
  body: "body",
  rubric: overall === null
    ? null
    : {
        overall,
        weakest: null,
        suggestions: [],
        dimensions: { relevance: { score: overall / 20, justification: "" } },
      },
  blocking,
});

describe("a rubric token is not stored as a failing zero", () => {
  it("reads an integer and a 4/5", () => {
    expect(parseDimensionScore(4)).toBe(4);
    expect(parseDimensionScore("5")).toBe(5);
    expect(parseDimensionScore("3/5")).toBe(3);
  });

  it("rejects the schema range that used to become zero", () => {
    expect(parseDimensionScore("0-5")).toBeNull();
    expect(parseDimensionScore("0 to 5")).toBeNull();
    expect(Number("0-5") || 0).toBe(0);
  });
});

describe("autonomous send uses the existing bar", () => {
  it("sends only a perfect scored draft with no rule failures", () => {
    expect(AGENT_TARGET_SCORE).toBe(100);
    expect(autonomousSendAllowed(attempt(100), "scored")).toBe(true);
    expect(autonomousSendAllowed(attempt(80), "scored")).toBe(false);
  });

  it("holds when the scorer is down", () => {
    expect(autonomousSendAllowed(attempt(null), "unavailable")).toBe(false);
  });

  it("still applies the rule check when the plan cannot call the rubric", () => {
    expect(autonomousSendAllowed(attempt(null), "plan_gated")).toBe(true);
    expect(autonomousSendAllowed(attempt(null, [{
      rule: "touch_one_pitch",
      severity: "warning",
      why: "pitch",
      fix: "cut it",
    }]), "plan_gated")).toBe(false);
  });
});

describe("the card and the send gate share one result", () => {
  const pitch = [
    "Hi Sarah,",
    "",
    "We help companies like yours build the lead sourcing and campaign infrastructure that drives",
    "predictable pipeline without adding headcount.",
    "",
    "Worth exploring?",
    "",
    "Jordan",
  ].join("\n");

  it("paints the pitch draft red and would block send", () => {
    const quality = scoreEmailQuality("quick question", pitch, true);
    expect(redQualityRows(quality).length).toBeGreaterThan(0);
    expect(quality.overallStatus).not.toBe("green");
    expect(failingCheckerFindings("quick question", pitch, 1).map((f) => f.rule))
      .toEqual(expect.arrayContaining(["touch_one_pitch"]));
  });

  it("does not treat an unsupported category pain as a pass", () => {
    const before = [
      "Hi Sam,",
      "",
      "Freight brokers usually lose the second touch. The handoff after the first reply is where it dies.",
      "",
      "How does that handoff work on your team?",
      "",
      "Jordan",
    ].join("\n");
    const beforeQuality = scoreEmailQuality("second touch", before, true);
    expect(beforeQuality.findings.map((f) => f.rule)).toContain("ungrounded_prospect_claim");
    expect(redQualityRows(beforeQuality).length).toBeGreaterThan(0);
    expect(outboundGateFindings("second touch", before, "").some((f) => f.rule === "ungrounded_prospect_claim")).toBe(true);

    const after = [
      "Hi Sam,",
      "",
      "How does follow-up work on your team after the first reply?",
      "",
      "Jordan",
    ].join("\n");
    const afterQuality = scoreEmailQuality("follow-up", after, true);
    expect(afterQuality.findings.map((f) => f.rule)).not.toContain("ungrounded_prospect_claim");
    expect(redQualityRows(afterQuality)).toEqual([]);
  });

  it("allows a paraphrase of a fact the fixture actually contains", () => {
    const evidence = "Acme's own page: second-touch replies drop after the first reply.";
    const body = "Your second-touch replies drop after the first reply.";
    expect(unsupportedClaims(body, evidence)).toEqual([]);
    expect(outboundGateFindings("acme", body, evidence).map((f) => f.rule)).not.toContain("ungrounded_prospect_claim");
  });
});

describe("generation is rechecked after the rewrite, and a failed rewrite is not a pass", () => {
  const before = "Freight brokers usually lose the second touch. The handoff after the first reply is where it dies.";
  const after = "How does follow-up work on your team after the first reply?";

  it("feeds the checker note into one rewrite and keeps the rechecked text", async () => {
    const notes: string[] = [];
    const result = await reviseUntilClear({
      subject: "follow-up",
      body: before,
      corpus: "",
      maxRewrites: 1,
      rewrite: async (_body, note) => {
        notes.push(note);
        return after;
      },
    });
    expect(notes[0]).toContain("ungrounded_prospect_claim");
    expect(result.status).toBe("clear");
    expect(result.body).toBe(after);
    expect(result.findings).toEqual([]);
    expect(result.attempts).toBe(2);
  });

  it("refuses when the rewrite does not remove the claim", async () => {
    const result = await reviseUntilClear({
      subject: "follow-up",
      body: before,
      corpus: "",
      maxRewrites: 2,
      rewrite: async () => before,
    });
    expect(result.status).toBe("refused");
    expect(result.body).toBe(before);
    expect(result.findings.some((f) => f.rule === "ungrounded_prospect_claim")).toBe(true);
  });

  it("does not treat a missing or throwing rewrite as a pass", async () => {
    const missing = await reviseUntilClear({
      subject: "follow-up",
      body: before,
      corpus: "",
      maxRewrites: 1,
      rewrite: async () => null,
    });
    expect(missing.status).toBe("refused");
    const thrown = await reviseUntilClear({
      subject: "follow-up",
      body: before,
      corpus: "",
      maxRewrites: 1,
      rewrite: async () => {
        throw new Error("checker down");
      },
    });
    expect(thrown.status).not.toBe("clear");
  });
});

describe("a page's words do not make a different event true", () => {
  const page = "Acme builds route planning software for freight brokers. They did not raise a round.";

  it("blocks a raise that only shares the page's other nouns", () => {
    const hits = unsupportedClaims(
      "You just raised a series B. Your route planning software for freight brokers is why I wrote.",
      page,
    );
    expect(hits.length).toBeGreaterThan(0);
  });

  it("allows a launch the research actually states", () => {
    expect(unsupportedClaims(
      "Saw you just launched a freight product last week.",
      "Launched a freight product last week",
    )).toEqual([]);
  });

  it("allows a question that stays on the role", () => {
    expect(unsupportedClaims(
      "How are logistics teams handling follow-up after the first reply?",
      "",
    )).toEqual([]);
  });
});
