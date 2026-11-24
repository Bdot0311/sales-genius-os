import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AGENT_TOOL_GROUPS } from "../components/agent/AgentRoles";
import { CORE_TOOLS, FOLLOW_UP_SOURCES_NOTE, TOOL_CATALOG, scopeNoteFor } from "../../supabase/functions/_shared/agent-tool-scope";

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

/**
 * The capability was always there; the screen never said so.
 *
 * list_leads is in CORE_TOOLS, so every build could already read the label
 * that answers "leads with no response". The custom-build picker does not
 * show core tools, so a follow-up agent's capability list named sent email,
 * replies and drafting and said nothing about labels — and both the operator
 * and the model behaved as though sent email was the only source.
 */
describe("the label is a capability somebody can see", () => {
  const crm = AGENT_TOOL_GROUPS.find((g) => g.label === "CRM");

  it("is on the screen, in CRM, where it was asked for", () => {
    const row = crm?.tools.find((t) => t.name === "list_leads");
    expect(row, "CRM group has no lead-label row").toBeTruthy();
    expect(row?.label).toMatch(/label/i);
  });

  it("is shown as always on, because it is core and cannot be turned off", () => {
    expect(crm?.tools.find((t) => t.name === "list_leads")?.always).toBe(true);
  });

  it("never claims always-on for something a build might not have", () => {
    /*
     * The lock is a promise: ticked and disabled says "every agent can do
     * this". Marking a non-core tool that way would show a build a capability
     * it does not have.
     */
    for (const group of AGENT_TOOL_GROUPS) {
      for (const tool of group.tools) {
        if (tool.always) expect(CORE_TOOLS, tool.name).toContain(tool.name);
      }
    }
  });

  it("maps the operator's own words onto the label", () => {
    // The scope note in the screenshot reads "leads that have not replied to
    // initial outreach", and operator instructions are appended after this
    // rule, so that phrasing has to resolve to the label rather than re-anchor
    // the agent on reply history.
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/[Hh]as not replied/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/no reply to the initial outreach/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/label says so/);
  });
});

/**
 * The refusal came back, reasoned.
 *
 *   "I cannot draft follow-ups without knowing what was sent first. A
 *    follow-up referencing 'my previous email' when I don't know what it said
 *    will either contradict the original or read as generic filler — both
 *    hurt your reply rate and domain reputation."
 *
 * That argument is sound about the email it describes and wrong about the one
 * it should write. The rule said "keep going" and left the shape to judgement,
 * so the model reasoned its way back to a refusal by imagining the bad version.
 *
 * Naming the shape removes the escape: a follow-up to a lead whose first touch
 * cannot be read is a fresh research-grounded touch that never mentions a
 * previous email. It cannot contradict what it does not reference.
 */
describe("the rule names the shape, so it cannot be reasoned around", () => {
  it("says what to write, not only what not to claim", () => {
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/fresh, research-grounded touch/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/does not refer to a previous email at all/);
  });

  it("answers the contradict-or-filler argument directly", () => {
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/cannot contradict an email it never mentions/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/not filler if it is grounded in research/);
  });

  it("names refusing as the worse outcome, and leaves one legitimate refusal", () => {
    // The gates that refuse an ungrounded draft stay exactly as they are; this
    // only removes "I don't know what the first email said" as a reason.
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/leaves the lead with nothing/);
    expect(FOLLOW_UP_SOURCES_NOTE).toMatch(/no approved research for the lead/);
  });
});
