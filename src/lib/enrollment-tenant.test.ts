import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const MCP = code("src/lib/mcp/tools/enroll-lead.ts");
const CHAT = code("supabase/functions/agent-chat/index.ts");
const STEP = code("supabase/functions/process-sequence-step/index.ts");
const SEND = code("supabase/functions/send-email/index.ts");
const ANALYZE = code("supabase/functions/analyze-reply/index.ts");
const POLICY = readFileSync("supabase/migrations/20261106043000_enrollment_same_tenant.sql", "utf8");

describe("an enrollment cannot name another account's lead", () => {
  it("the insert policy requires the lead and the sequence to belong to the caller", () => {
    expect(POLICY).toContain("public.leads");
    expect(POLICY).toContain("l.user_id = auth.uid()");
    expect(POLICY).toContain("public.email_sequences");
    expect(POLICY).toContain("s.user_id = auth.uid()");
    expect(POLICY).toContain("FOR INSERT");
  });

  it("the generated MCP bundle checks both rows before it inserts", () => {
    const bundle = readFileSync("supabase/functions/mcp/index.ts", "utf8");
    const enroll = bundle.slice(bundle.indexOf("enroll_lead_in_sequence"), bundle.indexOf("src/lib/mcp/tools/send-reply.ts"));
    const insert = enroll.indexOf('.from("sequence_enrollments")');
    expect(enroll.indexOf('.from("leads")')).toBeGreaterThan(-1);
    expect(enroll.indexOf('.from("email_sequences")')).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(enroll.indexOf('.from("leads")'));
    expect(enroll).toContain("Lead not found");
    expect(enroll).toContain("Sequence not found");
  });

  it("the MCP tool checks both rows before it inserts", () => {
    const insert = MCP.indexOf('.from("sequence_enrollments")');
    const lead = MCP.indexOf('.from("leads")');
    const sequence = MCP.indexOf('.from("email_sequences")');
    expect(lead).toBeGreaterThan(-1);
    expect(sequence).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lead);
    expect(insert).toBeGreaterThan(sequence);
    expect(MCP).toContain("Lead not found");
    expect(MCP).toContain("Sequence not found");
  });

  it("the agent checks the sequence, because service role bypasses the policy", () => {
    const block = CHAT.slice(CHAT.indexOf('case "enroll_lead_in_sequence"'), CHAT.indexOf('case "list_recent_replies"'));
    const sequence = block.indexOf('.from("email_sequences")');
    const insert = block.indexOf('.from("sequence_enrollments")');
    expect(sequence).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(sequence);
    expect(block).toContain('.eq("user_id", userId)');
  });

  it("the worker stops a mismatched enrollment before it queues mail", () => {
    const guard = STEP.indexOf("lead_or_sequence_not_owned");
    const queue = STEP.indexOf("status: 'scheduled'");
    const leadWrite = STEP.lastIndexOf(".from('leads')");
    expect(guard).toBeGreaterThan(-1);
    expect(queue).toBeGreaterThan(guard);
    expect(STEP.slice(leadWrite)).toContain(".eq('user_id', enrollment.user_id)");
  });
});

describe("a lead id from another account is not this account's lead", () => {
  it("send-email reads the lead as the authenticated user", () => {
    const lookup = SEND.indexOf("email_verification_status");
    const window = SEND.slice(lookup, lookup + 500);
    expect(window).toContain(".eq('user_id', user.id)");
    expect(SEND).toContain("lead_not_found");
  });

  it("analyze-reply only keeps a lead the caller owns", () => {
    expect(ANALYZE).toContain("ownedLeadId");
    const lookup = ANALYZE.indexOf(".from('leads')");
    expect(ANALYZE.slice(lookup, lookup + 400)).toContain(".eq('user_id', user.id)");
    expect(ANALYZE).not.toMatch(/p_lead_id: leadId\b/);
    expect(ANALYZE).toContain("p_lead_id: ownedLeadId");
  });
});
