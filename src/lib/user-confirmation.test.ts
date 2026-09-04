import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  awaitedConfirmation,
  isAffirmative,
  userConfirmedSend,
} from "../../supabase/functions/_shared/user-confirmation.ts";

const asked = [
  { role: "user", content: "send the follow-ups" },
  {
    role: "assistant",
    content: "21 ready to go from three mailboxes. Confirm and I'll send.",
    tool_events: [{ name: "send_drafts", status: "queued", label: "Waiting for your go-ahead" }],
  },
];

const didNotAsk = [
  { role: "user", content: "how many drafts do I have?" },
  {
    role: "assistant",
    content: "You have 21 drafts waiting.",
    tool_events: [{ name: "list_drafts", status: "ok", label: "Listed drafts" }],
  },
];

/**
 * Retiring the queue left sending gated on a flag the model sets. When it did
 * not set it, nothing ever sent: preview, "yes", preview, "yes" — and the model
 * explained the non-send with whatever else the tool had mentioned, so a user
 * was told repeatedly that their drafts were duplicates.
 */
describe("a person's yes is read from what they wrote", () => {
  it.each(["yes", "Yes.", "send it", "send them all", "go ahead", "approve all", "do it", "ok", "confirmed", "ship it"])(
    "accepts %s",
    (msg) => {
      expect(userConfirmedSend(msg, asked), msg).toBe(true);
    },
  );

  it("needs the previous turn to have actually asked", () => {
    // "yes, that one looks right" is agreement about a draft, not permission
    // to mail twenty-one people.
    expect(userConfirmedSend("yes", didNotAsk)).toBe(false);
    expect(userConfirmedSend("yes", [])).toBe(false);
  });
});

describe("what must never count as consent", () => {
  it.each([
    "yes but change the subject first",
    "yes, except for Martin",
    "should I send?",
    "yes if the copy is fixed",
    "no",
    "not yet",
    "don't send",
    "hold off",
    "wait",
    "send only the first three",
  ])("refuses %s", (msg) => {
    expect(isAffirmative(msg), msg).toBe(false);
  });

  it("refuses a long message that merely contains a yes", () => {
    const essay = "yes ".repeat(40);
    expect(isAffirmative(essay)).toBe(false);
  });

  it("refuses an empty message", () => {
    expect(isAffirmative("")).toBe(false);
    expect(isAffirmative("   ")).toBe(false);
  });
});

describe("reading the previous turn", () => {
  it("looks at tool events, not at the prose", () => {
    // The events record that a send tool ran and returned without sending.
    // The summary is only the model's account of that.
    expect(awaitedConfirmation(asked)).toBe(true);
    expect(awaitedConfirmation([{ role: "assistant", content: "Confirm and I'll send." }])).toBe(false);
  });

  it("only counts the most recent assistant turn", () => {
    // An older pending send is a different batch; agreement does not reach back.
    const stale = [...asked, {
      role: "assistant",
      content: "Here are your leads.",
      tool_events: [{ name: "list_leads", status: "ok" }],
    }];
    expect(awaitedConfirmation(stale)).toBe(false);
  });

  it("covers scheduling, enrolling and runs, not just sending", () => {
    for (const tool of ["schedule_drafts", "enroll_lead_in_sequence", "run_full_agent"]) {
      expect(
        awaitedConfirmation([{ role: "assistant", content: "ok?", tool_events: [{ name: tool, status: "queued" }] }]),
        tool,
      ).toBe(true);
    }
  });
});

describe("the send gate accepts either route", () => {
  const SRC = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("reads the user's message as well as the model's flag", () => {
    expect(SRC).toMatch(/userConfirmedSend\(userMessage, history/);
    expect(SRC).toMatch(/args\.confirmed === true \|\| confirmedByUser/);
  });

  it("applies it to every gated tool, not only send_drafts", () => {
    const gates = SRC.match(/args\.confirmed !== true && !confirmedByUser/g) ?? [];
    expect(gates.length).toBeGreaterThanOrEqual(3);
  });

  it("logs when it fires, so a stuck loop is diagnosable", () => {
    expect(SRC).toMatch(/user confirmed the pending send in chat/);
  });
});
