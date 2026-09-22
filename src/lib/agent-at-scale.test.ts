import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CODE = code(AGENT);

/**
 * A 79-lead follow-up run, on a phone, over 5G.
 *
 * The agent listed ten leads, said "I'll now research and draft follow-ups for
 * these 10 first, then move to the remaining 69", appended "Still more to do
 * here — continuing…", continued once, and then the chat showed "Agent error:
 * Failed to send a request to the Edge Function" with sixty-nine leads
 * untouched. Everything in this file is one of the reasons that turn ended the
 * way it did.
 */
describe("a long run ends by telling the truth about itself", () => {
  it("decides whether it will continue before it says it will", () => {
    // The promise used to be appended on `ranOutOfTime` alone, and the decision
    // was taken seventy lines later. On the final pass the two disagreed.
    const decided = CODE.indexOf("const willContinue =");
    const announced = CODE.indexOf("Still more to do here");
    expect(decided).toBeGreaterThan(-1);
    expect(announced).toBeGreaterThan(-1);
    expect(decided).toBeLessThan(announced);
  });

  it("promises to continue only when something will", () => {
    // Not `ranOutOfTime`, which is true on the pass that gives up as well.
    expect(CODE).toMatch(/else if \(willContinue\) \{\s*finalText \+= "\\n\\nStill more to do here/);
    expect(CODE).not.toMatch(/else if \(ranOutOfTime\) \{\s*finalText \+= "\\n\\nStill more to do here/);
  });

  it("says so when it stops short, instead of going quiet under a promise", () => {
    expect(CODE).toContain("const stoppedShort =");
    expect(CODE).toContain("stoppedShortNote");
    // The message names the limit it hit and what to do about it.
    expect(AGENT).toMatch(/\$\{MAX_RUN_PASSES\} passes/);
    expect(AGENT).toContain("Tell me to keep going and I'll pick up from exactly here.");
  });

  it("the cap the message quotes is the cap the code uses", () => {
    // Two literals would drift, and the one that drifts is the one nobody reads.
    expect(CODE).toContain("const MAX_RUN_PASSES = 6;");
    expect(CODE).toContain("runPass < MAX_RUN_PASSES");
    expect(CODE).not.toContain("runPass < 6");
  });

  it("records a continuation that fails, rather than just going idle", () => {
    const failure = CODE.slice(CODE.indexOf("agent-chat continuation error"));
    const insertAt = failure.indexOf('.from("agent_chat_messages")');
    const idleAt = failure.indexOf('run_status: "idle"');
    expect(insertAt).toBeGreaterThan(-1);
    expect(idleAt).toBeGreaterThan(-1);
    // The note is written before the thread is released, so a client watching
    // run_status never sees idle with nothing to explain it.
    expect(insertAt).toBeLessThan(idleAt);
  });
});

/**
 * Why one job took two messages.
 *
 * An unexpected error returned 500 and left the thread claimed. The claim is
 * only reconsidered after twenty minutes, so every message sent in between was
 * refused with "This conversation already has a run in progress" — and the way
 * that looks from the outside is an agent that needs to be told twice.
 */
describe("a dead turn does not keep the conversation locked", () => {
  it("gives the run claim back when the turn throws", () => {
    const catchBlock = CODE.slice(CODE.lastIndexOf("} catch (error) {"));
    expect(catchBlock).toContain("releaseRunClaim?.()");
    expect(catchBlock).toContain("The agent hit an unexpected error.");
  });

  it("arms the release only once the claim is actually held", () => {
    // Releasing a claim this turn never took would free another tab's run.
    expect(CODE).toContain("releaseRunClaim = async () => {");
    expect(CODE.indexOf("releaseRunClaim = async () => {")).toBeGreaterThan(
      CODE.indexOf("const runStartedAt ="),
    );
  });

  it("releases only its own run, not whatever is running now", () => {
    const arm = CODE.slice(CODE.indexOf("releaseRunClaim = async () => {"));
    const body = arm.slice(0, arm.indexOf("};"));
    expect(body).toContain('.eq("run_started_at", runStartedAt)');
  });
});

/**
 * "Follow up with everyone who hasn't responded" wrote to people contacted
 * that morning.
 *
 * `awaiting_reply` filtered on `replied_at is null` and nothing else. Someone
 * emailed an hour ago has not failed to reply; they have not had the chance.
 */
describe("no response means silence, not a null column", () => {
  it("requires the email to have gone unanswered for a while", () => {
    const tool = CODE.slice(CODE.indexOf('case "list_sent_emails"'));
    const branch = tool.slice(tool.indexOf("args.awaiting_reply === true"), tool.indexOf("const { data, error } = await q;"));
    expect(branch).toContain('.is("replied_at", null)');
    expect(branch).toContain('.lte("sent_at"');
    expect(branch).toContain("quiet_for_days");
  });

  it("defaults to a quiet period rather than to none", () => {
    expect(CODE).toMatch(/Number\(args\.quiet_for_days \?\? 3\)/);
  });

  it("bounds what the model can ask for", () => {
    // A zero or a negative would put the old behaviour back through the door.
    expect(CODE).toMatch(/Math\.min\(Math\.max\(Number\(args\.quiet_for_days \?\? 3\) \|\| 3, 1\), 60\)/);
  });

  it("tells the model what the list it got back actually means", () => {
    expect(AGENT).toContain("must not be followed up yet");
    expect(AGENT).toContain("they have not had the chance");
  });
});

/**
 * "Emails blocked — deleting and redrafting."
 *
 * A duplicate refusal means that person already received that exact subject.
 * The block is on the sent history, so deleting the draft clears nothing and
 * the redraft hits the same wall — after destroying work the user could still
 * have used. The system prompt has forbidden this in plain words for a while
 * and the model kept offering it anyway, which is what prose gets you.
 */
describe("a duplicate block cannot be answered by deleting the draft", () => {
  it("refuses the delete instead of asking the model not to", () => {
    const tool = CODE.slice(CODE.indexOf('case "delete_drafts"'));
    const guard = tool.slice(0, tool.indexOf("const draftIds"));
    expect(guard).toContain("duplicateRefusals.length > 0");
    expect(guard).toContain("redraft_will_not_help");
  });

  it("never stands between the user and their own delete", () => {
    const tool = CODE.slice(CODE.indexOf('case "delete_drafts"'));
    const guard = tool.slice(0, tool.indexOf("const draftIds"));
    expect(guard).toContain("!userAskedToDelete");
    expect(CODE).toMatch(/userAskedToDelete = \/[^/]*delete[^/]*\/i\.test\(userMessage\)/);
  });

  it("hands back the two things that do work", () => {
    const tool = AGENT.slice(AGENT.indexOf('case "delete_drafts"'));
    const guard = tool.slice(0, tool.indexOf("const draftIds"));
    expect(guard).toContain("new subject");
    expect(guard).toContain("allow_duplicate: true");
  });
});
