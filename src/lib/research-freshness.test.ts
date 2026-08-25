import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OBSERVATION_FRESHNESS_DAYS,
  briefToPromptBlock,
  datingNote,
  freshObservationDates,
  isStaleObservation,
  normalizeOccurred,
  observationAgeDays,
} from "../../supabase/functions/_shared/lead-research.ts";
import {
  findUnsupportedRecency,
  unsupportedRecencyRetry,
} from "../../supabase/functions/_shared/email-rules.ts";

// Fixed clock: the date the WeAre draft actually went out.
const NOW = new Date("2026-08-25T00:00:00Z");

describe("normalizeOccurred", () => {
  it("accepts the shapes a site actually prints", () => {
    expect(normalizeOccurred("2025-11-14", NOW)).toBe("2025-11-14");
    expect(normalizeOccurred("2025-11", NOW)).toBe("2025-11");
    expect(normalizeOccurred("2025", NOW)).toBe("2025");
    expect(normalizeOccurred("November 2025", NOW)).toBe("2025-11");
    expect(normalizeOccurred("Nov 2025", NOW)).toBe("2025-11");
    expect(normalizeOccurred("November 14, 2025", NOW)).toBe("2025-11-14");
  });

  it("returns undated rather than a guess when it cannot read the value", () => {
    // Undated is handled conservatively downstream. A wrong date is not
    // recoverable, so anything unreadable has to land here.
    for (const bad of ["", "   ", "soon", "last year", "Q3", "someday", null, undefined, 42]) {
      expect(normalizeOccurred(bad as unknown, NOW), String(bad)).toBe("");
    }
  });

  it("rejects impossible years and out-of-range parts", () => {
    expect(normalizeOccurred("3025-01", NOW)).toBe("");
    expect(normalizeOccurred("1500", NOW)).toBe("");
    expect(normalizeOccurred("2025-13", NOW)).toBe("2025");
    expect(normalizeOccurred("2025-11-45", NOW)).toBe("2025-11");
  });
});

describe("observationAgeDays", () => {
  it("measures a month-only date from its last day, the reading kindest to recency", () => {
    // 2025-11 ends 2025-11-30; 2026-08-25 is 268 days later.
    expect(observationAgeDays("2025-11", NOW)).toBe(268);
  });

  it("treats a future date as today rather than as negative age", () => {
    expect(observationAgeDays("2026-12", NOW)).toBe(0);
  });

  it("has no answer for an undated observation", () => {
    expect(observationAgeDays("", NOW)).toBeNull();
    expect(observationAgeDays("not a date", NOW)).toBeNull();
  });
});

describe("staleness", () => {
  it("calls the WeAre acquisition stale", () => {
    // The whole reason this file exists.
    expect(isStaleObservation("2025-11", NOW)).toBe(true);
    expect(observationAgeDays("2025-11", NOW)!).toBeGreaterThan(OBSERVATION_FRESHNESS_DAYS);
  });

  it("leaves something inside the window alone", () => {
    expect(isStaleObservation("2026-07", NOW)).toBe(false);
  });

  it("does not call an undated observation stale — it calls it undated", () => {
    // Absence of a date is not evidence of age in either direction.
    expect(isStaleObservation("", NOW)).toBe(false);
    expect(freshObservationDates({ observations: [{ fact: "x", source: "", occurred: "" }] } as never, NOW))
      .toEqual([]);
  });
});

describe("datingNote", () => {
  it("tells the writer not to present a stale fact as news", () => {
    const note = datingNote("2025-11", NOW);
    expect(note).toContain("2025-11");
    expect(note).toContain("months ago");
    expect(note).toContain("do NOT present as news");
  });

  it("clears a fresh fact for use as news", () => {
    expect(datingNote("2026-07", NOW)).toContain("recent enough");
  });

  it("tells the writer an undated fact carries no timing", () => {
    expect(datingNote("", NOW)).toContain("do NOT imply this is recent");
  });
});

describe("briefToPromptBlock carries the dating", () => {
  const brief = {
    what_they_do: "Consulting for enterprise teams.",
    who_they_sell_to: "Enterprise ops leaders",
    observations: [
      { fact: "Acquired WeAre.", source: "https://x.com/news", occurred: "2025-11" },
    ],
    hooks: [],
    avoid: [],
    confidence: "high" as const,
  };

  it("labels a stale observation in the prompt itself", () => {
    const block = briefToPromptBlock(brief, ["https://x.com/news"]);
    expect(block).toContain("Acquired WeAre.");
    expect(block).toContain("do NOT present as news");
  });

  it("bans time claims outright when nothing is fresh", () => {
    const block = briefToPromptBlock(brief, ["https://x.com/news"]);
    expect(block).toContain("TIMING:");
    expect(block).toContain("no month names");
  });

  it("says nothing about timing when something genuinely is recent", () => {
    const fresh = { ...brief, observations: [{ ...brief.observations[0], occurred: "2026-08" }] };
    expect(briefToPromptBlock(fresh, [])).not.toContain("TIMING:");
  });
});

describe("findUnsupportedRecency", () => {
  it("catches the line that shipped", () => {
    const draft = "Hi Wiktor,\n\nSaw the WeAre acquisition in November. Usually means growth phase.";
    expect(findUnsupportedRecency(draft, [])).toContain("November");
  });

  it("allows a month the research actually supports", () => {
    const draft = "Saw the WeAre acquisition in August.";
    expect(findUnsupportedRecency(draft, ["2026-08"])).toEqual([]);
  });

  it("still catches a different month when something else is fresh", () => {
    // A fresh fact does not license dating a stale one.
    const draft = "Saw the WeAre acquisition in November.";
    expect(findUnsupportedRecency(draft, ["2026-08"])).toContain("November");
  });

  it("catches vague recency when nothing at all is fresh", () => {
    expect(findUnsupportedRecency("You recently launched the new tier.", [])).toContain("recently");
    expect(findUnsupportedRecency("Saw you just raised.", [])).toContain("just raised");
    expect(findUnsupportedRecency("Noticed the change last week.", [])).toContain("last week");
  });

  it("leaves vague recency alone when a fresh fact backs it", () => {
    expect(findUnsupportedRecency("You recently launched the new tier.", ["2026-08"])).toEqual([]);
  });

  it("does not fire on 'may' the verb", () => {
    expect(findUnsupportedRecency("This may be worth a look.", [])).toEqual([]);
    expect(findUnsupportedRecency("You may already do this.", [])).toEqual([]);
  });

  it("does fire on 'May' the month", () => {
    expect(findUnsupportedRecency("Since May you've doubled the team.", [])).toContain("May");
  });

  it("says nothing about a draft that makes no time claim", () => {
    const clean = "Hi Sam,\n\nYou run onboarding for enterprise teams. Worth a look?\n\nBrandon";
    expect(findUnsupportedRecency(clean, [])).toEqual([]);
  });

  it("names the offending claims in the retry", () => {
    const retry = unsupportedRecencyRetry(["November", "recently"]);
    expect(retry).toContain('"November"');
    expect(retry).toContain('"recently"');
    expect(retry).toContain("without dating it");
  });
});

describe("generate-email keeps the recency guard wired", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/generate-email/index.ts", import.meta.url),
    "utf8",
  );

  it("checks the finished draft's time claims against dated research", () => {
    expect(SRC).toContain("findUnsupportedRecency");
    expect(SRC).toContain("freshObservationDates");
  });

  it("blocks a named month the research cannot support", () => {
    expect(SRC).toContain("unsupported_recency");
    expect(SRC).toContain("datedLies");
  });

  it("reports softer recency as weakness instead of losing the draft", () => {
    expect(SRC).toMatch(/quality_weak:[^\n]*recency\.length/);
  });
});

describe("research-lead asks for and normalizes the date", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/research-lead/index.ts", import.meta.url),
    "utf8",
  );

  it("requests occurred in the brief schema", () => {
    expect(SRC).toContain('"occurred": string');
    expect(SRC).toContain("DATE EVERY OBSERVATION YOU CAN");
  });

  it("forbids inventing a date rather than leaving it blank", () => {
    expect(SRC).toContain("Never estimate one");
  });

  it("normalizes rather than trusting what the model returned", () => {
    expect(SRC).toContain("occurred: normalizeOccurred(o.occurred)");
  });

  it("keeps a signal event's own date through the merge", () => {
    // Dropping it made a verified dated event look like an undated scrape.
    expect(SRC).toContain("occurred: normalizeOccurred(f.occurred_at");
  });
});
