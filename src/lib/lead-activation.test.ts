import { describe, expect, it } from "vitest";
import {
  enrichedFieldsPresent,
  isDuplicateKeyError,
  normalizeCompanyDomain,
  normalizeLeadEmail,
  saveToast,
  splitContactName,
} from "./lead-activation";

/**
 * Reported from the app: saving a lead with no website failed with
 * "duplicate key value violates unique constraint companies_domain_key".
 * The lead card showed "No email · No website", so the domain written to the
 * database was "" — and an empty string is not exempt from a unique index the
 * way NULL is, so the second website-less company collided with the first.
 */
describe("a lead with no website", () => {
  it("stores no domain at all rather than an empty one", () => {
    expect(normalizeCompanyDomain("")).toBeNull();
    expect(normalizeCompanyDomain("   ")).toBeNull();
    expect(normalizeCompanyDomain(undefined)).toBeNull();
    expect(normalizeCompanyDomain(null)).toBeNull();
  });

  it("still normalises a real domain", () => {
    expect(normalizeCompanyDomain("https://www.InsightIQ.be/about")).toBe("insightiq.be");
    expect(normalizeCompanyDomain(" Acme.com ")).toBe("acme.com");
  });
});

describe("recognising the collision when it still happens", () => {
  it("reads the Postgres code", () => {
    expect(isDuplicateKeyError({ code: "23505", message: "whatever" })).toBe(true);
  });

  it("reads the message when the code is stripped", () => {
    expect(
      isDuplicateKeyError({
        message: 'duplicate key value violates unique constraint "companies_domain_key"',
      }),
    ).toBe(true);
  });

  it("does not swallow an unrelated failure", () => {
    expect(isDuplicateKeyError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});

describe("names", () => {
  it("splits a full name", () => {
    expect(splitContactName("Jelle Bastiaansen")).toEqual({ firstName: "Jelle", lastName: "Bastiaansen" });
  });

  it("keeps a compound surname whole", () => {
    expect(splitContactName("Ana Maria de la Cruz").lastName).toBe("Maria de la Cruz");
  });

  it("survives a single name and a blank", () => {
    expect(splitContactName("Cher")).toEqual({ firstName: "Cher", lastName: "" });
    expect(splitContactName("  ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("email", () => {
  it("treats a missing address as missing, not as an empty string", () => {
    expect(normalizeLeadEmail("")).toBeNull();
    expect(normalizeLeadEmail("not-an-address")).toBeNull();
    expect(normalizeLeadEmail(" Jelle@InsightIQ.be ")).toBe("jelle@insightiq.be");
  });
});

describe("the audit trail only claims fields that are there", () => {
  it("drops the empty ones", () => {
    expect(
      enrichedFieldsPresent({
        company_name: "InsightIQ",
        contact_email: null,
        linkedin_url: "",
        icp_score: 0,
      }),
    ).toEqual(["company_name", "icp_score"]);
  });
});

/**
 * The button says "Enrich & Save". It only ever saved, so a lead the search
 * returned with no address stayed with no address and the toast said
 * "Lead enriched & saved" anyway.
 */
describe("what the user is told", () => {
  const base = { contactName: "Jelle Bastiaansen", companyName: "InsightIQ" };

  it("does not claim enrichment when the search already had the address", () => {
    const t = saveToast({ ...base, hadEmail: true, foundEmail: null, enrichmentFailed: false });
    expect(t.title).toBe("Lead saved");
    expect(t.title).not.toMatch(/enriched/i);
  });

  it("names the address enrichment found", () => {
    const t = saveToast({ ...base, hadEmail: false, foundEmail: "jelle@insightiq.be", enrichmentFailed: false });
    expect(t.title).toBe("Lead enriched & saved");
    expect(t.description).toContain("jelle@insightiq.be");
  });

  it("says plainly when there is still no address", () => {
    const t = saveToast({ ...base, hadEmail: false, foundEmail: null, enrichmentFailed: false });
    expect(t.title).toBe("Saved without an email");
    expect(t.description).toMatch(/no verified address/i);
  });

  it("says so when enrichment could not run at all", () => {
    const t = saveToast({ ...base, hadEmail: false, foundEmail: null, enrichmentFailed: true });
    expect(t.description).toMatch(/enrichment could not run/i);
  });

  /**
   * Also reported: "even if I enrich and save the lead, there is no email and
   * no number". Search returns no phone for any provider, so a number can only
   * come from enrichment — which made a lead that already had an email, and so
   * skipped enrichment, the one case guaranteed never to get one.
   */
  it("mentions a number found for a lead that already had an email", () => {
    const t = saveToast({
      ...base, hadEmail: true, foundEmail: null,
      foundPhone: "+32 470 12 34 56", foundPhoneType: "mobile", enrichmentFailed: false,
    });

    expect(t.title).toBe("Lead enriched & saved");
    expect(t.description).toMatch(/mobile number/i);
  });

  it("names the line type, because a mobile is the one you can message", () => {
    const office = saveToast({
      ...base, hadEmail: true, foundEmail: null,
      foundPhone: "+32 2 999 00 00", foundPhoneType: "office", enrichmentFailed: false,
    });
    const unknown = saveToast({
      ...base, hadEmail: true, foundEmail: null,
      foundPhone: "+32 2 999 00 00", foundPhoneType: null, enrichmentFailed: false,
    });

    expect(office.description).toMatch(/office number/i);
    // Not "mobile": an unlabelled number must never be described as one.
    expect(unknown.description).toMatch(/a phone number/i);
    expect(unknown.description).not.toMatch(/mobile/i);
  });

  it("reports both when enrichment found an address and a number", () => {
    const t = saveToast({
      ...base, hadEmail: false, foundEmail: "jelle@insightiq.be",
      foundPhone: "+32 470 12 34 56", foundPhoneType: "mobile", enrichmentFailed: false,
    });

    expect(t.description).toContain("jelle@insightiq.be");
    expect(t.description).toMatch(/mobile number/i);
  });

  it("a number without an address is still a partial result, and says so", () => {
    const t = saveToast({
      ...base, hadEmail: false, foundEmail: null,
      foundPhone: "+32 470 12 34 56", foundPhoneType: "mobile", enrichmentFailed: false,
    });

    expect(t.title).toMatch(/no email/i);
    expect(t.description).toMatch(/mobile number/i);
  });

  it("still reads exactly as before when no phone is involved", () => {
    // The phone fields are optional; the existing callers omit them.
    const t = saveToast({ ...base, hadEmail: true, foundEmail: null, enrichmentFailed: false });

    expect(t.title).toBe("Lead saved");
    expect(t.description).not.toMatch(/number/i);
  });
});
