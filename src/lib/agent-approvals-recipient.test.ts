import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("supabase/functions/agent-approvals/index.ts", "utf8");

const approve = SRC.slice(
  SRC.indexOf('if (action === "approve")'),
  SRC.indexOf('return json({ error: "Unknown action" }'),
);

/**
 * Approving a draft took the recipient from leads.email.
 *
 * The column is contact_email. PostgREST rejects the unknown column, the
 * client ignored that error, and a null row became 404 "Lead not found" — so
 * every approval send failed, including ones whose lead was right there.
 *
 * The address still has to come from a lead the caller owns. The approval row
 * is writable by that caller, so prospect_email on it is not a recipient.
 */
describe("an approved send uses the owned lead's contact_email", () => {
  it("selects contact_email on a lead that belongs to the caller", () => {
    expect(approve).toContain('.from("leads")');
    expect(approve).toMatch(/\.select\("id, contact_email"\)/);
    expect(approve).toMatch(/\.eq\("id", approval\.lead_id\)/);
    expect(approve).toMatch(/\.eq\("user_id", user\.id\)/);
    expect(approve).not.toMatch(/\.select\("id, email"\)/);
  });

  it("sends to that address", () => {
    expect(approve).toContain("ownedLead.contact_email");
    expect(approve).not.toContain("approval.prospect_email");
    expect(approve).not.toContain("ownedLead.email");
  });

  it("returns 500 when the lead query fails, and 404 only when no row comes back", () => {
    const failed = approve.slice(approve.indexOf("if (leadErr)"), approve.indexOf("if (!ownedLead)"));
    expect(failed).toContain("console.error");
    expect(failed).toMatch(/,\s*500\)/);
    expect(approve).toMatch(/if \(!ownedLead\) return json\(\{ error: "Lead not found" \}, 404\)/);
    expect(failed).not.toContain("Lead not found");
  });

  it("still refuses an approval that names no lead", () => {
    expect(approve).toMatch(/if \(!approval\.lead_id\) return json\(\{ error: "Approval has no lead" \}, 400\)/);
  });
});
