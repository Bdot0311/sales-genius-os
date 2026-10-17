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
      expect(item.href, item.title).toMatch(/^\//);
    }
  });

  it("every link lands on a route that exists", () => {
    // This used to require a /dashboard prefix, which stood in for "somewhere
    // in the product" while every destination happened to live there. It let
    // two items point at /dashboard/settings — a path with no route, so both
    // landed on Not Found, and both were the notification items whose whole
    // purpose was to send someone to Settings. It then failed a legitimate
    // link to a public page. Checking the route table catches the dead link
    // and permits the real one.
    const routes = new Set(
      [...readFileSync("src/App.tsx", "utf8").matchAll(/path="([^"]*)"/g)].map((m) => m[1]),
    );
    const patterns = [...routes]
      .filter((r) => r.includes(":") || r.endsWith("/*"))
      .map((r) => new RegExp(`^${r.replace(/\/\*$/, "(/.*)?").replace(/:[^/]+/g, "[^/]+")}$`));

    for (const item of CHANGELOG.flatMap((e) => e.items)) {
      if (!item.href) continue;
      const path = item.href.split(/[?#]/)[0];
      const resolves = routes.has(path) || patterns.some((rx) => rx.test(path));
      expect(resolves, `${item.title} → ${item.href}`).toBe(true);
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

  it("the charge leads every entry that contains one", () => {
    // Both of these used to read the FIRST billing item in the whole file and
    // match its exact phrasing — "credit is spent", "nothing is found". That
    // is one entry's wording wearing a rule's clothes: it passed for as long
    // as no newer billing item existed, and the day one landed above it the
    // rule failed on copy that was perfectly correct. What must hold is the
    // rule the top of changelog.ts states, on every entry that has one.
    const entries = CHANGELOG.filter((e) => e.items.some((i) => i.tag === "billing"));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.items[0].tag, entry.id).toBe("billing");
    }
  });

  it("says what stays free, not only what now costs", () => {
    const billing = CHANGELOG.flatMap((e) => e.items).filter((i) => i.tag === "billing");
    for (const item of billing) {
      // Names the charge in the customer's terms, not "your credits update".
      expect(item.description, `${item.title}: names the charge`).toMatch(
        /\b(credits?|costs?|charged?|allowance|price|billed|plan)\b/i,
      );
      // And names what is not taken, which is the half that gets dropped.
      expect(item.description, `${item.title}: names what is not taken`).toMatch(
        /\b(free|no credit|not charged|nothing is found|already used is kept|unchanged)\b/i,
      );
    }
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

  it("does not promise one feature twice", () => {
    /*
     * "Your own sending domains, end to end" and "Inboxes made for you, not
     * by you" sat next to each other as two items. They were one promise from
     * two angles — both ended at a warmed mailbox you can send from, and both
     * said warmup. Side by side that inflates the roadmap and tells a reader
     * the domain arrives before the inboxes do.
     *
     * Meaning is not checkable, but a shared subject is: two items that both
     * turn on the same handful of subjects are describing the same thing.
     *
     * Subjects, not words. The first version of this guard listed tokens and
     * missed the very pair it was written for — one item said "warm it" and
     * the other "warmup", so it counted them as two different subjects and
     * found only one in common. Each subject is the set of ways it gets said.
     */
    const SUBJECTS: Record<string, RegExp> = {
      domain: /sending domain|buy (a |the )?domain|own domain/,
      mailbox: /mailbox|inbox(es)?\b/,
      warmup: /warm(up|ed| it| them)/,
      sequence: /sequence|follow-up|step three/,
    };
    const signature = (item: { title: string; description: string }) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      return new Set(Object.keys(SUBJECTS).filter((k) => SUBJECTS[k].test(text)));
    };
    for (let i = 0; i < ROADMAP.length; i++) {
      for (let j = i + 1; j < ROADMAP.length; j++) {
        const shared = [...signature(ROADMAP[i])].filter((w) => signature(ROADMAP[j]).has(w));
        expect(
          shared.length,
          `"${ROADMAP[i].title}" and "${ROADMAP[j].title}" both turn on ${shared.join(", ")}`,
        ).toBeLessThan(2);
      }
    }
  });

  it("does not offer something the product already does", () => {
    /*
     * This file has made the same mistake twice. It offered bulk enrichment
     * as "up next" while people were using it, and it opened the reply item
     * with "today every enrolled lead walks the same steps" while
     * update-lead-engagement-state was already marking the enrollment
     * `completed` the moment a reply landed.
     *
     * Each pair below is a behaviour that ships, asserted against the code so
     * this cannot drift into guarding a situation that no longer exists, and
     * a phrase that would be a lie about it. The roadmap may name a shipped
     * feature — the honest items here do, to say where the new part starts —
     * it just may not claim it is missing.
     */
    const SHIPPED: { what: string; file: string; proof: string; mustNotSay: RegExp }[] = [
      {
        /*
         * This originally pointed at update-lead-engagement-state, which does
         * hold the write — and has no caller. The guard passed while the
         * behaviour did not exist, because I checked that code implementing it
         * was present rather than that anything reached it. It points at the
         * function analyze-reply actually calls now.
         */
        what: "a reply stops the rest of the sequence",
        file: "supabase/functions/analyze-reply/index.ts",
        proof: "apply_reply_to_sequence",
        mustNotSay: /every enrolled lead walks the same steps/i,
      },
      {
        what: "the SPF and DMARC records are written for you",
        file: "supabase/functions/apply-cloudflare-dns/index.ts",
        proof: "_dmarc",
        mustNotSay: /handed to you as a list/i,
      },
    ];

    for (const { what, file, proof, mustNotSay } of SHIPPED) {
      expect(readFileSync(file, "utf8"), `${what} should still be true of the code`).toContain(proof);
      for (const item of ROADMAP) {
        expect(
          `${item.title} ${item.description}`,
          `"${item.title}" says ${what} is missing`,
        ).not.toMatch(mustNotSay);
      }
    }
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
