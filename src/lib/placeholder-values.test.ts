import { describe, expect, it } from "vitest";
import { isPlaceholderValue, realValue } from "../../supabase/functions/_shared/email-rules.ts";

/**
 * Reported from the Railway logs:
 *
 *   Wiza individual reveal request:
 *     {"individual_reveal": {"full_name": "Ott Salmar", "company": "Unknown"}}
 *
 * A real person, scoped to a company literally named Unknown. That reveal could
 * only ever miss, and the user saw it as "enrichment found nothing".
 *
 * The string is written on purpose: leads.company_name is NOT NULL, so a lead
 * whose provider returned no company still needs something in the column. The
 * bug is reading it back as a fact.
 */
describe("values that mean we don't know", () => {
  it("recognises every spelling the providers and fallbacks use", () => {
    for (const value of [
      "Unknown", "unknown", "  Unknown  ", "N/A", "n/a", "na", "NA",
      "none", "None", "NULL", "nil", "undefined", "not available",
      "not provided", "-", "--", "?", "???", "TBD", "tbd", "placeholder",
      "no company", "Company", "", "   ",
    ]) {
      expect(isPlaceholderValue(value), value).toBe(true);
      expect(realValue(value), value).toBeNull();
    }
  });

  it("keeps real names that merely contain one of those words", () => {
    // Anchored, not substring. These are real companies, and a looser test
    // would erase them — a worse bug than the one being fixed.
    for (const value of [
      "NA Consulting", "Nan Systems", "Company House Ltd",
      "None The Wiser Ltd", "TBD Partners", "Unknown Pleasures Records",
      "Null Island Software",
    ]) {
      expect(isPlaceholderValue(value), value).toBe(false);
      expect(realValue(value), value).toBe(value);
    }
  });

  it("trims a real value rather than returning it as given", () => {
    expect(realValue("  Acme Inc  ")).toBe("Acme Inc");
  });

  it("treats null and undefined as nothing, not as the string", () => {
    expect(realValue(null)).toBeNull();
    expect(realValue(undefined)).toBeNull();
    expect(isPlaceholderValue(null)).toBe(true);
  });

  it("does not mistake a normal company for a placeholder", () => {
    for (const value of ["Acme Inc", "InsightIQ", "Stripe", "37signals"]) {
      expect(isPlaceholderValue(value), value).toBe(false);
    }
  });
});

/**
 * The subtler half of the same bug. "Unknown" is truthy, so
 * `if (fullName && lead.company_name)` took the name+company branch — which
 * means a lead that HAD an email was enriched by name against a company called
 * Unknown, instead of by the email, which is the stronger identifier.
 */
describe("choosing an identifier for the reveal", () => {
  const pick = (lead: { contact_name?: string; company_name?: string; contact_email?: string }) => {
    const company = realValue(lead.company_name);
    if (lead.contact_name && company) return "name+company";
    if (lead.contact_email) return "email";
    return "none";
  };

  it("prefers the email over a name paired with a placeholder company", () => {
    expect(pick({
      contact_name: "Ott Salmar",
      company_name: "Unknown",
      contact_email: "ott@example.com",
    })).toBe("email");
  });

  it("still prefers name and company when the company is real", () => {
    expect(pick({
      contact_name: "Ott Salmar",
      company_name: "Acme Inc",
      contact_email: "ott@example.com",
    })).toBe("name+company");
  });

  it("reports nothing usable rather than inventing a filter", () => {
    expect(pick({ contact_name: "Ott Salmar", company_name: "Unknown" })).toBe("none");
  });
});
