import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AUDIT_TOOL_CHOICE,
  BEDROCK_OPUS_55_US_ID,
  BEDROCK_STANDARD_MODEL_ID,
  copyAuditDispatch,
  serverAuditPrelude,
  toConverseBody,
} from "../../supabase/functions/_shared/bedrock";
import { prepareServerCopyAudit, runMechanicalAudit } from "../../supabase/functions/_shared/copy-audit";
import { auditDeliverability } from "../../supabase/functions/_shared/email-deliverability";
import { auditEmail } from "../../supabase/functions/_shared/email-audit";
import { extractPastedEmail } from "../../supabase/functions/_shared/pasted-email";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

const EMAIL = `Hi Dana,
Noticed you hired four SDRs, which usually means the ramp is the bottleneck.
Worth a quick look?
Thanks,
Sam`;

const WRAPPER =
  `what's wrong with this, and is a 30 minute meeting too much? ${"please ".repeat(70)}`;

function rules(findings: Array<{ rule: string }>): string[] {
  return findings.map((finding) => finding.rule);
}

describe("the pasted email is what gets audited", () => {
  const message = `${WRAPPER}\n\nSubject: ramp\n${EMAIL}`;

  it("drops the wrapper question, including a time ask, from the subject and body", () => {
    const extracted = extractPastedEmail(message);
    expect(extracted).toMatchObject({ status: "ready", subject: "ramp" });
    if (extracted.status !== "ready") return;
    expect(extracted.body.startsWith("Hi Dana,")).toBe(true);
    expect(extracted.body).not.toContain("30 minute");
    expect(extracted.body).not.toContain("what's wrong");
    expect(extracted.body).not.toContain("Subject:");
  });

  it("does not let that wrapper change the ask or the length", () => {
    const raw = auditEmail({ subject: "ramp", body: message, verifiedProof: "" });
    const prepared = prepareServerCopyAudit(message);
    expect(prepared.payload.status).toBe("audited");
    const findings = prepared.payload.findings as Array<{ rule: string; evidence: string }>;
    expect(rules(raw)).toContain("two_asks");
    expect(rules(raw)).toContain("over_length");
    expect(rules(findings)).not.toContain("two_asks");
    expect(rules(findings)).not.toContain("over_length");
    expect(rules(findings)).toContain("under_length");
    expect(findings.every((finding) => !finding.evidence.includes("30 minute"))).toBe(true);
  });

  it("matches the tool audit for the extracted subject and body", () => {
    const extracted = extractPastedEmail(message);
    expect(extracted.status).toBe("ready");
    if (extracted.status !== "ready") return;
    const direct = [
      ...auditEmail({ subject: extracted.subject, body: extracted.body, verifiedProof: "" }),
      ...auditDeliverability({ subject: extracted.subject, body: extracted.body, isFirstTouch: true }),
    ];
    const shared = runMechanicalAudit({ subject: extracted.subject, body: extracted.body, verifiedProof: "" });
    const prepared = prepareServerCopyAudit(message);
    expect(shared.findings).toEqual(direct);
    expect(prepared.payload.findings).toEqual(direct);
    expect(prepared.event).toEqual(shared.event);
    expect(prepared.arguments).toBe(JSON.stringify({ subject: extracted.subject, body: extracted.body }));
  });

  it("strips a time question that sits after the sign-off and keeps a P.S.", () => {
    const trailing = `review this\n\nSubject: ramp\n${EMAIL}\n\nis a 30 minute meeting too much?`;
    const extracted = extractPastedEmail(trailing);
    expect(extracted.status).toBe("ready");
    if (extracted.status !== "ready") return;
    expect(extracted.body).not.toContain("30 minute");
    const withPs = `Subject: ramp\n${EMAIL}\n\nP.S. Worth 15 minutes if that is easier?`;
    const kept = extractPastedEmail(withPs);
    expect(kept.status).toBe("ready");
    if (kept.status !== "ready") return;
    expect(kept.body).toContain("P.S. Worth 15 minutes");
    const ctaAfterSignoff = extractPastedEmail(`Subject: ramp\nHi Dana,\nNoticed the four roles, which usually means the ramp slips.\nThanks,\nSam\nWorth a call?`);
    expect(ctaAfterSignoff.status).toBe("ready");
    if (ctaAfterSignoff.status !== "ready") return;
    expect(ctaAfterSignoff.body).toContain("Worth a call?");
  });

  it("takes an inline paste after the colon, not the question in front of it", () => {
    const extracted = extractPastedEmail(
      "is this any good? Hey Priya,\n\nsome copy about the ramp and why it usually slips.\n\nCheers",
    );
    expect(extracted.status).toBe("ready");
    if (extracted.status !== "ready") return;
    expect(extracted.subject).toBe("");
    expect(extracted.body.startsWith("Hey Priya,")).toBe(true);
    expect(extracted.body).not.toContain("any good");
  });
});

describe("missing or ambiguous paste is not audited", () => {
  it("asks when the subject has no body", () => {
    const prepared = prepareServerCopyAudit("audit this email:\nSubject: only a subject");
    expect(prepared.payload.status).toBe("needs_content");
    expect(prepared.payload.findings).toEqual([]);
    expect(prepared.event).toMatchObject({ name: "audit_email", label: "Audit needs the email", status: "error" });
    expect(String(prepared.payload.summary)).not.toMatch(/clear to send|No rule violations/i);
    expect(String(prepared.payload.note)).toMatch(/do not invent findings/i);
    expect(prepared.arguments).toBe("{}");
  });

  it("asks when the review question has no separable email", () => {
    const prepared = prepareServerCopyAudit("please review this email and tell me what is wrong with the ask");
    expect(prepared.payload.status).toBe("needs_content");
    expect(prepared.payload.findings).toEqual([]);
    expect(prepared.event.label).not.toContain("clean");
  });

  it("declines two subjects and two greetings instead of concatenating them", () => {
    const twoSubjects = prepareServerCopyAudit(
      "review both\n\nSubject: one\nHi Ann,\nFirst note.\nThanks\n\nSubject: two\nHi Ben,\nSecond note.\nCheers",
    );
    const twoGreetings = prepareServerCopyAudit(
      `review both\n\nHi Ann,\nWorth a look?\nThanks,\nAnn\n\nHi Ben,\nWorth a chat?\nCheers,\nBen`,
    );
    for (const prepared of [twoSubjects, twoGreetings]) {
      expect(prepared.payload.status).toBe("needs_content");
      expect(prepared.payload.findings).toEqual([]);
      expect(String(prepared.payload.summary)).toMatch(/not determined/);
    }
  });
});

describe("position still selects the same first-touch deliverability rule", () => {
  it("warns on a first touch and notes a later one", () => {
    const body = '<img src="x">';
    const image = (position?: number) =>
      runMechanicalAudit({ body, position }).findings.find((finding) => finding.rule === "image_in_email");
    expect(image()?.severity).toBe("warning");
    expect(image(1)?.severity).toBe("warning");
    expect(image(2)?.severity).toBe("note");
  });
});

describe("Opus still answers from the prelude and is not forced", () => {
  it("puts the extracted audit in the tool result and does not send a tool choice", () => {
    const prepared = prepareServerCopyAudit(`${WRAPPER}\n\nSubject: ramp\n${EMAIL}`);
    const prelude = serverAuditPrelude(JSON.stringify(prepared.payload), prepared.arguments);
    const opus = toConverseBody({
      model: BEDROCK_OPUS_55_US_ID,
      messages: [{ role: "user", content: "Review the paste." }, ...prelude],
      tools: [{ type: "function", function: { name: "audit_email", parameters: { type: "object" } } }],
      tool_choice: AUDIT_TOOL_CHOICE,
    });
    expect(copyAuditDispatch(BEDROCK_OPUS_55_US_ID)).toBe("server");
    expect((opus.toolConfig as { toolChoice?: unknown }).toolChoice).toBeUndefined();
    const encoded = JSON.stringify(opus.messages);
    expect(encoded).toContain("under_length");
    expect(encoded).not.toContain("30 minute");
    expect(encoded).not.toContain("toolChoice");
    const call = prelude[0].tool_calls as Array<{ function: { arguments: string } }>;
    expect(JSON.parse(call[0].function.arguments)).toMatchObject({ subject: "ramp" });
    expect(JSON.parse(call[0].function.arguments).body).not.toContain("30 minute");
  });

  it("keeps a named tool_choice for Haiku and Sonnet", () => {
    expect(copyAuditDispatch(BEDROCK_STANDARD_MODEL_ID)).toBe("tool_choice");
    expect(copyAuditDispatch("us.anthropic.claude-sonnet-4-5-20250929-v1:0")).toBe("tool_choice");
    const forced = toConverseBody({
      model: BEDROCK_STANDARD_MODEL_ID,
      messages: [{ role: "user", content: "Review this." }],
      tools: [{ type: "function", function: { name: "audit_email", parameters: { type: "object" } } }],
      tool_choice: AUDIT_TOOL_CHOICE,
    });
    expect((forced.toolConfig as { toolChoice?: { tool?: { name?: string } } }).toolChoice?.tool?.name).toBe("audit_email");
  });
});

describe("the server path audits the paste and leaves the other safeguards in place", () => {
  const prelude = AGENT.slice(AGENT.indexOf('auditHow === "server"'), AGENT.indexOf("let res: Response"));

  it("records a tool event for the extracted audit", () => {
    expect(prelude).toContain("prepareServerCopyAudit(userMessage)");
    expect(prelude).toContain("toolEvents.push(prepared.event)");
    expect(prelude).not.toContain("body: String(userMessage");
  });

  it("forces the tool only for models that accept it, on the first step", () => {
    expect(AGENT).toContain("step === 0 && forceAudit");
    expect(AGENT).toContain('...(auditHow === "tool_choice" ? { tool_choice: AUDIT_TOOL_CHOICE } : {})');
    expect(AGENT).toContain('allowedTools.includes("audit_email") && wantsCopyAudit(userMessage)');
  });

  it("still repairs history, keeps unknown outcomes, and still budgets reasoning", () => {
    expect(AGENT).toContain("repairToolSequence(messages)");
    expect(AGENT).toContain("unknownMutationKeys(messages, mutationKeyFor)");
    expect(AGENT).toContain('reasoning_effort: step >= REASONING_STEPS ? "none" : "low"');
  });
});
