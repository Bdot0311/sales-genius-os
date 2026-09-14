import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  diffAgainstLead,
  isRealMatch,
  providerContributions,
  savableRecord,
} from "../../supabase/functions/_shared/person-match";

const FN = readFileSync("supabase/functions/find-person/index.ts", "utf8");
const UI = readFileSync("src/components/dashboard/FindPerson.tsx", "utf8");

/**
 * "People search shows a lead I already have, with no email."
 *
 * The lookup was calling the provider correctly. What it did with an empty
 * answer was the problem. The result is assembled with the caller's own input
 * as the last fallback:
 *
 *   resolvedName    = ...provider fields... || fullName
 *   resolvedCompany = ...provider fields... || company
 *
 * and a match was declared whenever a name or an email was present — which for
 * a name-plus-company lookup is true before the provider is even called. So an
 * empty upstream answer came back as a found contact whose only two fields were
 * the two that had been typed, charged a credit, wrote itself into leads, and
 * appeared under a green "Saved to leads" badge.
 */
describe("a match needs something the provider actually knew", () => {
  const typed = { fullName: "Mike Foster", company: "Trendara" };

  it("the caller's own input echoed back is not a find", () => {
    const echo = { contact_name: "Mike Foster", company_name: "Trendara", contact_email: null };
    expect(providerContributions(echo, typed)).toEqual([]);
    expect(isRealMatch(echo, typed)).toBe(false);
  });

  it("casing and spacing do not turn an echo into a find", () => {
    const echo = { contact_name: "  mike   foster ", company_name: "TRENDARA" };
    expect(isRealMatch(echo, typed)).toBe(false);
  });

  it("one field only a provider could know is enough", () => {
    expect(isRealMatch({ contact_name: "Mike Foster", job_title: "VP Sales" }, typed)).toBe(true);
    expect(isRealMatch({ contact_name: "Mike Foster", contact_phone: "+1 555 0100" }, typed)).toBe(true);
    expect(isRealMatch({ contact_name: "Mike Foster", industry: "Logistics" }, typed)).toBe(true);
  });

  it("an email the caller did not supply is a find", () => {
    expect(isRealMatch({ contact_name: "Mike Foster", contact_email: "mike@trendara.com" }, typed)).toBe(true);
  });

  it("the same email they supplied is not", () => {
    const withEmail = { fullName: "Mike Foster", email: "mike@trendara.com" };
    expect(isRealMatch({ contact_name: "Mike Foster", contact_email: "mike@trendara.com" }, withEmail)).toBe(false);
    // …but anything else alongside it is
    expect(
      isRealMatch({ contact_name: "Mike Foster", contact_email: "mike@trendara.com", job_title: "VP Sales" }, withEmail),
    ).toBe(true);
  });

  it("a LinkedIn lookup that returns a name is a find, url formatting aside", () => {
    const byLinkedin = { linkedin: "linkedin.com/in/mikefoster" };
    expect(isRealMatch({ contact_name: "Mike Foster" }, byLinkedin)).toBe(true);
    // the profile url coming back in canonical form is still the one they gave
    expect(
      providerContributions({ linkedin_url: "https://www.linkedin.com/in/mikefoster" }, byLinkedin),
    ).toEqual([]);
  });

  it("the function refunds and reports no match on an echo", () => {
    expect(FN).toContain("if (!isRealMatch(person, lookupInput))");
    const branch = FN.slice(FN.indexOf("if (!isRealMatch(person, lookupInput))"));
    expect(branch.slice(0, 600)).toContain('refundCredit("no_match")');
    expect(branch.slice(0, 600)).toContain("no credit was charged");
  });
});

/**
 * The save was automatic and silent. A lookup that learned nothing reported
 * "Saved to leads"; a lookup that learned a great deal reported the same thing;
 * and repeating one on somebody already saved matched their row and wrote the
 * caller's own input over it. There was no way to look without writing.
 */
describe("looking is not writing", () => {
  it("the lookup path saves nothing", () => {
    const lookupTail = FN.slice(FN.indexOf("if (!isRealMatch(person, lookupInput))"));
    expect(lookupTail).toContain("saved: false");
    expect(lookupTail).not.toContain('from("leads").insert');
    expect(lookupTail).not.toContain('from("leads").update');
  });

  it("saving is its own action", () => {
    expect(FN).toContain('if (body.action === "save")');
  });

  it("a lead id from the client is checked against the caller before it is written", () => {
    const save = FN.slice(FN.indexOf('if (body.action === "save")'));
    expect(save.slice(0, 1400)).toContain('.eq("user_id", user.id)');
  });

  it("the save spends no credit — the lookup already did", () => {
    // The save branch returns before the plan/credit gate further down.
    expect(FN.indexOf('if (body.action === "save")')).toBeLessThan(FN.indexOf("free_tier_blocked"));
  });
});

/**
 * What a save would change, so "Update lead data" is a statement rather than a
 * shrug. An upstream gap is not a correction: a field the lookup returns empty
 * never blanks one the lead already has.
 */
describe("the diff against an existing lead", () => {
  const lead = {
    id: "lead-1",
    contact_name: "Mike Foster",
    company_name: "Trendara",
    contact_email: null,
    job_title: null,
  };

  it("lists what is new", () => {
    const changes = diffAgainstLead({ contact_email: "mike@trendara.com", job_title: "VP Sales" }, lead);
    expect(changes.map((c) => c.field).sort()).toEqual(["contact_email", "job_title"]);
    expect(changes.find((c) => c.field === "contact_email")?.from).toBeNull();
  });

  it("lists what changed, with the value being replaced", () => {
    const changes = diffAgainstLead({ company_name: "Trendara Logistics" }, { ...lead });
    expect(changes).toEqual([{ field: "company_name", from: "Trendara", to: "Trendara Logistics" }]);
  });

  it("says nothing about fields that already agree", () => {
    expect(diffAgainstLead({ contact_name: "Mike Foster", company_name: "Trendara" }, lead)).toEqual([]);
  });

  it("never proposes blanking a field the lead already has", () => {
    const changes = diffAgainstLead({ contact_email: null, contact_phone: "" }, { ...lead, contact_email: "m@t.com" });
    expect(changes).toEqual([]);
  });

  it("a lookup with no existing lead has nothing to diff", () => {
    expect(diffAgainstLead({ contact_email: "m@t.com" }, null)).toEqual([]);
  });
});

describe("what a save is allowed to write", () => {
  it("drops empty values rather than writing them", () => {
    expect(savableRecord({ contact_email: "m@t.com", contact_phone: null, job_title: "" })).toEqual({
      contact_email: "m@t.com",
    });
  });

  it("ignores fields outside the whitelist", () => {
    const record = savableRecord({ contact_email: "m@t.com", user_id: "someone-else", lead_status: "won" });
    expect(record).toEqual({ contact_email: "m@t.com" });
  });
});

/**
 * The card looked identical whether the lookup had found anything or not: same
 * fields, same green "Saved to leads" badge, which was shown before any button
 * was pressed because pressing one was never required.
 */
describe("the panel", () => {
  it("does not claim a save that has not happened", () => {
    // The badge is rendered from the id the save returns, not from the lookup.
    expect(UI).toContain("{savedId ? (");
    expect(UI).not.toMatch(/Saved to leads[\s\S]{0,200}<\/Badge>/);
  });

  it("offers the two buttons the result calls for", () => {
    expect(UI).toContain('{existing ? "Update lead data" : "Save as new lead"}');
  });

  it("does not offer an update that would write nothing", () => {
    expect(UI).toContain("existing !== null && existing.changes.length === 0");
  });

  it("says what the lookup contributed", () => {
    expect(UI).toContain("foundFields");
    expect(UI).toContain("Found {foundFields.map(fieldLabel)");
  });

  it("sends lookup and save as distinct actions", () => {
    expect(UI).toContain('action: "lookup"');
    expect(UI).toContain('action: "save"');
  });
});
