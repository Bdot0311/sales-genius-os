import { describe, expect, it } from "vitest";
import { draftOutboxItem, draftQueueSummary, draftSendCounts } from "../../supabase/functions/_shared/saved-draft-outbox";

describe("saved-draft delivery", () => {
  it("does not report the 61 confirmation previews as 61 failed sends", () => {
    expect(draftSendCounts(Array.from({ length: 61 }, () => ({ sent: false, awaiting_confirmation: true })))).toEqual({ sentCount: 0, queuedCount: 61, failedCount: 0 });
  });
  it("accounts for all 61 requested emails when 11 queued and 50 remain held", () => {
    const ids = Array.from({ length: 61 }, (_, i) => String(i));
    const summary = draftQueueSummary(ids, ids.slice(0, 11).map(draft_id => ({ draft_id, queued: true })));
    expect(summary.requested).toBe(61);
    expect(summary.queued).toBe(11);
    expect(summary.failed).toBe(50);
    expect(summary.results).toHaveLength(61);
  });
  it("queues every one of 61 saved drafts without clipping to the first 11", () => {
    const ids = Array.from({ length: 61 }, (_, i) => String(i));
    expect(draftQueueSummary(ids, ids.map(draft_id => ({ draft_id, queued: true }))).queued).toBe(61);
  });
  it("retains each selected draft's individual copy and selected mailbox/time", () => {
    const first = draftOutboxItem({ id: "a", subject: "Alpha", body: "Alpha's researched detail." }, "mailbox-a", "2026-11-24T09:00:00Z", "");
    const second = draftOutboxItem({ id: "b", subject: "Beta", body: "Beta's different detail." }, "mailbox-b", "2026-11-24T10:00:00Z", "");
    expect(first.body_text).toBe("Alpha's researched detail.");
    expect(second.body_text).toBe("Beta's different detail.");
    expect(first.sending_account_id).toBe("mailbox-a");
    expect(second.scheduled_at).toBe("2026-11-24T10:00:00Z");
  });
  it("keeps images and links in a signature while saving a text alternative", () => {
    const item = draftOutboxItem({ id: "a", subject: "Alpha", body: "Hello\nA & B" }, "a", "2026-11-24T09:00:00Z", '<a href="https://example.com">Company</a><img src="https://example.com/logo.png">');
    expect(item.body_html).toContain('href="https://example.com"');
    expect(item.body_html).toContain('src="https://example.com/logo.png"');
    expect(item.body_html).toContain("A &amp; B");
    expect(item.body_text).not.toContain("<img");
  });
  it("does not count an error or a missing result as queued", () => {
    const result = draftQueueSummary(["a", "b", "c"], [{ draft_id: "a", queued: true }, { draft_id: "b", error: "Missing recipient" }]);
    expect(result.queued).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.results[1].error).toBe("Missing recipient");
  });
});