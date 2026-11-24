import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FOLLOW_UP_SOURCES_NOTE, TOOL_CATALOG, scopeNoteFor } from "../../supabase/functions/_shared/agent-tool-scope";

const AGENT_CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

/**
 * "Look at saved leads — I said leads that have no response label."
 *
 * The agent listed leads, read the sent history, found it empty because the
 * original campaign had gone out through another tool, and stopped to ask what
 * the first email had said. One hundred and thirteen leads carrying the
 * no_response label the user had set themselves, and not one draft, because an
 * empty sent folder was read as "there is nobody to follow up with".
 *
 * Two questions, two sources. Who to follow up with is the saved-lead label.
 * What the follow-up may say about the earlier email is the sent history. The
 * refusal to invent an unread first touch was right and stays; what changes is
 * that a missing one is reported as one missing fact rather than as a dead end.
 */
describe("a follow-up has two sources", () => {
  it("tells the agent the label selects, and the sent history only supplies wording", () => {
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/pipeline_stage/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/no_response/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/list_sent_emails/);
  });

  it("says an empty sent history is not an empty list of leads", () => {
    // The exact wrong inference that cost the run.
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/empty sent history does NOT mean/i);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/another tool/i);
  });

  it("still forbids inventing what the unseen first touch said", () => {
    /*
     * This is the half that must not be lost while fixing the other half. A
     * follow-up that claims a subject, an offer or a date from an email nobody
     * read is the same fabrication the research gates exist to stop.
     */
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/[Nn]ever invent what the first email said/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/no subject, no offer, no date/);
  });

  it("asks for the original alongside the drafts, not instead of them", () => {
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/alongside the drafts, not instead of them/);
  });
});

describe("the rule reaches the agents that can act on it", () => {
  const roles = ["full_cycle", "outreach", "replies"] as const;

  it("is in the scope note of every role that can draft", () => {
    for (const role of roles) {
      expect(scopeNoteFor({ role }), role).toContain("FOLLOW-UPS HAVE TWO SOURCES");
    }
  });

  it("is left out of a build that cannot draft, which has no use for it", () => {
    expect(scopeNoteFor({ role: "lead_gen" })).not.toContain("FOLLOW-UPS HAVE TWO SOURCES");
    const noDrafting = scopeNoteFor({ role: "custom", agent_name: "Scout", allowed_tools: ["list_leads", "get_lead"] });
    expect(noDrafting).not.toContain("FOLLOW-UPS HAVE TWO SOURCES");
  });

  it("reaches a custom build that was given the drafting tool", () => {
    const drafter = scopeNoteFor({
      role: "custom",
      agent_name: "Follow-Up Agent",
      allowed_tools: ["list_leads", "draft_outreach", "list_sent_emails"],
    });
    expect(drafter).toContain("FOLLOW-UPS HAVE TWO SOURCES");
  });

  it("keeps the operator's own instructions after it, so they still win", () => {
    const note = scopeNoteFor({ role: "outreach", role_instructions: "Only UK leads." });
    expect(note.indexOf("FOLLOW-UPS HAVE TWO SOURCES")).toBeLessThan(note.indexOf("Only UK leads."));
  });
});

describe("the tool the agent has to reach for says what it is for", () => {
  it("names the label vocabulary in the catalog, not just 'with filters'", () => {
    // A custom build is generated from these descriptions, so a tool whose
    // description does not mention labels is a tool the generator will not
    // pick for a follow-up agent.
    expect(TOOL_CATALOG.list_leads).toMatch(/no_response/);
    expect(TOOL_CATALOG.list_leads).toMatch(/pipeline_stage/);
  });

  it("names it on the filter itself, where the model reads the schema", () => {
    expect(AGENT_CHAT).toMatch(/This is how .{0,20}leads with no response/);
    expect(AGENT_CHAT).toMatch(/independent of the sent history/);
  });
});
