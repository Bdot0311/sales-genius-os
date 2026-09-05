import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { OUTREACH_TOOLS, REPLY_TOOLS } from "../../supabase/functions/_shared/agent-tool-scope.ts";
import { TIER_BLOCKED_TOOLS } from "../../supabase/functions/_shared/agent-tier-scope.ts";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

/**
 * Why the checks became tools rather than more prompt.
 *
 * Thirteen thousand tokens of frameworks appended to a system prompt is advice
 * the model may or may not take, and nothing afterwards checks whether it did.
 * That is why the skills felt inert: there was no way to tell, from the
 * outside, whether any of it had been applied to a given email.
 *
 * A tool call is different in kind. The agent has to ask for it, the answer
 * comes back as findings it must respond to, and the call shows up in the
 * transcript — so "did it actually check" stops being a matter of faith.
 */
describe("the audits are reachable as tools", () => {
  it("both are declared to the model", () => {
    expect(AGENT).toContain('name: "audit_email"');
    expect(AGENT).toContain('name: "audit_sequence"');
  });

  it("both are implemented, not just declared", () => {
    expect(AGENT).toContain('case "audit_email": {');
    expect(AGENT).toContain('case "audit_sequence": {');
  });

  it("every email-facing agent may call them", () => {
    // The hard scope gate refuses any tool not in the role's list, so a tool
    // that is declared and unscoped is a tool that always errors.
    expect(OUTREACH_TOOLS).toContain("audit_email");
    expect(OUTREACH_TOOLS).toContain("audit_sequence");
    expect(REPLY_TOOLS).toContain("audit_email");
  });

  it("no plan tier is denied them", () => {
    // Read-only and deterministic: there is nothing to meter and no reason to
    // sell checking your own copy as an upgrade.
    for (const blocked of Object.values(TIER_BLOCKED_TOOLS)) {
      expect(blocked).not.toContain("audit_email");
      expect(blocked).not.toContain("audit_sequence");
    }
  });
});

describe("the agent is told to use it instead of improvising", () => {
  it("has a standing rule", () => {
    expect(AGENT).toContain("- REVIEWING COPY:");
  });

  it("forbids substituting an opinion for the findings", () => {
    const rule = AGENT.slice(AGENT.indexOf("- REVIEWING COPY:"), AGENT.indexOf("- REPEATS:"));
    expect(rule).toMatch(/never call an email fine when the audit returned findings/i);
    expect(rule).toMatch(/may not replace them with it/i);
  });

  it("is hidden from agents that do not have the tool", () => {
    expect(AGENT).toContain('{ marker: "- REVIEWING COPY:", tools: ["audit_email"] }');
  });
});

describe("the tool result cannot be reported as clean when it is not", () => {
  it("says so in the note the model reads", () => {
    const branch = AGENT.slice(AGENT.indexOf('case "audit_email": {'), AGENT.indexOf('case "audit_sequence": {'));
    expect(branch).toMatch(/do not soften a blocker into a suggestion/i);
  });

  it("shows the user a tool event either way", () => {
    const branch = AGENT.slice(AGENT.indexOf('case "audit_email": {'), AGENT.indexOf('case "audit_sequence": {'));
    expect(branch).toContain("toolEvents.push");
    expect(branch).toContain("Audited");
  });

  it("marks a blocker as an error, not a note", () => {
    const branch = AGENT.slice(AGENT.indexOf('case "audit_email": {'), AGENT.indexOf('case "audit_sequence": {'));
    expect(branch).toContain('blockers > 0 ? "error"');
  });
});

describe("the sequence audit reads the real spacing", () => {
  const branch = AGENT.slice(AGENT.indexOf('case "audit_sequence": {'), AGENT.indexOf('case "list_sequences": {'));

  it("turns delay_days into the day each step lands on", () => {
    // delay_days on a step is the wait before the NEXT one, so the day a step
    // lands is the running total of everything before it. Reading it as the
    // step's own offset would report a correctly spaced sequence as bunched.
    expect(branch).toContain("delay_days");
    expect(branch).toContain("cursor +=");
  });

  it("scopes the sequence to the signed-in account", () => {
    expect(branch).toContain('.eq("user_id", userId)');
  });

  it("says plainly when a sequence has no steps to audit", () => {
    expect(branch).toMatch(/has no steps yet/);
  });
});
