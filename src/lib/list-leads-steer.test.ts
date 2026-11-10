import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askedWork,
  listLeadGuidance,
  listLeadsKey,
  normalizeListArgs,
  pipelineContinuation,
} from "../../supabase/functions/_shared/list-leads-steer";

const ASK = "There are 63 leads labeled New in my saved leads. Please research them evaluate them then personalize emails based on your findings";

describe("a research-then-draft request does not loop on list_leads", () => {
  const asked = askedWork(ASK);

  it("hears research, evaluate, and personalize as three steps", () => {
    expect(asked).toEqual({ research: true, evaluate: true, draft: true });
  });

  it("treats New and new as the same lookup", () => {
    expect(normalizeListArgs({ pipeline_stage: "New" }).pipeline_stage).toBe("new");
    expect(listLeadsKey({ pipeline_stage: "New", limit: 100 })).toBe(
      listLeadsKey({ limit: 100, pipeline_stage: "new" }),
    );
  });

  it("lets the first lookup run and tells it what to call next", () => {
    const first = listLeadGuidance({
      priorTotal: 0,
      priorSame: 0,
      knownCount: 0,
      queuedCount: 0,
      returnedCount: 63,
      asked,
    });
    expect(first.stop).toBe(false);
    expect(first.note).toContain("research_leads");
    expect(first.note.indexOf("research_leads")).toBeLessThan(first.note.indexOf("score_leads"));
    expect(first.note.indexOf("score_leads")).toBeLessThan(first.note.indexOf("draft_outreach"));
  });

  it("stops a repeated filter and still allows a different set", () => {
    const same = listLeadGuidance({
      priorTotal: 1,
      priorSame: 1,
      knownCount: 63,
      queuedCount: 0,
      returnedCount: 63,
      asked,
    });
    expect(same.stop).toBe(true);
    expect(same.note).toContain("Do not call list_leads again");
    expect(same.note).toContain("63 lead ids");

    const tierB = listLeadGuidance({
      priorTotal: 1,
      priorSame: 0,
      knownCount: 20,
      queuedCount: 0,
      returnedCount: 15,
      asked,
    });
    expect(tierB.stop).toBe(false);

    const tierC = listLeadGuidance({
      priorTotal: 2,
      priorSame: 0,
      knownCount: 20,
      queuedCount: 0,
      returnedCount: 8,
      asked,
    });
    expect(tierC.stop).toBe(false);

    const runaway = listLeadGuidance({
      priorTotal: 6,
      priorSame: 0,
      knownCount: 63,
      queuedCount: 0,
      returnedCount: 0,
      asked,
    });
    expect(runaway.stop).toBe(true);
    expect(listLeadsKey({ tier: "A", limit: 25 })).toBe(listLeadsKey({ tier: "A" }));
  });

  it("says a draft queue blocks another draft and does not block research", () => {
    const queued = listLeadGuidance({
      priorTotal: 0,
      priorSame: 0,
      knownCount: 63,
      queuedCount: 63,
      returnedCount: 63,
      asked,
    });
    expect(queued.stop).toBe(false);
    expect(queued.note).toContain("already in the background draft queue");
    expect(queued.note).toContain("Research and scoring are not blocked");
    expect(queued.note).toContain("ask if they want them replaced");
    expect(queued.note).not.toContain("then draft_outreach once");
  });

  it("does not push a send, a sequence, or a question into draft_outreach", () => {
    for (const message of [
      "send my drafts",
      "what's the difference between research and scoring?",
      "draft a sequence",
      "audit this draft",
      "schedule the drafts",
    ]) {
      expect(pipelineContinuation({ message, events: [], listedCount: 0 }), message).toBe("");
      expect(pipelineContinuation({
        message,
        events: [{ name: "list_leads" }],
        listedCount: 0,
      }), message).toBe("");
    }
    expect(pipelineContinuation({
      message: "send my drafts",
      events: [{ name: "list_leads" }, { name: "send_drafts" }],
      listedCount: 12,
    })).toBe("");
    expect(pipelineContinuation({
      message: "draft a sequence for my best lead",
      events: [{ name: "draft_sequence" }],
      listedCount: 1,
    })).toBe("");
    expect(askedWork("send my drafts").draft).toBe(false);
    expect(askedWork("draft a sequence").draft).toBe(false);
  });

  it("nudges only after list_leads returned ids and nothing else acted", () => {
    const note = pipelineContinuation({
      message: ASK,
      events: [{ name: "list_leads" }],
      listedCount: 63,
    });
    expect(note).toContain("research_leads");
    expect(note).toContain("score_leads");
    expect(pipelineContinuation({
      message: ASK,
      events: [{ name: "list_leads" }, { name: "enrich_leads" }],
      listedCount: 63,
    })).toBe("");
    const src = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    const stall = src.indexOf("You said you were starting that work");
    const pipeline = src.indexOf("pipelineContinuation({");
    const use = src.indexOf("content: promisedWork");
    expect(pipeline).toBeGreaterThan(-1);
    expect(use).toBeGreaterThan(-1);
    expect(use).toBeLessThan(stall);
  });

  it("is applied before the query, so a repeat does not hit the database", () => {
    const src = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    const branch = src.slice(src.indexOf('case "list_leads":'), src.indexOf('case "get_lead":'));
    const stop = branch.indexOf("if (early.stop)");
    const query = branch.indexOf('.from("leads")');
    expect(stop).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(stop);
    expect(branch).toContain("normalizeListArgs(args)");
    expect(branch).toContain("listLeadGuidance(");
  });
});
