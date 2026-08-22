import { describe, expect, it } from "vitest";
import {
  emailDomainMismatch,
  isCompanyLinkedIn,
  isPersonLinkedIn,
  normalizeDomain,
} from "../../supabase/functions/_shared/email-rules.ts";

/**
 * Reported: leads arrive with a LinkedIn that "doesn't find the person", a
 * website that doesn't match the company, and often no email. The first two
 * were real mapping bugs.
 */
describe("telling a person's LinkedIn from a company's", () => {
  it("accepts a personal profile", () => {
    expect(isPersonLinkedIn("https://www.linkedin.com/in/brandon-yakubov/")).toBe(true);
    expect(isPersonLinkedIn("linkedin.com/pub/jane-doe/1/2/3")).toBe(true);
  });

  it("rejects a company page as a person", () => {
    // The mapper took the first non-empty value, so this got stored as the
    // contact's profile — which is why opening it finds no person.
    expect(isPersonLinkedIn("https://www.linkedin.com/company/acme-inc/")).toBe(false);
    expect(isCompanyLinkedIn("https://www.linkedin.com/company/acme-inc/")).toBe(true);
  });

  it("rejects schools and showcase pages too", () => {
    expect(isPersonLinkedIn("https://linkedin.com/school/mit/")).toBe(false);
    expect(isPersonLinkedIn("https://linkedin.com/showcase/acme-cloud/")).toBe(false);
  });

  it("rejects anything that is not LinkedIn", () => {
    expect(isPersonLinkedIn("https://twitter.com/someone")).toBe(false);
    expect(isPersonLinkedIn("")).toBe(false);
  });
});

describe("reducing a provider's 'website' to a hostname", () => {
  it("strips scheme, www, path, query and port", () => {
    expect(normalizeDomain("https://www.acme.com/about?utm=x")).toBe("acme.com");
    expect(normalizeDomain("http://acme.com:8080/team")).toBe("acme.com");
    expect(normalizeDomain("ACME.com")).toBe("acme.com");
  });

  it("keeps subdomains, which are meaningful", () => {
    expect(normalizeDomain("careers.acme.co.uk")).toBe("careers.acme.co.uk");
  });

  it("returns nothing for values that are not hostnames", () => {
    // Better an empty website than one pointing at junk.
    for (const junk of ["", "n/a", "not a website", "acme", "http://", "123"]) {
      expect(normalizeDomain(junk), junk).toBe("");
    }
  });
});

describe("flagging an email that disagrees with the company", () => {
  it("flags a clear mismatch", () => {
    expect(emailDomainMismatch("john@acme.com", "othercorp.io")).toBe(true);
  });

  it("does not flag the same company", () => {
    expect(emailDomainMismatch("john@acme.com", "https://www.acme.com/")).toBe(false);
  });

  it("does not flag subdomains or country variants", () => {
    // Legitimate: mail.acme.com, acme.co.uk.
    expect(emailDomainMismatch("john@mail.acme.com", "acme.com")).toBe(false);
    expect(emailDomainMismatch("john@acme.co.uk", "acme.com")).toBe(false);
  });

  it("never flags a personal mailbox", () => {
    // Plenty of founders use gmail; that says nothing about the company field.
    expect(emailDomainMismatch("john@gmail.com", "acme.com")).toBe(false);
  });

  it("says nothing when either side is missing", () => {
    expect(emailDomainMismatch("", "acme.com")).toBe(false);
    expect(emailDomainMismatch("john@acme.com", "")).toBe(false);
  });
});
