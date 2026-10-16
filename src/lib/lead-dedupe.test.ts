import { describe, expect, it } from "vitest";
import {
  alreadyHeld,
  chunk,
  companiesToCheck,
  dropAlreadyHeld,
  emailsToCheck,
  identifying,
  indexHeld,
  namePair,
  orIlike,
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

describe("an address is an identity", () => {
  /*
   * The hole that running the rule did not find on its own, because the test
   * for repeats-within-a-batch used the same address twice.
   *
   * The scheduled import writes "Unknown Contact" and "Unknown Company" when
   * a row arrives without them. With the pair consulted for addressed leads,
   * every nameless prospect in a batch shared one pair, and each accepted
   * lead taught the filter to reject the next: fifty real people, fifty
   * distinct addresses, one inserted row — and the other forty-nine counted
   * as already held rather than failed, so nothing said a word.
   */
  const nameless = (email: string) => ({
    contact_email: email,
    contact_name: "Unknown Contact",
    company_name: "Unknown Company",
  });

  it("keeps every distinct address even when none of them have names", () => {
    const batch = [nameless("a@x.com"), nameless("b@x.com"), nameless("c@x.com")];
    expect(dropAlreadyHeld(batch, indexHeld([]))).toHaveLength(3);
  });

  it("still drops a repeat of the same address in that batch", () => {
    const batch = [nameless("a@x.com"), nameless("A@X.com")];
    expect(dropAlreadyHeld(batch, indexHeld([]))).toHaveLength(1);
  });

  it("does not treat a placeholder as a name", () => {
    expect(identifying({ contact_name: "Unknown Contact", company_name: "Acme" })).toBe(false);
    expect(identifying({ contact_name: "Jo", company_name: "Unknown Company" })).toBe(false);
    expect(identifying({ contact_name: "Jo", company_name: "Acme" })).toBe(true);
    expect(identifying({ contact_name: "Jo" })).toBe(false);
  });

  it("two people with the same name at one company are not merged by address", () => {
    // Different addresses mean different records. The pair is a fallback for
    // rows that have no address, not a second opinion about ones that do.
    const held = indexHeld([{ contact_email: "jo@acme.com", contact_name: "Jo", company_name: "Acme" }]);
    expect(alreadyHeld({ contact_email: "jo.s@acme.com", contact_name: "Jo", company_name: "Acme" }, held))
      .toBe(false);
  });

  it("but an addressed lead still matches a held row that has no address", () => {
    // The one case the fallback is for: an address is missing on one side.
    const held = indexHeld([{ contact_name: "Jo", company_name: "Acme" }]);
    expect(alreadyHeld({ contact_email: "jo@acme.com", contact_name: "Jo", company_name: "Acme" }, held))
      .toBe(true);
  });

  it("an unaddressed lead matches a held row by name and company", () => {
    const held = indexHeld([{ contact_email: "jo@acme.com", contact_name: "Jo", company_name: "Acme" }]);
    expect(alreadyHeld({ contact_name: "jo", company_name: " ACME " }, held)).toBe(true);
  });

  it("keeps a lead that can be matched on nothing at all", () => {
    // No address and no usable name: we cannot say it is a duplicate, so we
    // do not silently drop a real prospect.
    const held = indexHeld([nameless("a@x.com")]);
    expect(alreadyHeld({ contact_name: "Unknown Contact", company_name: "Unknown Company" }, held))
      .toBe(false);
  });
});

describe("the lookup compares the way the filter does", () => {
  /*
   * `in` is case-sensitive in Postgres. Asking for "jo@x.com" misses a stored
   * "Jo@X.com", so the lead comes back as new and is inserted again — which
   * the account-wide scan this replaced did not do, because it normalised in
   * memory.
   */
  it("asks case-insensitively", () => {
    expect(orIlike("contact_email", ["jo@x.com"])).toBe('contact_email.ilike."jo@x.com"');
  });

  it("quotes values, because a company name may contain a comma", () => {
    // The filter syntax is built from commas and parentheses.
    expect(orIlike("company_name", ["Smith, Jones & Co"]))
      .toBe('company_name.ilike."Smith, Jones & Co"');
  });

  it("escapes a quote inside a value", () => {
    expect(orIlike("company_name", ['O"Brien'])).toContain('O\\"Brien');
  });

  it("drops blanks rather than matching everything", () => {
    expect(orIlike("contact_email", ["", "  ", "a@x.com"])).toBe('contact_email.ilike."a@x.com"');
  });

  it("splits a long list into runs that fit a URL", () => {
    const many = Array.from({ length: 120 }, (_, i) => `l${i}@x.com`);
    const runs = chunk(many);
    expect(runs).toHaveLength(3);
    expect(runs.flat()).toEqual(many);
  });
});
