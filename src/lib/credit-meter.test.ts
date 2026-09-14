import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const HOOK = readFileSync("src/hooks/use-search-credits.tsx", "utf8");
const SEARCH = readFileSync("supabase/functions/fetch-external-leads/index.ts", "utf8");

/**
 * "Credits don't move on the UI — I have 86 leads enriched many times and it
 * still says 15,000 of 15,000 every day."
 *
 * Four separate things were true at once. Two of them are bugs and are fixed
 * here; the other two are deliberate pricing settings and are left alone.
 *
 * The bug that affects everyone: the balance was read once at mount and never
 * again. Deduction happens server-side inside the edge functions, precisely so
 * a client cannot decide what was spent — and the one client-side write to this
 * state (useCredit) is not on the search path at all. So nothing refetched, and
 * the number on screen was whatever it had been when the page loaded.
 */
describe("the meter follows the balance", () => {
  it("subscribes to the row rather than reading it once", () => {
    expect(HOOK).toContain('table: "subscriptions"');
    expect(HOOK).toContain("filter: `user_id=eq.${session.user.id}`");
  });

  it("refetches on reconnect, not just on the first subscribe", () => {
    // A socket that dropped during a search comes back to a stale number.
    expect(HOOK).toContain('if (status === "SUBSCRIBED") void fetchCredits();');
  });

  it("refetches when the tab comes back", () => {
    // The allowance also changes with no action in this tab: a scheduled run,
    // another tab, the monthly reset.
    expect(HOOK).toContain('document.addEventListener("visibilitychange"');
    expect(HOOK).toContain('document.removeEventListener("visibilitychange"');
  });

  it("tears the channel down", () => {
    expect(HOOK).toContain("supabase.removeChannel(channel)");
  });
});

/**
 * The second bug: an admin's searches were invisible. The entire accounting
 * block sat behind `if (!isAdmin)`, so the one account that runs support and
 * testing — the account most likely to be generating provider spend — had no
 * daily counter, no usage event and no credit movement ever recorded against
 * it. The meter read the same number every day because nothing had ever been
 * written.
 *
 * Metering is not gating. The counters run for everyone; the three places that
 * refuse a request are the ones that skip admins, so a support session cannot
 * be locked out mid-investigation by an allowance it just spent.
 */
describe("admins are metered, not gated", () => {
  it("the accounting block is no longer skipped for them", () => {
    expect(SEARCH).not.toContain("if (!isAdmin) {\n      const { data: subscription");
  });

  it("their searches produce a usage event flagged as admin", () => {
    expect(SEARCH).toContain("createUsageEvent(supabase, filters, user.id, userPlan, isAdmin)");
    // It used to hardcode false for the block that only non-admins reached.
    expect(SEARCH).not.toContain("createUsageEvent(supabase, filters, user.id, userPlan, false)");
  });

  it("every gate that refuses a request still lets them through", () => {
    expect(SEARCH).toContain("if (!isAdmin && subscription?.account_status === 'locked')");
    expect(SEARCH).toContain("if (!isAdmin && dailyUsed >= planConfig.dailySearchLimit)");
    expect(SEARCH).toContain("if (!isAdmin && chargesPerSearch && remainingCredits <= 0)");
  });

  it("a balance cannot be driven below empty", () => {
    // Two searches racing, or an admin metered against an allowance nothing
    // stops them spending, would otherwise write a negative number.
    expect(SEARCH).toContain("const newRemaining = Math.max(0, remainingCredits - 1);");
  });
});
