import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { auditEmail } from "../../supabase/functions/_shared/email-audit";
import { BANNED_PHRASES } from "../../supabase/functions/_shared/email-rules";
import {
  SPAM_TRIGGERS,
  auditDeliverability,
  ctaPlacement,
  deliverabilityReport,
  readingGrade,
  youRatio,
} from "../../supabase/functions/_shared/email-deliverability";
import { blockerSummary, scoreEmailQuality } from "@/components/outreach/EmailQualityChecker";
import { CANNOT_AUTOFIX, applyEmailQualityFix } from "./email-quality-fixes";
import { computeMechanicalChecks } from "./email-rubric";

/**
 * Email scoring existed four times.
 *
 * The live quality card in Outreach Studio, a dead duplicate of it in
 * src/lib/email-quality-checker.ts with zero importers, the deterministic half
 * of the rubric panel, and the server's own audit. Four deterministic engines,
 * four sets of thresholds, and one of them gates the send.
 *
 * They disagreed in ways that cost real sends. The card's banned-phrase list
 * held 11 entries against the server's 79, so "We help companies like yours
 * build the lead sourcing and campaign infrastructure" scored 83/100, showed
 * green, and went to a prospect — while the same text was a warning on the
 * server and would have been held by agent-run. The word ceiling was 75/130
 * here, 90/130 in the rubric and 50/90/140 on the server. The card counted
 * question marks where the server counts asks.
 *
 * These tests pin the shape of the fix, not its current numbers: one
 * implementation per rule, and the card reporting exactly what the server
 * found rather than its own opinion of the same email.
 */

const ROOT = process.cwd();
const grepCount = (pattern: string): string[] => {
  try {
    // Test files are excluded: a test that names a pattern is not a second
    // implementation of it, and this file names every one of them.
    return execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", pattern, "--", "src", "supabase", ":(exclude)*.test.ts"],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};

/** The draft that reached a prospect at 83/100. */
const PITCH_DRAFT = [
  "Hi Sarah,",
  "",
  "We help companies like yours build the lead sourcing and campaign infrastructure that drives",
  "predictable pipeline without adding headcount. Teams like yours usually see clear ROI inside a quarter.",
  "",
  "Worth exploring?",
  "",
  "Best,",
  "Brandon",
].join("\n");

describe("there is one implementation of each deterministic rule", () => {
  it("the dead fourth copy is gone", () => {
    // 161 lines, exported checkEmailQuality, imported by nothing.
    expect(existsSync("src/lib/email-quality-checker.ts")).toBe(false);
    expect(grepCount("checkEmailQuality")).toEqual([]);
  });

  it("one banned-phrase list", () => {
    // It was five: the server's, the card's eleven, OUTBOUND_KB.deadPhrases,
    // the replacement table in email-quality-fixes, and a copy inside
    // Outreach.tsx kept only to tell the model what to remove.
    // The declaration of a list, not every use of the name: generate-email
    // assigns bannedPhrasesBlock() to a local of the same name, which is the
    // shared list being read, not a copy of it.
    expect(grepCount("(const|let) BANNED_PHRASES(: string\\[\\])? = \\[")).toEqual([
      "supabase/functions/_shared/email-rules.ts",
    ]);
  });

  it("one spam-trigger list", () => {
    // Four copies: the rubric panel's twelve words, the card's eleven, and the
    // sixteen that agent-run and agent-test each declared privately, with
    // their own identical copy of deliverabilityCheck over the top.
    expect(grepCount("(const|let) SPAM_TRIGGERS(: string\\[\\])? = \\[")).toEqual([
      "supabase/functions/_shared/email-deliverability.ts",
    ]);
    expect(grepCount("function deliverabilityCheck")).toEqual([
      "supabase/functions/_shared/email-deliverability.ts",
    ]);
  });

  it("one syllable counter and one reading grade", () => {
    expect(grepCount("function countSyllables|const countSyllables")).toEqual([
      "supabase/functions/_shared/email-deliverability.ts",
    ]);
    expect(grepCount("15\\.59")).toEqual(["supabase/functions/_shared/email-deliverability.ts"]);
  });

  it("the card carries no rule of its own", () => {
    const CARD = readFileSync("src/components/outreach/EmailQualityChecker.tsx", "utf8");
    // Twelve compute* functions, four phrase lists and two regexes lived here.
    expect(CARD).not.toMatch(/function compute[A-Z]/);
    expect(CARD).toContain('from "../../../supabase/functions/_shared/email-audit"');
    expect(CARD).toContain('from "../../../supabase/functions/_shared/email-deliverability"');
  });

  it("the rubric panel's mechanical checks read the same modules", () => {
    const RUBRIC = readFileSync("src/lib/email-rubric.ts", "utf8");
    expect(RUBRIC).toContain("email-deliverability");
    expect(RUBRIC).toContain("email-audit");
    expect(RUBRIC).not.toMatch(/function syllables/);
  });

  it("the studio builds a fix instruction from the finding, not from a list", () => {
    const STUDIO = readFileSync("src/pages/Outreach.tsx", "utf8");
    expect(STUDIO).toContain("WHAT TRIGGERED THIS:");
    expect(STUDIO).not.toContain("'hope this finds you well', 'just checking in'");
  });
});

describe("the card cannot disagree with the server", () => {
  const sample = (subject: string, body: string) => {
    const card = scoreEmailQuality(subject, body, true);
    const server = auditEmail({ subject, body, position: 1 });
    return { card, server };
  };

  it("reports every writing rule the server found", () => {
    for (const [subject, body] of [
      ["quick question", PITCH_DRAFT],
      ["pricing", "Hi [FIRST_NAME], noticed the four SDR roles. Worth a look?"],
      ["ramp", `Hi Dana, ${"word ".repeat(200)}Worth a look?`],
      ["", "Hi Dana, let me know if that is useful. Should I send it?"],
    ] as Array<[string, string]>) {
      const { card, server } = sample(subject, body);
      const reported = new Set(card.findings.map((f) => f.rule));
      for (const f of server) expect(reported.has(f.rule)).toBe(true);
    }
  });

  it("catches the pitch draft that scored 83 and shipped", () => {
    const { card } = sample("quick question", PITCH_DRAFT);
    const rules = card.findings.map((f) => f.rule);
    expect(rules).toContain("touch_one_pitch");
    expect(rules).toContain("banned_phrase");
    expect(card.overallStatus).not.toBe("green");
    expect(card.overallScore).toBeLessThan(75);
  });

  it("names the phrases the old eleven-entry list waved through", () => {
    const { card } = sample("quick question", PITCH_DRAFT);
    const banned = card.findings.find((f) => f.rule === "banned_phrase")?.evidence ?? "";
    expect(banned).toContain("companies like yours");
    expect(banned).toContain("predictable pipeline");
    expect(banned).toContain("without adding headcount");
  });

  it("shows the server's evidence rather than its own wording", () => {
    const { card, server } = sample("quick question", PITCH_DRAFT);
    const row = card.checks.find((c) => c.label === "Banned Phrases");
    expect(row?.message).toBe(server.find((f) => f.rule === "banned_phrase")?.evidence);
  });
});

describe("a blocker fails the draft on its own", () => {
  /*
   * The old overall was the mean of the check scores. One check at 20 among
   * fourteen at 100 averages to 94 — green, sends. A blocker could not fail a
   * draft, and every check added diluted the next one.
   */
  const WITH_PLACEHOLDER =
    "Hi [FIRST_NAME],\n\nNoticed the four SDR roles you posted, which usually means ramp eats the quarter.\n\nWorth a look?\n\nBest,\nBrandon";

  it("is red whatever the rest of the card says", () => {
    const card = scoreEmailQuality("sdr ramp", WITH_PLACEHOLDER, true);
    expect(card.blockers.map((f) => f.rule)).toContain("unfilled_placeholder");
    expect(card.overallStatus).toBe("red");
  });

  it("costs more than a note in the number", () => {
    // Identical but for the merge field, so the word count and every other
    // rule are held constant and the gap is the blocker alone.
    const clean = "Hi Dana, four SDR roles went up this month, which usually means ramp eats the quarter. Worth a look?";
    const blocked = clean.replace("Dana", "[FIRST_NAME]");
    const gap = scoreEmailQuality("sdr ramp", clean).overallScore - scoreEmailQuality("sdr ramp", blocked).overallScore;
    expect(gap).toBeGreaterThanOrEqual(30);
  });

  it("says which rule stopped the send", () => {
    const card = scoreEmailQuality("sdr ramp", WITH_PLACEHOLDER, true);
    const summary = blockerSummary(card.blockers);
    expect(summary).toContain("unfilled placeholder");
    expect(summary).toContain("[FIRST_NAME]");
  });

  it("opens the gate for a draft that breaks nothing", () => {
    const good = [
      "Hi Dana,",
      "",
      "Four SDR openings went up on your careers page this month. In teams that size the ramp",
      "usually lands on whoever closed last quarter, so the quota carrier ends up training instead",
      "of selling and both numbers slip. Kogenie ran into the same thing at nine reps.",
      "",
      "Worth a quick look at how they split it?",
      "",
      "Best,",
      "Brandon",
    ].join("\n");
    const proof = "Four SDR openings went up on your careers page this month. In teams that size the ramp usually lands on whoever closed last quarter. Kogenie ran into the same thing at nine reps.";
    const card = scoreEmailQuality("sdr ramp", good, true, { company: "Kogenie", contactName: "Dana" }, proof);
    expect(card.blockers).toEqual([]);
  });

  it("opens the gate when the greeting is general, a nickname or a title", () => {
    // A bulk template opening "Hi there," used to fail for every lead in the
    // batch, because the greeting had to carry the lead's exact first name.
    const rest = [
      "",
      "Four SDR openings went up on your careers page this month. In teams that size the ramp",
      "usually lands on whoever closed last quarter, so the quota carrier ends up training instead",
      "of selling and both numbers slip. Kogenie ran into the same thing at nine reps.",
      "",
      "Worth a quick look at how they split it?",
      "",
      "Best,",
      "Brandon",
    ].join("\n");
    for (const greeting of ["Hi there,", "Hi team,", "Hey everyone,", "Hi Bob,", "Dear Dr. Smith,"]) {
      const proof = "Four SDR openings went up on your careers page this month. In teams that size the ramp usually lands on whoever closed last quarter. Kogenie ran into the same thing at nine reps.";
      const card = scoreEmailQuality("sdr ramp", greeting + rest, true, {
        company: "Kogenie",
        contactName: "Robert Smith",
      }, proof);
      expect(card.blockers.map((f) => f.rule), `blocked: ${greeting}`).not.toContain("name_mismatch");
    }
  });

  it("still closes the gate when the greeting names someone else", () => {
    const body =
      "Hi Jane,\n\nFour SDR openings went up on your careers page this month at Kogenie. Worth a quick look?";
    const card = scoreEmailQuality("sdr ramp", body, true, { company: "Kogenie", contactName: "Robert Smith" });
    expect(card.blockers.map((f) => f.rule)).toContain("name_mismatch");
  });

  it("both send gates key on the red rows, which include the blockers", () => {
    const STUDIO = readFileSync("src/pages/Outreach.tsx", "utf8");
    const BULK = readFileSync("src/components/outreach/BulkSendDialog.tsx", "utf8");
    expect(STUDIO).toContain("redQualityRows(quality)");
    expect(BULK).toContain("redQualityRows(quality)");
    expect(STUDIO).toContain("blockerSummary(quality.blockers)");
    expect(BULK).toContain("blockerSummary(quality.blockers)");
  });
});

describe("every row the card shows can be acted on", () => {
  const labels = scoreEmailQuality("a subject line", "Hi Dana, worth a look?").checks.map((c) => c.label);
  const FIXES = readFileSync("src/lib/email-quality-fixes.ts", "utf8");
  const STUDIO = readFileSync("src/pages/Outreach.tsx", "utf8");
  const localCases = new Set(
    [...FIXES.slice(FIXES.indexOf("switch (label)")).matchAll(/case "([^"]+)":/g)].map((m) => m[1]),
  );
  const aiInstructions = new Set(
    [...STUDIO.matchAll(/^      '([^']+)': `TASK:/gm)].map((m) => m[1]),
  );

  /*
   * Renaming a row used to break its Fix button silently: the switch and the
   * instruction map are keyed by label, and nothing checked they still matched.
   * "Personalization" became "Placeholders" in this change, which is exactly
   * the mistake this catches.
   */
  it("has a fix path or an honest refusal for each label", () => {
    expect(labels.length).toBeGreaterThan(10);
    for (const label of labels) {
      const covered = localCases.has(label) || aiInstructions.has(label) || CANNOT_AUTOFIX.has(label);
      expect(covered, `no fix path for "${label}"`).toBe(true);
    }
  });

  it("no fix path points at a row that no longer exists", () => {
    for (const label of [...localCases, ...aiInstructions, ...CANNOT_AUTOFIX]) {
      expect(labels, `"${label}" has a fix but no row`).toContain(label);
    }
  });

  it("the local fixes still do what they claim", () => {
    expect(applyEmailQualityFix("We leverage synergy to streamline.", "Banned Phrases")).not.toContain("leverage");
    expect(applyEmailQualityFix("<p>Hi</p><img src=x>", "Images")).not.toContain("<img");
  });
});

describe("the deliverability rules", () => {
  it("never return a blocker — a link is not a reason to refuse a send", () => {
    const findings = auditDeliverability({
      subject: "Act Now Limited Time Free Guarantee",
      body: '<p>CLICK HERE!! <a href="http://x.com">x</a><img src="y"> attached</p>',
      isFirstTouch: true,
    });
    expect(findings.length).toBeGreaterThan(4);
    expect(findings.some((f) => f.severity === "blocker")).toBe(false);
  });

  it("counts a spam trigger once, from one list", () => {
    const { metrics } = deliverabilityReport({ body: "This is free and risk free." });
    expect(metrics.spamHits).toEqual(["free", "risk free"]);
    expect(SPAM_TRIGGERS).toContain("100%");
  });

  it("holds a first touch to the stricter image rule", () => {
    const body = '<img src="x">';
    expect(auditDeliverability({ body, isFirstTouch: true })[0].severity).toBe("warning");
    expect(auditDeliverability({ body, isFirstTouch: false })[0].severity).toBe("note");
  });

  it("stays silent about placement when there is no question to place", () => {
    // The old card reported "No clear ask detected" and "No question detected
    // — add a CTA" as two failures for one missing sentence. The audit's
    // no_ask rule owns that absence.
    expect(ctaPlacement("Hi Dana. Let me know.")).toBeNull();
    expect(auditDeliverability({ body: "Hi Dana. Let me know." }).map((f) => f.rule)).not.toContain("cta_buried");
  });

  it("finds the ask on the closing line, past a sign-off and a PS", () => {
    const body = "Hi Dana,\n\nFour roles went up this month and ramp lands on your closer.\n\nWorth a look?\n\nBest,\nBrandon\n\nP.S. no reply needed if not.";
    expect(ctaPlacement(body)).toBe("last");
  });

  it("reads the you-to-we balance off clause openings", () => {
    expect(youRatio("We built this. We help teams. Our platform scales.")).toBe(0);
    expect(youRatio("Your team ships weekly. You carry the quota.")).toBe(1);
    expect(youRatio("Ramp eats the quarter.")).toBeNull();
  });

  it("grades density on one formula", () => {
    expect(readingGrade("The cat sat. The dog ran.")).toBeLessThan(5);
    expect(readingGrade("Notwithstanding the aforementioned considerations, the implementation necessitates comprehensive organisational realignment.")).toBeGreaterThan(11);
  });
});

describe("the rubric panel keeps its shape", () => {
  const result = computeMechanicalChecks("Quick Question About Your Pipeline", "Hi [Company], this is FREE!! <a href='http://x'>x</a>");

  it("still returns the keys the panel renders", () => {
    expect(result.checks.map((c) => c.key)).toEqual([
      "word_count", "reading_grade", "links", "images", "attachment",
      "spam", "all_caps", "punctuation", "tokens", "subject_length", "subject_style",
    ]);
  });

  it("reports the numbers from the shared metrics", () => {
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.readingGrade).toBeGreaterThan(0);
    expect(result.unresolvedTokens).toContain("[Company]");
    expect(result.checks.find((c) => c.key === "tokens")?.severity).toBe("bad");
    expect(result.checks.find((c) => c.key === "spam")?.detail).toContain("free");
  });

  it("does not hold an unknown touch to the first-touch image rule", () => {
    const warm = computeMechanicalChecks("ramp", '<img src="x">');
    expect(warm.checks.find((c) => c.key === "images")?.severity).toBe("warn");
  });
});

describe("the phrases the card checked and the server did not", () => {
  it("are now on the one list", () => {
    const lower = BANNED_PHRASES.map((p) => p.toLowerCase());
    for (const phrase of ["quick call", "touch base", "i help companies"]) {
      expect(lower).toContain(phrase);
    }
  });

  it("except the one the playbook's own closing line uses", () => {
    // OUTBOUND_KB banned "happy to", and the playbook recommends "happy to
    // send the one-pager" as the low-friction ask. Banning the substring would
    // flag the sentence the product tells people to write.
    expect(BANNED_PHRASES.map((p) => p.toLowerCase())).not.toContain("happy to");
    expect(auditEmail({ body: "Four SDR roles went up this month. Happy to send the one-pager?" }).map((f) => f.rule))
      .not.toContain("banned_phrase");
  });
});

describe("the agent audits the same two rule sets the card shows", () => {
  const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("runs both in audit_email", () => {
    // An agent that audits an email and says nothing about the three links in
    // it is reporting half of what the user is already looking at. The tool
    // and the Opus prelude share one function, so the two rule sets cannot drift.
    const shared = readFileSync("supabase/functions/_shared/copy-audit.ts", "utf8");
    expect(CHAT).toContain("runMechanicalAudit({");
    expect(shared).toContain("auditDeliverability({");
    expect(shared).toContain('from "./email-deliverability.ts"');
  });

  it("does not let a deliverability warning block its send", () => {
    /*
     * The send gate filters `severity !== "note"` and holds the draft. One
     * link is a warning here and would have stopped the agent sending at all,
     * so that gate reads the writing rules only — which is why nothing in
     * email-deliverability.ts is ever a blocker.
     */
    const gate = CHAT.slice(CHAT.indexOf("const blocking = modelAuthored"), CHAT.indexOf("const attempt: Attempt"));
    expect(gate).toContain("auditEmail({");
    expect(gate).not.toContain("auditDeliverability");
  });
});
