import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  decideSend,
  previewText,
} from "../../supabase/functions/_shared/send-confirmation.ts";

/**
 * The approval queue was a second place where intent lived: a row holding a
 * frozen copy of an email, outliving the conversation that made it. Approvals
 * from old threads stayed pending for weeks, and every batch refused on a daily
 * limit left one unclearable row per recipient. It reached 103.
 */
describe("confirmation is a message, not a row", () => {
  it("autonomous mode sends without asking", () => {
    expect(decideSend("autonomous", false).send).toBe(true);
  });

  it("approval mode sends nothing on an unconfirmed call", () => {
    const d = decideSend("approval", false);
    expect(d.send).toBe(false);
    expect(d.reason).toMatch(/Nothing was sent/);
  });

  it("says explicitly that nothing is stored in the meantime", () => {
    // The whole point: no row survives the turn, so nothing can go stale or
    // pile up.
    expect(decideSend("approval", false).reason).toMatch(/Nothing is queued or stored/);
  });

  it("sends once the user's own message has agreed", () => {
    expect(decideSend("approval", true).send).toBe(true);
  });
});

describe("what the user is shown before deciding", () => {
  const people = [
    { name: "Martin Mitovski", email: "m@mscale.ai", company: "MScale AI" },
    { name: "Zoya Segelbacher", email: "z@uncapped.com", company: "Uncapped" },
  ];

  it("names who, how many and from where", () => {
    const text = previewText(people, ["brandon@x.com"]);
    expect(text).toContain("2 emails");
    expect(text).toContain("Martin Mitovski (MScale AI)");
    expect(text).toContain("from brandon@x.com");
  });

  it("never implies it already happened", () => {
    // The failure this replaces was a wall of ticks under "21 Sent".
    const text = previewText(people, ["a@x.com", "b@x.com"]);
    expect(text).toMatch(/Nothing has gone out yet/);
    expect(text).not.toMatch(/✅|\bsent\b/i);
  });

  it("summarises a long list rather than printing all of it", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      name: `Person ${i}`, email: `p${i}@x.com`, company: null,
    }));
    const text = previewText(many, ["a@x.com"]);
    expect(text).toContain("21 emails");
    expect(text).toContain("and 16 more");
  });

  it("says when, for a scheduled send", () => {
    const text = previewText(people, ["a@x.com"], "Fri, Sep 5 at 9:00 AM");
    expect(text).toContain("schedule");
    expect(text).toContain("Fri, Sep 5 at 9:00 AM");
  });

  it("handles an empty list without claiming anything", () => {
    expect(previewText([], ["a@x.com"])).toBe("There is nothing to send.");
  });
});

describe("the queue is gone everywhere", () => {
  const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
  const SCOPE = readFileSync("supabase/functions/_shared/agent-tool-scope.ts", "utf8");

  it("chat never writes a pending approval", () => {
    expect(CHAT).not.toMatch(/from\("agent_approvals"\)\s*\n?\s*\.insert/);
  });

  it("agent-run saves a draft instead of queuing", () => {
    // Its pending work has to live somewhere the user can find it, and that is
    // the same Drafts tab the send tools already read.
    expect(RUN).not.toContain("queueApproval");
    expect(RUN).toMatch(/from\("email_drafts"\)\.upsert/);
  });

  it("the approve/reject tools no longer exist", () => {
    for (const tool of ["resolve_approvals", "list_pending_approvals"]) {
      expect(SCOPE, tool).not.toContain(`"${tool}"`);
      expect(CHAT, tool).not.toContain(`case "${tool}"`);
    }
  });

  it("both send tools take confirmation per call", () => {
    // Per call, not per conversation: a flag that persisted would let the
    // second batch inherit the first batch's permission.
    expect(CHAT).toMatch(/confirmed: \{/);
    expect(CHAT).toMatch(/args\.confirmed === true/);
    expect(CHAT).toMatch(/args\.confirmed !== true/);
  });

  it("tells the model never to carry confirmation between batches", () => {
    expect(CHAT).toMatch(/Never carry it from one batch to the next/);
  });
});
