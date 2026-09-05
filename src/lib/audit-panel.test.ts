import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PANEL = readFileSync("src/components/outreach/EmailAuditPanel.tsx", "utf8");
const STUDIO = readFileSync("src/pages/Outreach.tsx", "utf8");

/**
 * The rules ran only inside generate-email, on copy the model had just
 * written. An email typed into the studio by hand, or pasted in from
 * somewhere else, went through none of them.
 */
describe("the studio can audit an email", () => {
  it("has a button", () => {
    expect(PANEL).toContain('{findings ? "Re-run" : "Audit"}');
  });

  it("is mounted where the draft is shown", () => {
    expect(STUDIO).toContain("EmailAuditPanel");
    const at = STUDIO.indexOf("<EmailAuditPanel");
    const rubric = STUDIO.indexOf("<EmailRubricPanel");
    expect(at).toBeGreaterThan(rubric);
  });

  it("runs the same module the agent's tool runs", () => {
    // The writing rules once existed in three places and drifted. The studio
    // and the chat must not be able to disagree about whether an email is
    // sendable.
    expect(PANEL).toContain("supabase/functions/_shared/email-audit");
    expect(PANEL).toContain("auditEmail");
  });

  it("passes the position so first-touch rules apply", () => {
    expect(STUDIO).toContain("position={isFirstTouch ? 1 : undefined}");
  });

  it("shows evidence, reason and fix for each finding", () => {
    expect(PANEL).toContain("f.evidence");
    expect(PANEL).toContain("f.why");
    expect(PANEL).toContain("f.fix");
  });

  it("does not claim a clean audit means the email is good", () => {
    // That is the rubric's question, and conflating them is how a mechanical
    // pass gets read as an endorsement.
    expect(PANEL).toMatch(/says nothing about whether the email is/i);
  });

  it("disables the button with nothing to audit", () => {
    expect(PANEL).toContain("disabled={running || !body.trim()}");
  });
});
