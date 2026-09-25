import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const GENERATE = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");
const GUARD = readFileSync("supabase/functions/_shared/internal-auth.ts", "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const GEN = code(GENERATE);
const WORK = code(WORKER);

/**
 * "Drafting the rest of the batch — 48 of 103, 48 failed."
 *
 * Every queued item, every run, since the queue was built. The worker holds the
 * service role because nobody is sitting in front of it, generate-email called
 * auth.getUser() on that and got no user, and returned 401. The inline path
 * worked the whole time because a person's JWT was on the request, which is why
 * this looked like a queue problem rather than an auth one.
 */
describe("the batch worker can actually reach the generator", () => {
  it("the worker calls with the service role, because it has no user", () => {
    expect(WORK).toContain("Authorization: `Bearer ${serviceKey}`");
  });

  it("generate-email lets an internal caller through", () => {
    expect(GEN).toContain('import { isInternalCaller } from "../_shared/internal-auth.ts";');
    expect(GEN).toContain("const internal = isInternalCaller(req);");
    // The user lookup still runs for everyone else, and still rejects.
    expect(GEN).toMatch(/if \(!internal\) \{[\s\S]{0,400}auth\.getUser\(\)/);
  });

  it("an internal caller does not get to say who it is acting for", () => {
    // The only thing it chooses is which lead; the database says whose it is.
    // A forged user_id in the body cannot work because the body is never read
    // for it.
    expect(GEN).toContain("if (internal) userId = String(leadData.user_id ?? '');");
    expect(GEN).not.toMatch(/requestData\.user_id|body\.user_id|requestData\.userId/);
  });

  it("a signed-in caller still has to own the lead", () => {
    expect(GEN).toContain("(!internal && leadData.user_id !== userId)");
    expect(GEN).toContain("'Lead not found or unauthorized'");
  });

  it("no path continues without a resolved user", () => {
    // Belt and braces: if neither branch set it, stop rather than query with "".
    expect(GEN).toMatch(/if \(!userId\) \{[\s\S]{0,200}status: 401/);
  });

  it("the guard it trusts is the shared one, not a new comparison", () => {
    expect(code(GUARD)).toContain("token === serviceKey");
    expect(GEN).not.toContain("SUPABASE_SERVICE_ROLE_KEY') === token");
  });
});

describe("a queued draft is the same email as an inline one", () => {
  it("the worker resolves the sender's mailbox", () => {
    // It passed senderEmail: "" — and with no name and no address the model is
    // told the sender is called "Sender", which is where "[Sender Name]" in a
    // finished draft came from.
    expect(WORK).not.toContain('senderEmail: "",');
    expect(WORK).toContain("senderEmail,");
    expect(WORK).toContain('.from("sending_accounts")');
    expect(WORK).toContain("(a) => a.integration_id && a.email");
  });

  it("both paths go through the one shared draft helper", () => {
    // Two copies of this is how the batch run and the inline run drift.
    expect(WORK).toContain("draftForLead");
    expect(code(readFileSync("supabase/functions/agent-chat/index.ts", "utf8"))).toContain("draftForLead");
  });
});
