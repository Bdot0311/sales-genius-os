import { describe, expect, it } from "vitest";
import { classifySearchError } from "./search-error";

describe("classifySearchError", () => {
  describe("provider failures are never reported as a billing problem", () => {
    // Regression: these two edge-function messages contain the word "credit"
    // purely to say none was spent. The old substring check matched them and
    // showed "Search Credits Exhausted", so a rejected or unreachable search
    // looked like an empty credit balance.
    it("keeps a rejected search out of the credit bucket", () => {
      const toast = classifySearchError({
        code: "upstream_rejected",
        message:
          "The lead data provider rejected this search. Your search credit was not used — try simpler filters or a different location.",
      });

      expect(toast.title).toBe("Search rejected");
      expect(toast.title.toLowerCase()).not.toContain("credit");
      expect(toast.description).toMatch(/no credit was used/i);
    });

    it("keeps an unavailable provider out of the credit bucket", () => {
      const toast = classifySearchError({
        code: "upstream_unavailable",
        message:
          "The lead data provider is unavailable right now. Your search credit was not used — please try again shortly.",
      });

      expect(toast.title).toBe("Search unavailable");
      expect(toast.title.toLowerCase()).not.toContain("credit");
    });

    it("treats a network error as unavailable, not billing", () => {
      const toast = classifySearchError({
        code: "network_error",
        message: "Could not reach lead data provider.",
      });

      expect(toast.title).toBe("Search unavailable");
    });

    it("does not sniff a billing error out of a 'not used' message with no code", () => {
      const toast = classifySearchError({
        message: "Your search credit was not used — please try again shortly.",
      });

      expect(toast.title).not.toMatch(/credit/i);
    });

    it("still classifies a genuinely code-less billing message", () => {
      const toast = classifySearchError({
        message: "Payment required: add more credits to continue.",
      });

      expect(toast.title).toBe("Out of SalesOS search credits");
    });
  });

  describe("real credit exhaustion", () => {
    it("names the SalesOS plan balance so it is not read as the provider balance", () => {
      const toast = classifySearchError({
        code: "credits_exhausted",
        message: "Monthly search credits exhausted. Add more credits or wait for monthly reset.",
        remainingCredits: 0,
        upgradeRequired: false,
      });

      expect(toast.title).toBe("Out of SalesOS search credits");
      expect(toast.description).toMatch(/separate from the balance on your data provider/i);
      expect(toast.durationMs).toBe(10000);
    });

    it("asks free accounts to upgrade", () => {
      const toast = classifySearchError({
        code: "credits_exhausted",
        message: "You've used your 100 free leads.",
        upgradeRequired: true,
      });

      expect(toast.title).toBe("Free search credits used up");
      expect(toast.description).toMatch(/upgrade/i);
    });
  });

  describe("other coded outcomes", () => {
    it("distinguishes the daily limit from an empty balance", () => {
      const toast = classifySearchError({
        code: "daily_limit_reached",
        message: "Daily search limit reached. Try again tomorrow.",
      });

      expect(toast.title).toBe("Daily search limit reached");
      expect(toast.description).toMatch(/remaining credits are untouched/i);
    });

    it("reports a locked account", () => {
      const toast = classifySearchError({
        code: "account_locked",
        message: "Account is locked. Please contact support.",
      });

      expect(toast.title).toBe("Account locked");
    });

    it("reports an expired session", () => {
      const toast = classifySearchError({
        code: "auth_error",
        message: "Authentication required. Please sign in again.",
      });

      expect(toast.title).toBe("Signed out");
    });
  });

  it("falls back to a generic failure for an unknown error", () => {
    const toast = classifySearchError({ message: "Something odd happened" });

    expect(toast.title).toBe("Search failed");
    expect(toast.description).toBe("Something odd happened");
  });
});
