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

  it("claims the pending row before anyone sends", () => {
    const claim = approve.indexOf("status.eq.pending");
    const send = approve.indexOf("/functions/v1/send-email");
    expect(claim).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(claim);
    expect(approve).toContain('status: "sending"');
    expect(approve).toContain('.select("*")');
  });

  it("reclaims a sending row left past the claim window", () => {
    expect(SRC).toContain("const SENDING_CLAIM_MS = 10 * 60 * 1000");
    expect(approve).toContain('updated_at.lt."');
    expect(approve).toContain("status.eq.sending");
    const claim = approve.indexOf("status.eq.pending");
    const send = approve.indexOf("/functions/v1/send-email");
    expect(claim).toBeLessThan(send);
  });

  it("passes the original sent email's thread on a reply", () => {
    const lookup = approve.indexOf("gmail_thread_id");
    const send = approve.indexOf("/functions/v1/send-email");
    expect(approve).toContain('.from("sent_emails")');
    expect(approve).toContain("approval.sent_email_id");
    expect(approve).toContain("threadId");
    expect(lookup).toBeGreaterThan(-1);
    expect(lookup).toBeLessThan(send);
  });

  it("puts the row back to pending when the send does not happen", () => {
    const failed = approve.indexOf("if (!sendRes.ok || sendData?.error)");
    const markedSent = approve.indexOf("sent = true");
    expect(failed).toBeGreaterThan(-1);
    expect(markedSent).toBeGreaterThan(failed);
    expect(approve).toContain('update({ status: "pending" })');
    expect(approve).toContain('.eq("status", "sending")');
    expect(approve).toContain("if (!sent) await release()");
  });

  it("does not exempt a reply from the duplicate guard", () => {
    expect(approve).not.toContain("allowDuplicate");
  });
});
