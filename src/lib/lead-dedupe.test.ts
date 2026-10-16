import { describe, expect, it } from "vitest";
import {
  alreadyHeld,
  companiesToCheck,
  dropAlreadyHeld,
  emailsToCheck,
  indexHeld,
  namePair,
} from "../../supabase/functions/_shared/lead-dedupe";

/**
 * This rule decides whether a prospect gets emailed twice.
 *
 * It used to be a filter written inline inside the scheduled import, and the
 * test for it could only read the source — it asserted that
 * `seenEmails.has(email)` was *called*, which a filter that calls it and
 * returns `true` anyway satisfies perfectly while inserting every lead. These
 * run it.
 */

const held = (rows: Array<Partial<Record<"contact_email" | "contact_name" | "company_name", string>>>) =>
  indexHeld(rows as any);

describe("the same person, written differently", () => {
  it("matches on the address whatever its case or spacing", () => {
    const index = held([{ contact_email: "Jo@Example.com" }]);
    expect(alreadyHeld({ contact_email: "  jo@example.com " }, index)).toBe(true);
    expect(alreadyHeld({ contact_email: "JO@EXAMPLE.COM" }, index)).toBe(true);
  });

  it("does not match a different address", () => {
    const index = held([{ contact_email: "jo@example.com" }]);
    expect(alreadyHeld({ contact_email: "sam@example.com" }, index)).toBe(false);
  });

  it("falls back to name and company when an address is missing", () => {
    // Imported data arrives without an address constantly.
    const index = held([{ contact_name: "Jo Smith", company_name: "Acme" }]);
    expect(alreadyHeld({ contact_name: "jo smith", company_name: " ACME " }, index)).toBe(true);
    expect(alreadyHeld({ contact_name: "Jo Smith", company_name: "Other" }, index)).toBe(false);
  });

  it("treats one empty name-and-company as nobody, not everybody", () => {
    /*
     * The pair key for a row with neither field is "|". Indexing that would
     * make every nameless lead a duplicate of every other nameless lead, and
     * a whole import would vanish.
     */
    const index = held([{ contact_email: "a@b.com" }]);
    expect(namePair({})).toBe("|");
    expect(alreadyHeld({ contact_email: "new@b.com" }, index)).toBe(false);
    expect(alreadyHeld({}, index)).toBe(false);
  });
});

describe("importing the same search twice", () => {
  const search = [
    { contact_email: "a@x.com", contact_name: "A", company_name: "X" },
    { contact_email: "b@x.com", contact_name: "B", company_name: "X" },
    { contact_name: "C", company_name: "Y" },
  ];

  it("inserts everything the first time", () => {
    expect(dropAlreadyHeld(search, held([]))).toHaveLength(3);
  });

  it("inserts nothing the second time", () => {
    // The exact regression: a killed run re-runs the same import next hour.
    const after = held(search);
    expect(dropAlreadyHeld(search, after)).toEqual([]);
  });

  it("inserts only what is new when the search grows", () => {
    const grown = [...search, { contact_email: "d@x.com", contact_name: "D", company_name: "X" }];
    const fresh = dropAlreadyHeld(grown, held(search));
    expect(fresh.map((l) => l.contact_email)).toEqual(["d@x.com"]);
  });

  it("does not insert the same person twice from one search", () => {
    // Before any of this is consulted, a search returning a duplicate would
    // write them twice on the very first run.
    const dupes = [
      { contact_email: "a@x.com", contact_name: "A", company_name: "X" },
      { contact_email: "A@X.com", contact_name: "A", company_name: "X" },
    ];
    expect(dropAlreadyHeld(dupes, held([]))).toHaveLength(1);
  });
});

describe("the lookup is sized by the import, not the account", () => {
  /*
   * The first version read the account's leads with a 5,000 row cap, which is
   * a correctness hole rather than a soft limit: an account past that has an
   * incomplete picture of what it holds, and the leads outside the window
   * come back as new.
   */
  const incoming = [
    { contact_email: "A@x.com", company_name: " Acme " },
    { contact_email: "a@x.com", company_name: "Acme" },
    { contact_name: "No Email", company_name: "Beta" },
  ];

  it("asks about each arriving address once", () => {
    expect(emailsToCheck(incoming)).toEqual(["a@x.com"]);
  });

  it("asks about each arriving company once", () => {
    expect(companiesToCheck(incoming)).toEqual(["Acme", "Beta"]);
  });

  it("asks about nothing when nothing arrives", () => {
    expect(emailsToCheck([])).toEqual([]);
    expect(companiesToCheck([])).toEqual([]);
  });
});
