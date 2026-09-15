import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHANGELOG, ROADMAP, TAG_LABELS, unreadCount } from "./changelog";

const PAGE = readFileSync("src/pages/WhatsNew.tsx", "utf8");

/**
 * The changelog was generated from merged pull requests, and read like it.
 *
 * Four entries carried the same date because four branches landed that day.
 * Titles joined two unrelated fixes with "and" because they shipped together.
 * Twenty-four of twenty-five items were tagged "fixed" or "improved", which is
 * what a week of engineering looks like from the inside and not what a customer
 * came to read — a changelog that is almost entirely bug fixes says the product
 * keeps breaking.
 */
describe("entries are releases, not branches", () => {
  it("no two entries share a date", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("is in date order, newest first", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("titles name one thing", () => {
    // "Accounts lists open the right record, and reveals charge the right
    // credit" is two changes joined by the fact that they merged together.
    for (const entry of CHANGELOG) {
      expect(entry.title.split(" ").length, entry.title).toBeLessThanOrEqual(9);
    }
  });

  it("every item says where to go, or deliberately does not", () => {
    // An entry you cannot click is an announcement rather than a feature, so
    // most should link somewhere in the product.
    const all = CHANGELOG.flatMap((e) => e.items);
    const linked = all.filter((i) => i.href);
    expect(linked.length / all.length).toBeGreaterThan(0.3);
    for (const item of linked) {
      expect(item.href, item.title).toMatch(/^\/dashboard(\/|$)/);
    }
  });
});

/**
 * A change to what somebody is billed is the one thing they must not scroll
 * past. Reveals starting to cost a credit was previously softened into
 * "credits update instantly", which describes a meter rather than a charge.
 */
describe("billing changes are called billing changes", () => {
  it("the tag exists and is used", () => {
    expect(TAG_LABELS.billing).toBe("Billing");
    const billing = CHANGELOG.flatMap((e) => e.items).filter((i) => i.tag === "billing");
    expect(billing.length).toBeGreaterThan(0);
  });

  it("the charge is stated in the first item of its entry", () => {
    const entry = CHANGELOG.find((e) => e.items.some((i) => i.tag === "billing"))!;
    expect(entry.items[0].tag).toBe("billing");
    expect(entry.items[0].description).toMatch(/credit is spent|costs one credit/i);
  });

  it("says what stays free, not only what now costs", () => {
    const billing = CHANGELOG.flatMap((e) => e.items).find((i) => i.tag === "billing")!;
    expect(billing.description).toMatch(/free/i);
    expect(billing.description).toMatch(/nothing is found|no credit/i);
  });

  it("the page gives billing its own weight", () => {
    // It is the one tag allowed to be louder than the body text.
    expect(PAGE).toContain("billing:");
    expect(PAGE).toContain("text-amber-400");
  });
});

/**
 * "What's coming" is the half of a changelog people open it to find, and it was
 * one item buried inside an entry from two days earlier.
 */
describe("the roadmap", () => {
  it("is its own list, not a tag on a dated entry", () => {
    expect(ROADMAP.length).toBeGreaterThanOrEqual(3);
    // "coming" is no longer a tag — a dated release cannot contain the future.
    expect(Object.keys(TAG_LABELS)).not.toContain("coming");
  });

  it("carries no dates", () => {
    // A roadmap with dates on it is a promise.
    for (const item of ROADMAP) {
      expect(JSON.stringify(item), item.title).not.toMatch(/\d{4}-\d{2}-\d{2}|Q[1-4]|January|February/);
    }
  });

  it("is pinned above the history", () => {
    expect(PAGE.indexOf("Coming next")).toBeLessThan(PAGE.indexOf("entries.map"));
  });
});

describe("the page scales past five entries", () => {
  it("can be filtered", () => {
    expect(PAGE).toContain("const FILTERS");
    expect(PAGE).toContain('{ value: "billing", label: "Billing" }');
  });

  it("marks what this reader has not seen", () => {
    // The header dot said something was new and the page gave no way to tell
    // which part.
    expect(PAGE).toContain("New to you");
    expect(PAGE).toContain("unreadAtArrival");
  });

  it("counts unread from what is published, once, and not from the fallback", () => {
    // This first pinned the exact line that computed it, which broke as soon as
    // the count moved from "on mount, from the compiled-in file" to "when the
    // database answers" — a change that made it more correct. What matters is
    // that the number is settled once, before markSeen clears the marks the
    // reader is looking for, and that it is counted against published entries.
    expect(PAGE).toContain("unreadAtArrival === null && published.length > 0");
    expect(PAGE).toContain("published.filter((e) => e.date > seenDate).length");
    expect(PAGE.indexOf("setUnreadAtArrival")).toBeLessThan(PAGE.indexOf("markSeen(latestDate)"));
  });

  it("marks read against what is on the page, not what is in the bundle", () => {
    // Stamping the file's date would mark an entry read before it was published.
    expect(PAGE).toContain("markSeen(latestDate)");
  });

  it("uses the dashboard's own surfaces", () => {
    expect(PAGE).not.toMatch(/<Card\b/);
    expect(PAGE).toContain("<Panel");
    expect(PAGE).toContain("<PanelHeader");
  });
});

describe("the unread count", () => {
  it("counts entries newer than what was seen", () => {
    expect(unreadCount("")).toBe(CHANGELOG.length);
    expect(unreadCount(CHANGELOG[0].date)).toBe(0);
    expect(unreadCount(CHANGELOG[1].date)).toBe(1);
  });
});
