import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const OVERVIEW = readFileSync("src/pages/Dashboard.tsx", "utf8");
const SAVED = readFileSync("src/pages/SavedLeads.tsx", "utf8");
const COMMITTEE = readFileSync("src/components/dashboard/AccountCommittee.tsx", "utf8");
const WHYNOW = readFileSync("src/components/dashboard/WhyNowPanel.tsx", "utf8");
const ENRICH = readFileSync("supabase/functions/enrich-lead/index.ts", "utf8");
const PERSON = readFileSync("supabase/functions/find-person/index.ts", "utf8");

/**
 * "The needs-attention list doesn't actually open what it says to open."
 *
 * Both items pointed at /dashboard/leads — the page for finding leads you do
 * not have, which is not where the ones just counted are. So an item named a
 * set of rows and then opened something else. A count you cannot click through
 * to the rows it counted is trivia with a number on it.
 */
describe("needs attention opens the rows it counted", () => {
  it("each item deep-links to a filtered list", () => {
    expect(OVERVIEW).toContain('href: "/dashboard/leads/saved?show=no-email"');
    expect(OVERVIEW).toContain('href: "/dashboard/leads/saved?show=never-contacted"');
  });

  it("no item still points at the bare search page", () => {
    // Except the one that genuinely means "go and search", which only appears
    // when there are no leads at all.
    const attention = OVERVIEW.slice(OVERVIEW.indexOf("const attention = ["), OVERVIEW.indexOf("].filter(Boolean)"));
    const hrefs = [...attention.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toContain("/dashboard/leads");
    expect(hrefs.filter((h) => h === "/dashboard/leads")).toHaveLength(1);
  });

  it("saved leads understands those filters", () => {
    expect(SAVED).toContain("const URL_FILTERS");
    expect(SAVED).toContain('"no-email"');
    expect(SAVED).toContain('"never-contacted"');
    expect(SAVED).toContain("useSearchParams");
    // The URL filter is the database's job now, passed as p_show rather than
    // applied to the rows that happened to load. That is what makes the count,
    // the paging and the export cover the account instead of the page, so pin
    // that it is handed to the query and not re-narrowed after it.
    expect(SAVED).toMatch(/useSavedLeads<Lead>\([\s\S]{0,200}urlFilter,/);
    expect(SAVED).not.toContain("URL_FILTERS[urlFilter].match(lead)");
  });

  it("says the list is filtered, and gives it back", () => {
    // A page silently showing a subset is one the reader will act on as if it
    // were their whole list.
    expect(SAVED).toContain("Show all");
    // totalLeads, not leads.length: the count comes from the database's own
    // total over the filtered set. leads.length was the size of whatever had
    // been loaded into memory, which stopped at twenty thousand.
    expect(SAVED).toContain("out of {totalLeads}");
  });
});

/**
 * "The accounts design didn't update, you just moved cards around."
 *
 * Fair: the first pass restyled the sidebar and left the two panels that are
 * the actual page untouched.
 */
describe("the accounts panels", () => {
  it("are panels, not cards of nested bordered boxes", () => {
    // Each committee slot was its own rounded border inside the card's border.
    expect(COMMITTEE).not.toMatch(/<Card\b/);
    expect(WHYNOW).not.toMatch(/<Card\b/);
    expect(COMMITTEE).toContain("<Panel>");
    expect(WHYNOW).toContain("<Panel>");
    expect(COMMITTEE).not.toContain('className="rounded-lg border border-border/60 p-3 space-y-2"');
  });

  it("are written in sentence case", () => {
    for (const [name, src] of [["committee", COMMITTEE], ["why now", WHYNOW]] as const) {
      expect(src, name).not.toContain("mapping the committee...");
      expect(src, name).not.toContain("no verified contact found");
      expect(src, name).not.toContain('CardTitle className="text-base">why now');
    }
    expect(COMMITTEE).toContain("Mapping the committee…");
    expect(WHYNOW).toContain('title="Why now"');
  });

  it("mark the gap rather than badging every filled row", () => {
    // A "required" badge on most rows labels nothing; the empty ones are the
    // point, so those are what read differently.
    expect(COMMITTEE).toContain("s.required && s.contacts.length === 0");
    expect(COMMITTEE).not.toContain("CheckCircle2");
  });

  it("confidence is a ramp, not three unrelated colours in outlined pills", () => {
    expect(WHYNOW).not.toContain("border-green-500/30");
    expect(WHYNOW).not.toContain("border-yellow-500/30");
    expect(WHYNOW).toContain("text-emerald-400/90");
  });
});

/**
 * "Searches are free, people get charged on enrichment (reveal) — once a user
 * clicks enrich lead, that's when the credit goes."
 *
 * Enrichment was switched off by default, which is why nothing decremented on a
 * paid account: searching is free by design, so enrichment is the only thing
 * that spends, and it was not spending.
 */
describe("a reveal is what costs a credit", () => {
  it("enrichment charges unless explicitly switched off", () => {
    expect(ENRICH).toContain("Deno.env.get('ENRICHMENT_CREDITS') || 'charge'");
    expect(ENRICH).toContain("!== 'free'");
  });

  it("admins are metered on the reveal paths too", () => {
    // The whole block sat behind a non-admin check, so the account most likely
    // to be generating provider spend recorded none of it.
    expect(ENRICH).not.toContain("let creditWasDeducted = false;\n    if (!isAdmin) {");
    expect(PERSON).not.toContain("let creditWasDeducted = false;\n    if (!isAdmin) {");
  });

  it("but are never refused by it", () => {
    expect(ENRICH).toContain("if (!isAdmin && (!subscription || subscription.plan === 'free'))");
    expect(ENRICH).toContain("if (!isAdmin && remaining <= 0)");
    expect(PERSON).toContain('if (!isAdmin && (!subscription || subscription.plan === "free"))');
    expect(PERSON).toContain("if (!isAdmin && remaining <= 0)");
  });

  it("a balance cannot go below empty", () => {
    for (const [name, src] of [["enrich", ENRICH], ["person", PERSON]] as const) {
      expect(src, name).toContain("Math.max(0, remaining - 1)");
    }
  });

  it("the transaction records the balance actually written", () => {
    // It recorded remaining - 1, which is a different number once floored.
    for (const [name, src] of [["enrich", ENRICH], ["person", PERSON]] as const) {
      expect(src, name).toContain("balance_after: nextRemaining");
    }
  });
});
