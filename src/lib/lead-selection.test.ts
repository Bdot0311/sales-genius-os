import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { leadIsReachable } from "@/components/outreach/LeadMultiSelect";

const OUTREACH = readFileSync("src/pages/Outreach.tsx", "utf8");
const PICKER = readFileSync("src/components/outreach/LeadMultiSelect.tsx", "utf8");
const BULK = readFileSync("src/components/outreach/BulkSendDialog.tsx", "utf8");
const SEQ = readFileSync("src/components/sequences/AiSequenceBuilder.tsx", "utf8");
const QUEUE = readFileSync("supabase/functions/queue-draft-batch/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * "Creating emails and sequences one at a time per lead is time consuming."
 *
 * Outreach Studio had a single-value Select, and beside it a Bulk Send dialog
 * with its own lead list, its own generator and its own send loop — two ways to
 * write the same email, differing only in how many people got it.
 */
describe("the lead field holds a set", () => {
  const outreach = code(OUTREACH);

  it("replaces the single Select with the picker", () => {
    expect(outreach).toContain("<LeadMultiSelect leads={leads} value={selectedLeadIds} onChange={chooseLeads} />");
    expect(outreach).not.toContain("<Select value={selectedLead} onValueChange={setSelectedLead}>");
  });

  it("keeps the previewed lead inside the selection", () => {
    // selectedLead still means "the one on screen" at all fifty-odd places
    // that read it, which is what makes this a small change rather than a
    // rewrite. It just has to stay a member of the set.
    const choose = outreach.split("const chooseLeads = (ids: string[]) => {")[1].split("};")[0];
    expect(choose).toContain('if (ids.length === 0) setSelectedLead("")');
    expect(choose).toContain("else if (!ids.includes(selectedLead)) setSelectedLead(ids[0])");
  });

  it("steps through the drafts rather than showing one and hiding the rest", () => {
    expect(outreach).toContain("selectedLeadIds.length > 1 && (");
    expect(outreach).toContain("Previewing {Math.max(1, selectedLeadIds.indexOf(selectedLead) + 1)} of {selectedLeadIds.length}");
    expect(outreach).toContain('aria-label="Previous lead"');
    expect(outreach).toContain('aria-label="Next lead"');
  });

  it("keeps the set in step wherever a single lead is chosen elsewhere", () => {
    // Opening a draft, or jumping to the lead just sent to, used to set only
    // the preview; the set would then still hold whoever was there before.
    expect(outreach).toContain('focusLead(draft.lead_id || "")');
    expect(outreach).toContain("focusLead(lastSentEmailInfo.leadId)");
    expect(outreach).toContain("focusLead(lead.id)");
  });
});

describe("one lead writes here, many go to the queue", () => {
  const outreach = code(OUTREACH);

  it("dispatches on the size of the selection", () => {
    expect(outreach).toContain("selectedLeadIds.length > 1 ? queueDraftsForSelection() : generateEmail()");
  });

  it("hands the batch to the queue the agent already drafts through", () => {
    // The dialog this replaces generated in the browser, so closing the tab
    // stopped the batch partway with no record of where it got to.
    expect(outreach).toContain('supabase.functions.invoke("queue-draft-batch"');
    expect(outreach).toContain("lead_ids: selectedLeadIds");
  });

  it("says the work survives the tab", () => {
    expect(OUTREACH).toContain("so you can close this tab");
  });
});

describe("bulk sending is reached through the composer, not beside it", () => {
  it("has no entry point of its own on the page", () => {
    expect(code(OUTREACH)).toContain("open={bulkSendOpen}");
    expect(code(OUTREACH)).toContain("selectedLeadIds.length > 1 ? setBulkSendOpen(true) : sendEmail()");
  });

  it("sends to the people the composer is writing for and nobody else", () => {
    // It took the whole lead list before, so the selection above it meant
    // nothing once the dialog was open.
    expect(code(OUTREACH)).toContain("leads={leads.filter((l) => selectedLeadIds.includes(l.id))}");
  });

  it("hides its own trigger when driven", () => {
    expect(code(BULK)).toContain("{!isControlled && (");
    expect(code(BULK)).toContain("const isControlled = controlledOpen !== undefined");
  });

  it("still works uncontrolled, so nothing else that mounts it breaks", () => {
    const bulk = code(BULK);
    expect(bulk).toContain("const open = isControlled ? controlledOpen : uncontrolledOpen");
    expect(bulk).toContain("if (!isControlled) setUncontrolledOpen(next)");
  });

  it("keeps its own send machinery rather than growing a second one", () => {
    // Its throttle and per-lead accounting are correct; reimplementing them
    // in the composer would be the second send path this merge exists to undo.
    expect(code(BULK)).toContain("delayBetweenSends");
  });
});

describe("the picker marks who cannot be written to", () => {
  it("counts an address and a verdict, not just an address", () => {
    expect(leadIsReachable({ id: "1", contact_email: "a@b.com" })).toBe(true);
    expect(leadIsReachable({ id: "2", contact_email: null })).toBe(false);
    expect(leadIsReachable({ id: "3", contact_email: "a@b.com", email_verification_status: "invalid" })).toBe(false);
  });

  it("treats an unproven address as reachable", () => {
    // send-email refuses only a proven-dead one, and a catch-all or unknown
    // is unproven rather than bad.
    for (const status of ["catch_all", "unknown", "role", null, undefined]) {
      expect(leadIsReachable({ id: "x", contact_email: "a@b.com", email_verification_status: status })).toBe(true);
    }
  });

  it("leaves the unreachable selectable but out of bulk selection", () => {
    // Drafting still works for them, and a draft is useful before the address
    // is found. What they stay out of is "select all".
    const picker = code(PICKER);
    expect(picker).toContain("const reachableMatching = matching.filter(leadIsReachable)");
    expect(picker).toContain("for (const l of reachableMatching) next.add(l.id)");
  });

  it("names a person at one and counts at many", () => {
    const label = code(PICKER).split("const label = (() => {")[1].split("})();")[0];
    expect(label).toContain("if (value.length === 1)");
    expect(label).toContain("${value.length} leads");
  });
});

describe("the sequence builder takes the same set", () => {
  it("uses the same picker rather than a second one", () => {
    expect(code(SEQ)).toContain("<LeadMultiSelect");
    expect(code(SEQ)).not.toContain('<SelectValue placeholder="Pick a lead" />');
  });

  it("writes one sequence, not one per prospect", () => {
    // The steps are the campaign and the leads are who walks through it.
    expect(SEQ).toContain("one sequence covers all {leadIds.length}");
  });
});

describe("the queue door is narrow", () => {
  const queue = code(QUEUE);

  it("is for a signed-in user, not an internal caller", () => {
    expect(queue).toContain("if (caller.internal || !caller.userId)");
  });

  it("confirms the leads are the caller's against the table", () => {
    expect(queue).toContain('.from("leads")');
    expect(queue).toContain('.eq("user_id", userId)');
  });

  it("does not re-queue a lead already waiting in a live job", () => {
    /*
     * A cancelled job leaves its items pending forever; counting those as
     * queued would block those leads from ever being drafted again.
     *
     * Matched on the set it builds rather than on the query that fills it.
     * check-schema-refs attributes a quoted status filter to the nearest
     * quoted table name, so asserting the query here failed on a column this
     * file never touches -- and the first version of this comment reproduced
     * the fault by quoting the filter while explaining it.
     */
    expect(queue).toContain("live.add(String(j.id))");
    expect(queue).toContain("live.has(String(r.job_id");
    expect(queue).toContain("alreadyQueued.has(id)");
  });

  it("bounds one request", () => {
    expect(queue).toContain("const MAX_LEADS = 500");
  });

  it("does not leave a job with no items", () => {
    // A job at 0 of N forever reads as stuck.
    expect(queue).toContain('await admin.from("agent_jobs").delete().eq("id", jobId)');
  });

  it("defaults to approval, never to sending by itself", () => {
    expect(queue).toContain('body.autonomy === "autonomous" ? "autonomous" : "approval"');
  });
});
