import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FOLLOW_UP_QUIET_DAYS,
  draftForLead,
  followUpTooSoon,
  tooSoonReason,
} from "../../supabase/functions/_shared/draft-one";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const DRAFT = readFileSync("supabase/functions/_shared/draft-one.ts", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const WORKER = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * Asked for 86, drafted 105.
 *
 * "Follow up with the no-response leads" had no filter that could express it.
 * The lead filters knew about pipeline stage, ICP score and missing emails,
 * and nothing about whether a person had gone quiet — so the closest thing was
 * without_draft, which is every lead never written to, contacted or not. The
 * drafting instruction then named that exact request as its own example and
 * told the model to use without_draft alone, and the end-of-turn sweep made
 * sure all 105 finished.
 */
describe("no-response is a filter the model can ask for", () => {
  const agent = code(AGENT);

  it("offers awaiting_reply on list_leads", () => {
    expect(agent).toContain("awaiting_reply: {");
    expect(agent).toContain("quiet_for_days: {");
  });

  it("names the phrases a user actually says", () => {
    const schema = AGENT.split("awaiting_reply: {")[1].split("},")[0];
    expect(schema).toContain("no-response leads");
    expect(schema).toContain("never replied");
  });

  it("applies it to every query the call makes, not just the page", () => {
    // The page, the outstanding count and the set the turn commits to
    // finishing all run through applyFilters. A filter applied to one of them
    // would report one number and draft a different set.
    const filters = agent.split("const applyFilters = (base: any) => {")[1].split("};")[0];
    expect(filters).toContain('b.in("id", awaitingIds.length > 0 ? awaitingIds : [NO_MATCH_ID])');
  });

  it("narrows to nothing rather than to everything when nobody is waiting", () => {
    // `.in("id", [])` is rejected, and dropping the filter would widen the
    // query to the whole account — which is the bug this filter exists to fix.
    expect(agent).toContain('const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000"');
  });

  it("stops telling the model to use without_draft for a no-response request", () => {
    expect(agent).toContain("SCOPE THAT CALL TO WHAT THEY ASKED FOR");
    expect(agent).toContain("all mean awaiting_reply: true");
    // The old bullet used the no-response request as its worked example.
    expect(agent).not.toMatch(/DRAFTING FOR A GROUP \("draft all my no-response leads"/);
  });
});

describe("silence is measured, not assumed", () => {
  const fn = code(DRAFT).split("export async function leadsAwaitingReply")[1].split("\nexport ")[0];

  it("requires a quiet period rather than a null column", () => {
    // Without it, mail sent this morning counts as unanswered and the
    // follow-up goes out the same day.
    expect(fn).toContain("quietForDays");
    expect(fn).toContain("86_400_000");
    expect(fn).toContain("Math.min(Math.max(quietForDays, 1), 60)");
  });

  it("drops a lead that replied anywhere in the thread", () => {
    // Replying to the first email and ignoring the second is a conversation,
    // not an unanswered lead.
    expect(fn).toContain("answered.add(id)");
    expect(fn).toContain("for (const id of answered) quietLeads.delete(id)");
  });

  it("counts only mail that actually left", () => {
    expect(fn).toContain("DELIVERED_STATUSES");
    expect(fn).toContain('.not("sent_at", "is", null)');
  });

  it("treats scheduled and failed as not contact", () => {
    const statuses = code(DRAFT).split("const DELIVERED_STATUSES = ")[1].split(";")[0];
    expect(statuses).not.toContain("scheduled");
    expect(statuses).not.toContain("failed");
  });
});

/**
 * Three states, because three different emails are owed. A single goal for the
 * whole batch gave every lead the same one.
 */
describe("the email matches where the person actually is", () => {
  const draft = code(DRAFT);

  it("knows the three states apart", () => {
    expect(draft).toContain('"never_contacted" | "awaiting_reply" | "replied"');
  });

  it("never writes a follow-up to someone who has heard nothing", () => {
    const fn = draft.split("export function goalForLead")[1].split("\nexport ")[0];
    expect(fn).toContain('if (state === "never_contacted")');
    expect(fn).toContain('FOLLOW_UP_GOALS.has(goal) ? "introduction" : goal');
  });

  it("answers silence with a reframe rather than a pitch", () => {
    // `follow-up` is written to sell: "deliver the payoff it held back, back
    // it with proof". Silence is not interest.
    const fn = draft.split("export function goalForLead")[1].split("\nexport ")[0];
    expect(fn).toContain('state === "awaiting_reply" && goal === "follow-up"');
    expect(fn).toContain('return "4ps_followup"');
  });

  it("leaves the caller's choice alone once someone has replied", () => {
    const fn = draft.split("export function goalForLead")[1].split("\nexport ")[0];
    // No branch rewrites the goal for a replied lead.
    expect(fn).not.toMatch(/state === "replied"[\s\S]*?return "/);
    expect(fn.trimEnd().endsWith("return goal;\n}")).toBe(true);
  });

  it("counts the goals that presuppose a prior email", () => {
    const set = draft.split("export const FOLLOW_UP_GOALS = new Set([")[1].split("]);")[0];
    for (const goal of ["follow-up", "4ps_followup", "4ps_elusive_followup"]) {
      expect(set).toContain(goal);
    }
  });

  it("is the same decision in the chat turn and in the queue", () => {
    // The queue scope named two paths for the same work as its main design
    // risk. The job stores one goal for every item, so resolving it only in
    // the chat turn would leave the background batch writing the old email.
    expect(code(AGENT)).toContain("goalForLead(goal, thread?.state ?? \"never_contacted\")");
    expect(code(WORKER)).toContain("goalForLead(");
    expect(code(WORKER)).toContain("thread?.state ?? \"never_contacted\"");
  });

  it("resolves per item at draft time, so a queued job is corrected when it runs", () => {
    const worker = code(WORKER);
    expect(worker).toContain("await leadThreads(admin, job.user_id, [String(item.lead_id)])");
    expect(worker).toContain("goal: itemGoal");
  });
});

/**
 * A reframe of an email it could not read.
 *
 * `4ps_followup` is instructed "REFRAME — do not re-pitch. New frame, new
 * angle" and was never shown the email it was reframing; a follow-up to
 * someone who replied could not answer them because it never saw the reply.
 */
describe("the generator can see the conversation", () => {
  const gen = code(GEN);

  it("accepts a thread", () => {
    expect(gen).toContain("requestData.thread");
    expect(gen).toContain("threadState === 'awaiting_reply' || threadState === 'replied'");
  });

  it("is not handed one for a first touch", () => {
    // A generator told it is continuing a conversation writes as if one
    // happened, which is the original bug in a new place.
    expect(code(DRAFT)).toContain('settings.thread.state !== "never_contacted"');
  });

  it("shows a reframe the email it is reframing", () => {
    expect(GEN).toContain("THE EMAIL THEY DID NOT ANSWER");
    expect(GEN).toContain("Make the same point again in different words");
    expect(GEN).toContain("Silence is not interest");
  });

  it("answers a reply with what the reply said", () => {
    expect(GEN).toContain("THEY REPLIED");
    expect(GEN).toContain("Their words set the subject of");
  });

  it("fences the reply, because a prospect wrote it", () => {
    // It arrives in a prompt that produces mail sent under the user's name.
    expect(gen).toContain("fence('prospect reply', thread.replyContent)");
    expect(gen).toContain("UNTRUSTED_CONTENT_RULE");
  });

  it("bounds what a long thread can spend", () => {
    expect(gen).toContain("sanitizeString(String(rawThread?.lastBody ?? ''), 2000)");
    expect(gen).toContain("sanitizeString(String(rawThread?.replyContent ?? ''), 2000)");
  });
});

/**
 * "9 drafts completed, 10 queued, 95 remaining" over a header reading 105.
 *
 * Not a hallucination: the sweep runs after the model has written its reply,
 * so "10 queued" was true when written and stale by the time it was read. Both
 * numbers were in the same message with nothing to say which was current.
 */
describe("the counts in one message agree with each other", () => {
  const agent = code(AGENT);

  it("says how many the sweep added after the reply was written", () => {
    expect(agent).toContain("sweptQueued = queued");
    expect(agent).toContain("const sweepNote = sweptQueued > 0");
    expect(agent).toContain("added at the end to cover leads the steps above left out");
  });

  it("says plainly that nothing is left when nothing is", () => {
    expect(agent).toContain("nothing from that set is still waiting");
    expect(agent).toContain("Any smaller count below this line was written before they were queued");
  });

  it("still names the remainder when the sweep hit its limit", () => {
    expect(agent).toContain("sweptBeyondLimit = beyondLimit");
    expect(agent).toContain("are still without a draft");
  });

  it("keeps the folder total from the database above the reply", () => {
    expect(agent).toContain('.from("email_drafts")');
    expect(agent).toContain("Your drafts folder holds ${draftsNow ?? 0}");
  });
});

/**
 * Two follow-ups to the same 103 people, thirteen hours apart.
 *
 * Job eec23c11 at 07:43 drafted 89 of 103. Job 1d954287 at 21:14 drafted 97 of
 * 101. Across both: 204 items, 103 distinct leads, neither carrying feedback,
 * and zero items skipped as already-drafted. The skip was right to stay quiet —
 * by the evening those leads genuinely had no draft, because the morning's had
 * left the folder when it sent.
 *
 * Nothing in the drafting path disagreed. leadThreads calls a thread
 * awaiting_reply the moment an email is sent with no reply. goalForLead turns
 * awaiting_reply plus follow-up into 4ps_followup with no test on when that
 * email went. The end-of-turn sweep picks leads by "has no draft", which has no
 * time in it at all. The three-day fence existed only in leadsAwaitingReply —
 * the list_leads filter, which is not how the sweep gets its leads.
 */
describe("a follow-up waits for the silence to mean something", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const thread = (h: number) => ({
    state: "awaiting_reply" as const,
    lastSentAt: hoursAgo(h),
    lastSubject: "the first one",
  });

  it("uses the sender's own cadence, not a number invented here", () => {
    // OUTBOUND_KB cadenceDays is [0, 3, 7, 12, 18]; the first gap is three days.
    expect(FOLLOW_UP_QUIET_DAYS).toBe(3);
    expect(code(DRAFT)).toContain("quietForDays = FOLLOW_UP_QUIET_DAYS");
  });

  it("stops the second email inside the window", () => {
    expect(followUpTooSoon("4ps_followup", thread(13))).not.toBeNull();
    expect(followUpTooSoon("4ps_followup", thread(1))).not.toBeNull();
    expect(followUpTooSoon("4ps_followup", thread(71))).not.toBeNull();
  });

  it("lets it through once the window has passed", () => {
    expect(followUpTooSoon("4ps_followup", thread(72))).toBeNull();
    expect(followUpTooSoon("4ps_followup", thread(24 * 9))).toBeNull();
  });

  it("has nothing to say about a first touch", () => {
    // An introduction cannot be too soon after an email that never went.
    expect(followUpTooSoon("introduction", thread(1))).toBeNull();
    expect(followUpTooSoon("4ps_followup", { state: "never_contacted" } as never)).toBeNull();
    expect(followUpTooSoon("4ps_followup", null)).toBeNull();
  });

  it("says when they are due, in words a person reads", () => {
    const t = followUpTooSoon("4ps_followup", thread(13))!;
    // 72 - 13 = 59 hours left, rounded up. Up rather than down on purpose: a
    // fence that says "due in 2 days" when it means two and a half invites the
    // second email a day early, which is the thing being prevented.
    expect(tooSoonReason(t)).toBe("contacted 13 hours ago, a follow-up is due in 3 days");
    expect(tooSoonReason(followUpTooSoon("4ps_followup", thread(70))!)).toContain("due in 1 day");
    expect(tooSoonReason(followUpTooSoon("4ps_followup", thread(50))!)).toContain("2 days ago");
  });

  it("does not spend a generation finding out", async () => {
    // The whole point: the refusal is before generate-email, not after it.
    const calls: string[] = [];
    const result = await draftForLead(
      {
        admin: {} as never,
        userId: "u1",
        invokeFn: async (name: string) => {
          calls.push(name);
          return { email: "Subject: x\n\nbody" };
        },
      },
      { id: "l1", company_name: "Acme" } as never,
      { goal: "4ps_followup", thread: thread(13), tone: "professional" } as never,
    );
    expect(calls).toEqual([]);
    expect(result.draft_id).toBeNull();
    expect(result.skipped).toContain("a follow-up is due in");
    // Not an error: the lead is fine and so is the batch.
    expect(result.error).toBeUndefined();
  });
});

describe("too soon is reported as settled, not as a failure", () => {
  it("the worker settles it in the same bucket as already-drafted", () => {
    const w = code(WORKER);
    expect(w).toContain("if (result.skipped) {");
    expect(w).toMatch(/status: "skipped",\s*\n\s*error: result\.skipped,/);
    expect(w).toContain("skipped++;");
  });

  it("the turn does not count it against the drafts it wrote", () => {
    const a = code(AGENT);
    expect(a).toContain("const tooSoon = drafts.filter((d: any) => d.skipped);");
    expect(a).toContain("draftTally.failed += drafts.length - okCount - tooSoon.length;");
    // A reason that reads as a fault is how "89 failed" would have been read.
    expect(a).toContain("!d.email && !d.skipped");
  });

  it("tells the model it is the product working, and not to retry for the count", () => {
    expect(AGENT).toContain("This is the product working, not a");
    expect(AGENT).toContain("do NOT queue them again this");
  });
});
