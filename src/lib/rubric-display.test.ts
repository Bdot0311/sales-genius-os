import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CANNOT_AUTOFIX } from "./email-quality-fixes";
import {
  STRONG_SCORE,
  allStrong,
  barColorFor,
  suggestionKey,
  unresolvedAfterApply,
  weakestDimension,
} from "./rubric-display";

const dims = (...scores: number[]) =>
  Object.fromEntries(
    ["relevance", "empathy", "payoff", "low_friction_ask", "you_focused"].map((d, i) => [
      d,
      { score: scores[i] },
    ]),
  );

/**
 * "Turn all the reply rubric scores green and they don't."
 *
 * They could not. check-email-rubric's reduce always names a weakest — it
 * starts from DIMS[0] and keeps the first on a tie, so five identical scores
 * still return one — and the panel painted whatever it named red, whatever the
 * number behind it. A draft scoring 5/5 on every dimension rendered one red
 * bar labelled "weakest". All-green was unreachable by construction.
 */
describe("a score is coloured by the score", () => {
  it("is green at the bar and above", () => {
    expect(barColorFor(5)).toBe("bg-green-500");
    expect(barColorFor(STRONG_SCORE)).toBe("bg-green-500");
  });

  it("steps down through yellow and orange", () => {
    expect(barColorFor(3)).toBe("bg-yellow-500");
    expect(barColorFor(2)).toBe("bg-orange-500");
  });

  it("is only red when the score is actually bad", () => {
    expect(barColorFor(1)).toBe("bg-destructive");
    expect(barColorFor(0)).toBe("bg-destructive");
  });
});

describe("what counts as the weakest dimension", () => {
  it("is nothing at all when everything is strong", () => {
    // The case that made all-green impossible.
    expect(weakestDimension(dims(5, 5, 5, 5, 5))).toBeNull();
    expect(weakestDimension(dims(4, 5, 4, 5, 4))).toBeNull();
  });

  it("is the unique lowest when there is one", () => {
    expect(weakestDimension(dims(2, 5, 5, 5, 5))).toBe("relevance");
    expect(weakestDimension(dims(5, 5, 5, 5, 1))).toBe("you_focused");
  });

  it("is nothing when several are tied at the bottom", () => {
    // Picking the first of a tie and painting it red states something untrue:
    // there is no single weakest, and fixing that one changes nothing.
    expect(weakestDimension(dims(2, 2, 5, 5, 5))).toBeNull();
    expect(weakestDimension(dims(3, 3, 3, 3, 3))).toBeNull();
  });

  it("copes with no scores at all", () => {
    expect(weakestDimension(null)).toBeNull();
    expect(weakestDimension({})).toBeNull();
  });
});

describe("telling the user the email is done", () => {
  it("is true only when every dimension clears the bar", () => {
    expect(allStrong(dims(4, 4, 4, 4, 4))).toBe(true);
    expect(allStrong(dims(5, 5, 5, 5, 3))).toBe(false);
  });

  it("is false with nothing scored", () => {
    expect(allStrong(null)).toBe(false);
    expect(allStrong({})).toBe(false);
  });
});

/**
 * applied and dismissed were sets of ARRAY INDICES, and the suggestion array is
 * replaced on every re-score. Applying a suggestion edits the body, which
 * triggers a re-score — so the "applied" badge vanished a second later, and
 * index 2 was now a different suggestion wearing the old one's state.
 */
describe("a suggestion is identified by what it says", () => {
  const a = { dimension: "payoff", snippet: "we help teams", suggestion: "name the outcome" };

  it("is stable across re-orderings", () => {
    expect(suggestionKey(a)).toBe(suggestionKey({ ...a }));
  });

  it("differs when the suggestion differs", () => {
    expect(suggestionKey(a)).not.toBe(suggestionKey({ ...a, suggestion: "cut it" }));
  });

  it("differs when it points at different text", () => {
    expect(suggestionKey(a)).not.toBe(suggestionKey({ ...a, snippet: "worth a look" }));
  });

  it("survives missing fields rather than throwing", () => {
    expect(typeof suggestionKey({})).toBe("string");
  });
});

describe("a suggestion that comes back after being applied", () => {
  const s1 = { dimension: "payoff", snippet: "we help teams", suggestion: "name the outcome" };
  const s2 = { dimension: "empathy", snippet: "hope you are well", suggestion: "cut the opener" };

  it("is reported, not silently re-offered", () => {
    // The rubric read the rewritten draft and still wants this changed, so the
    // apply did not move what it was aimed at. Showing a fresh button instead
    // is what made "it didn't do anything" indistinguishable from "it's broken".
    const applied = new Set([suggestionKey(s1)]);
    expect(unresolvedAfterApply([s1, s2], applied)).toEqual([suggestionKey(s1)]);
  });

  it("says nothing when the applied one is gone", () => {
    const applied = new Set([suggestionKey(s1)]);
    expect(unresolvedAfterApply([s2], applied)).toEqual([]);
  });
});

describe("the panel uses these rather than the server's answer", () => {
  const PANEL = readFileSync("src/components/outreach/EmailRubricPanel.tsx", "utf8");

  it("derives the weakest instead of trusting the response field", () => {
    expect(PANEL).toContain("weakestDimension(dims)");
    expect(PANEL).not.toContain("setWeakest");
  });

  it("no longer has a painter that takes weakest as an input", () => {
    expect(PANEL).not.toContain("barColor(dim.score");
    expect(PANEL).toContain("barColorFor(dim.score)");
  });

  it("keys applied and dismissed by identity", () => {
    expect(PANEL).toContain("useState<Set<string>>");
    expect(PANEL).toContain("suggestionKey(s)");
  });

  it("does not wipe that state on a re-score", () => {
    // The line that erased it a second after every apply.
    expect(PANEL).not.toContain("setApplied(new Set());");
    expect(PANEL).not.toContain("setDismissed(new Set());");
  });

  it("says so when a draft has nothing left holding it back", () => {
    expect(PANEL).toContain("allStrong(dims)");
  });
});

describe("a Fix button that cannot work is not offered", () => {
  const FIXES = readFileSync("src/lib/email-quality-fixes.ts", "utf8");
  const CHECKER = readFileSync("src/components/outreach/EmailQualityChecker.tsx", "utf8");

  it("no longer strips every tag out of the email", () => {
    // The Signature "fix" ran a strip-all-tags over the whole draft: not one
    // word changed, and the formatting was flattened. Asserted on the switch
    // rather than on the string, which still appears in the comment recording
    // what it used to do.
    const cases = FIXES.slice(FIXES.indexOf("switch (label)"));
    expect(cases).not.toMatch(/case "Signature":\s*\n\s*fixed =/);
  });

  it("names the checks no body edit can resolve", () => {
    // Pinned to the rule rather than to the membership list: every label in
    // the set must have no case in the switch, and no label with a case in
    // the switch may be in the set. Asserting the literal set meant adding a
    // second unfixable check broke a test that had no opinion about it.
    const cases = FIXES.slice(FIXES.indexOf("switch (label)"));
    const handled = new Set([...cases.matchAll(/case "([^"]+)":/g)].map((m) => m[1]));
    const unfixable = [...CANNOT_AUTOFIX];
    expect(unfixable.length).toBeGreaterThan(0);
    expect(unfixable).toContain("Signature");
    for (const label of unfixable) expect(handled.has(label)).toBe(false);
  });

  it("hides the button for them", () => {
    expect(CHECKER).toContain("!CANNOT_AUTOFIX.has(check.label)");
  });
});
