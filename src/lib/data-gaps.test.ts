import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const TABLE = readFileSync(
  new URL("../../src/components/dashboard/ExternalLeadsTable.tsx", import.meta.url),
  "utf8",
);

/**
 * The provider waterfall returns whatever each vendor holds, so a thin record
 * and a complete one looked identical in the results list. "Data 34" is not
 * actionable; naming the gap is.
 */
describe("thin records are visible in the list", () => {
  it("names what is missing rather than showing a score", () => {
    expect(TABLE).toContain('gaps.push("No email")');
    expect(TABLE).toContain('gaps.push("No LinkedIn")');
    expect(TABLE).toContain('gaps.push("No website")');
  });

  it("says so in place of a blank email cell", () => {
    // The cell used to render an empty string, which reads as a UI glitch.
    expect(TABLE).toContain("No email found");
  });

  it("surfaces an email/website mismatch separately from a gap", () => {
    // Both fields are present but disagree — a different problem from absence.
    expect(TABLE).toContain("email_domain_mismatch === true");
    expect(TABLE).toContain("Email/site mismatch");
  });

  it("renders nothing when the record is complete", () => {
    expect(TABLE).toContain("if (gaps.length === 0 && !mismatch) return null;");
  });

  it("badges rather than filters", () => {
    // A lead with no email but a real LinkedIn is still worth having, and it
    // was already paid for.
    expect(TABLE).not.toMatch(/leads\.filter\([^)]*business_email/);
  });
});
