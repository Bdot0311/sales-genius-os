import { describe, expect, it } from "vitest";
import { nameFromEmail } from "../../supabase/functions/_shared/email-rules.ts";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const GEN = read("../../supabase/functions/generate-email/index.ts");
const AGENT = read("../../supabase/functions/agent-chat/index.ts");
const REST = read("../../supabase/functions/rest-api/index.ts");

/**
 * The agent reported "8 of 12 failed because the generator returned unresolved
 * placeholders". The generator was not at fault: agent-chat passed an empty
 * senderName, generate-email told the model the sender was named "Sender", and
 * the model duly wrote a stand-in that the placeholder guard then rejected. A
 * missing profile field, surfaced as an unexplained generation fault.
 */
describe("deriving a sender name from the sending address", () => {
  it("reads a first name", () => {
    expect(nameFromEmail("brandon@outreign.io")).toBe("Brandon");
  });

  it("reads a separated full name", () => {
    expect(nameFromEmail("john.smith@acme.com")).toBe("John Smith");
    expect(nameFromEmail("jane_doe@acme.com")).toBe("Jane Doe");
    expect(nameFromEmail("mary-beth@acme.com")).toBe("Mary Beth");
  });

  it("drops the disambiguating digits people add", () => {
    expect(nameFromEmail("brandon2@acme.com")).toBe("Brandon");
    expect(nameFromEmail("john.smith99@acme.com")).toBe("John Smith");
  });

  it("returns nothing for a mailbox that names a function, not a person", () => {
    // Signing a cold email "Info" is worse than admitting we have no name.
    for (const addr of ["info@acme.com", "sales@acme.com", "noreply@acme.com", "careers@acme.com"]) {
      expect(nameFromEmail(addr), addr).toBe("");
    }
  });

  it("returns nothing rather than guessing at junk", () => {
    expect(nameFromEmail("")).toBe("");
    expect(nameFromEmail("@acme.com")).toBe("");
    expect(nameFromEmail("123@acme.com")).toBe("");
  });
});

describe("generate-email refuses to write what it cannot sign", () => {
  it("no longer invents a sender called 'Sender'", () => {
    expect(GEN).not.toContain("senderName || 'Sender'");
    expect(GEN).toContain("sender_name: ${resolvedSenderName}");
  });

  it("falls back to the sending address before giving up", () => {
    expect(GEN).toContain("senderName || nameFromEmail(senderEmail)");
  });

  it("fails with an actionable reason rather than a placeholder draft", () => {
    expect(GEN).toContain("no_sender_name");
    expect(GEN).toMatch(/Add your name in Settings/);
  });

  it("fills stand-ins with the resolved name, not the empty original", () => {
    // fillSenderStandIns(text, "") returns "" — it deletes the sign-off.
    expect(GEN).toContain("fillSenderStandIns(email, resolvedSenderName, resolvedSenderCompany)");
  });
});

describe("every caller can supply a name", () => {
  it("the agent passes its connected mailbox address", () => {
    expect(AGENT).toContain("const senderEmail = String(mailboxes[0]?.email ?? \"\")");
    expect(AGENT).toContain("senderEmail,");
  });

  it("the REST API fills the sender from the account", () => {
    // API callers rarely pass one; erroring for something the server already
    // knows would be a regression, not a safeguard.
    expect(REST).toContain("senderName, senderEmail, userId");
    expect(REST).toContain("sending_accounts");
  });
});
