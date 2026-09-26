import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { scoreBreakdown } from "./reputation";

const SHARED = readFileSync("supabase/functions/_shared/reputation.ts", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260926160000_reputation_drop_open_penalty.sql",
  "utf8",
);
const GRID = readFileSync("src/components/deliverability/AccountHealthGrid.tsx", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const sql = (s: string) => s.replace(/^\s*--.*$/gm, "");

const NONE = { outreach_sent: 0, bounced: 0, complaints: 0, warmup_inbox: 0, warmup_spam: 0 };

/**
 * The two mailboxes from the report, with the numbers the page displayed.
 *
 * "65 Fair" and "50 Fair" sat beside a warmup panel reading 100% inbox
 * placement, and read as the page contradicting itself. They were both right:
 * the score is bounces, placement is where accepted mail lands, and bounced
 * mail was never accepted. These are the real figures, so a change that breaks
 * the attribution breaks this test.
 */
describe("attributing a real mailbox's deficit", () => {
  // 2 bounces of 34 outreach sends, 116 warmup, all of it inboxed.
  const brandon = { outreach_sent: 34, bounced: 2, complaints: 0, warmup_inbox: 116, warmup_spam: 0 };
  // 3 bounces of 35. The worse of the two.
  const sales = { outreach_sent: 35, bounced: 3, complaints: 0, warmup_inbox: 116, warmup_spam: 0 };

  it("names bounces as the only cause", () => {
    const b = scoreBreakdown(brandon, 65)!;
    expect(b.deductions).toHaveLength(1);
    expect(b.deductions[0].key).toBe("bounces");
    expect(b.deductions[0].detail).toBe("2 of 34 sends rejected");
  });

  it("accounts for the whole deficit, to the point", () => {
    const b = scoreBreakdown(brandon, 65)!;
    expect(b.total).toBe(35);
    expect(b.deductions.reduce((t, d) => t + d.points, 0)).toBe(35);
  });

  it("says when the penalty has stopped tracking the rate", () => {
    // 8.571% x 600 = 51.4, past the 50 ceiling: the score cannot get worse
    // however much worse the list gets, which is worth saying out loud.
    const b = scoreBreakdown(sales, 50)!;
    expect(b.deductions[0].points).toBe(50);
    expect(b.deductions[0].capped).toBe(true);
    expect(b.floored).toBe(false);
  });

  it("reports a clean mailbox as having nothing against it", () => {
    // The seed account: 22 sends, no bounces, no complaints, no warmup.
    const b = scoreBreakdown({ ...NONE, outreach_sent: 22 }, 100)!;
    expect(b.deductions).toEqual([]);
    expect(b.total).toBe(0);
  });
});

/**
 * The formula now lives in three places: the shared scorer, the live SQL, and
 * this module. Three copies drift. The guard is that a copy which cannot
 * reproduce the server's number refuses to attribute anything at all.
 */
describe("a breakdown that cannot reproduce the score shows nothing", () => {
  const stats = { outreach_sent: 34, bounced: 2, complaints: 0, warmup_inbox: 116, warmup_spam: 0 };

  it("returns null when the reconstruction disagrees", () => {
    expect(scoreBreakdown(stats, 65)).not.toBeNull();
    // The same inputs against a score no formula here produces.
    expect(scoreBreakdown(stats, 60)).toBeNull();
  });

  it("returns null when there is no score to explain", () => {
    expect(scoreBreakdown(stats, null)).toBeNull();
    expect(scoreBreakdown(stats, undefined)).toBeNull();
  });

  it("is withheld rather than guessed when the card has no live stats", () => {
    // The card falls back to the stored score when the RPC returned no row for
    // the mailbox; the ledger must not be drawn from counts it does not have.
    expect(code(GRID)).toContain("{stats && <ScoreLedger");
  });
});

describe("every entry in the ledger is a real deduction", () => {
  it("omits the causes that cost nothing", () => {
    const b = scoreBreakdown(
      { outreach_sent: 100, bounced: 4, complaints: 0, warmup_inbox: 50, warmup_spam: 0 },
      76,
    )!;
    expect(b.deductions.map((d) => d.key)).toEqual(["bounces"]);
  });

  it("orders causes by what they cost", () => {
    // 2% bounce = 12; 0.2% complaints = 26; 10% warmup spam = 10.
    const b = scoreBreakdown(
      { outreach_sent: 500, bounced: 10, complaints: 1, warmup_inbox: 90, warmup_spam: 10 },
      52,
    )!;
    expect(b.deductions.map((d) => d.key)).toEqual(["complaints", "bounces", "spam_placement"]);
  });

  it("still adds up when the rounded parts would not", () => {
    const b = scoreBreakdown(
      { outreach_sent: 500, bounced: 10, complaints: 1, warmup_inbox: 90, warmup_spam: 10 },
      52,
    )!;
    expect(b.deductions.reduce((t, d) => t + d.points, 0)).toBe(b.total);
    expect(b.total).toBe(48);
  });

  it("does not claim the entries sum when the score bottomed out", () => {
    // 10% bounce and 1% complaints both cap: 50 + 40 = 90, plus 25 of warmup
    // spam is 115. The score floors at 0 and the parts exceed the whole.
    const b = scoreBreakdown(
      { outreach_sent: 100, bounced: 10, complaints: 1, warmup_inbox: 50, warmup_spam: 50 },
      0,
    )!;
    expect(b.floored).toBe(true);
    expect(b.deductions.every((d) => d.capped)).toBe(true);
  });
});

/**
 * The live RPC carried a fourth deduction the shared scorer had dropped: five
 * points off a mailbox over 50 sends whose open rate was under 5%. It made the
 * card disagree with the trend line beneath it, and it turned the page's own
 * open-tracking toggle into a trap -- switching tracking off zeroes `opened`,
 * which drives the measured rate to 0%.
 */
describe("open rate does not score", () => {
  it("is absent from the shared scorer", () => {
    const body = code(SHARED).split("export function computeReputation")[1];
    expect(body).toContain("bouncePenalty");
    expect(body).toContain("complaintPenalty");
    expect(body).toContain("spamPlacementPenalty");
    expect(body).not.toMatch(/openPenalty|openRate\s*[<>]/);
  });

  it("is absent from the live SQL", () => {
    expect(sql(MIGRATION)).not.toMatch(/opened\s*\*\s*1\.0\s*\/|<\s*0\.05/);
  });

  it("is still reported, because it is worth looking at", () => {
    expect(sql(MIGRATION)).toContain("round(b.opened * 100.0 / b.outreach_sent, 3)");
  });
});

/** The three multipliers and three ceilings, pinned across all three copies. */
describe("the three copies of the formula agree", () => {
  const shared = code(SHARED);
  const live = sql(MIGRATION);
  const client = code(readFileSync("src/lib/reputation.ts", "utf8"));

  it.each([
    ["bounce multiplier", /600/],
    ["complaint multiplier", /13000/],
  ])("%s", (_name, pattern) => {
    expect(shared).toMatch(pattern);
    expect(live).toMatch(pattern);
    expect(client).toMatch(pattern);
  });

  it("caps at 50, 40 and 25", () => {
    expect(shared).toMatch(/Math\.min\(50,[\s\S]*?Math\.min\(40,[\s\S]*?/);
    expect(live).toMatch(/least\(50,[\s\S]*?least\(40,[\s\S]*?least\(25,/);
    expect(client).toContain("const BOUNCE_CAP = 50");
    expect(client).toContain("const COMPLAINT_CAP = 40");
    expect(client).toContain("const SPAM_PLACEMENT_CAP = 25");
  });

  it("scores on the same three inputs and no others", () => {
    expect(live).toMatch(/b\.bounced \* 600\.0 \/ b\.outreach_sent/);
    expect(live).toMatch(/b\.complaints \* 13000\.0 \/ b\.outreach_sent/);
    expect(live).toMatch(/b\.warmup_spam \* 100\.0 \/ \(b\.warmup_inbox \+ b\.warmup_spam\)/);
  });
});

describe("the card explains the number instead of restating it", () => {
  const grid = code(GRID);

  it("separates placement from the score in words", () => {
    expect(grid).toContain("Inbox placement is scored separately");
    expect(grid).toContain("never had a folder to land in");
  });

  it("leads each row with what it cost", () => {
    expect(grid).toContain("&minus;{d.points}");
    expect(grid).toContain("tabular-nums");
  });

  it("says so plainly when a mailbox is clean", () => {
    expect(grid).toContain("Nothing is costing this mailbox points.");
  });
});
