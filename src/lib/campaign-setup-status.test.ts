import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { countActionable, describeRequest, hasIdentity } from "./campaign-setup-status";

const PAGE = readFileSync("src/pages/admin/CampaignSetup.tsx", "utf8");

/**
 * Thirty-five setup requests, every one of them reading "Anonymous visitor".
 *
 * Two different things share `campaign_setup_requests`. Pressing a "book a
 * campaign setup" button logs a row at once, with `status: "new"` and whatever
 * identity the page knew — nothing, for a logged-out visitor on a landing
 * page. Only if they go on to fill the form does `submit-campaign-setup` come
 * back and set the name, the email, the answers and `status: "submitted"`.
 *
 * So most rows are people who clicked and left. With no status column they
 * rendered identically to real enquiries, and "Anonymous visitor" reads like a
 * lead whose details were lost rather than somebody who never gave any.
 */

const click = { status: "new", contact_email: null, contact_name: null, user_id: null };
const submitted = { status: "submitted", contact_email: "a@b.com", contact_name: "Ada", user_id: null };

describe("a click is not an enquiry", () => {
  it("a logged-out click is not actionable", () => {
    const s = describeRequest(click);
    expect(s.actionable).toBe(false);
    expect(s.label).toBe("Clicked only");
    expect(s.detail).toMatch(/never submitted/i);
  });

  it("a completed form is", () => {
    const s = describeRequest(submitted);
    expect(s.actionable).toBe(true);
    expect(s.label).toBe("Submitted");
  });

  it("a click from someone we can name is actionable, and says it did not submit", () => {
    /*
     * The case worth separating rather than folding into either. They opened
     * the form and did not send it — so there are no answers — but we have an
     * address, so it can still be followed up.
     */
    const s = describeRequest({ ...click, user_id: "u1" });
    expect(s.actionable).toBe(true);
    expect(s.label).toBe("Opened, not sent");
    expect(s.label).not.toBe("Submitted");
  });

  it("identity counts an email, a name or a signed-in user, and ignores blanks", () => {
    expect(hasIdentity(click)).toBe(false);
    expect(hasIdentity({ ...click, contact_email: "   " }), "whitespace is not an address").toBe(false);
    expect(hasIdentity({ ...click, contact_name: "Ada" })).toBe(true);
    expect(hasIdentity({ ...click, user_id: "u1" })).toBe(true);
  });

  it("a status nobody has seen shows itself rather than being folded in", () => {
    // A later flow adding a status should be visible, not silently bucketed.
    const s = describeRequest({ ...click, status: "awaiting_call" });
    expect(s.label).toBe("awaiting call");
    expect(s.label).not.toBe("Clicked only");
  });

  it("a missing status does not crash or claim to be submitted", () => {
    const s = describeRequest({ ...click, status: null });
    expect(s.label).toBe("Unknown");
    expect(s.actionable).toBe(false);
  });

  it("counts how many are worth somebody's time", () => {
    // The number that makes the table readable: 35 rows, 2 worth opening.
    const rows = [click, click, submitted, { ...click, user_id: "u1" }];
    expect(countActionable(rows)).toEqual({ actionable: 2, total: 4 });
  });
});

describe("the admin table shows it", () => {
  it("renders a status for every row", () => {
    expect(PAGE).toContain("describeRequest(r)");
    expect(PAGE).toContain("<TableHead>Status</TableHead>");
  });

  it("leads with how many can be replied to", () => {
    expect(PAGE).toContain("countActionable(requests)");
    expect(PAGE).toMatch(/can be replied to/);
  });

  it("the details row still spans every column", () => {
    /*
     * Adding the Status column silently narrowed the expanded-details row,
     * which had been pinned at the old count. Counted from the headers rather
     * than hardcoded, so the next column added fails here instead of looking
     * subtly wrong.
     */
    const headerBlock = PAGE.slice(PAGE.indexOf("<TableHead>Customer</TableHead>", PAGE.indexOf("Setup requests")));
    const columns = [...headerBlock.slice(0, headerBlock.indexOf("</TableRow>")).matchAll(/<TableHead/g)].length;
    expect(columns).toBeGreaterThanOrEqual(8);
    expect(PAGE).toContain(`colSpan={${columns}}`);
  });
});
