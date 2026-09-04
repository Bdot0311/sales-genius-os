import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  SCOPE_CAMPAIGN_ASSETS,
  SCOPE_LEADS,
  expiresInWords,
  grantCovers,
  isGrantActive,
  sectionsFor,
} from "./support-access";

const NOW = new Date("2026-09-04T12:00:00Z");
const live = {
  scopes: [SCOPE_CAMPAIGN_ASSETS, SCOPE_LEADS],
  granted_at: "2026-09-04T00:00:00Z",
  expires_at: "2026-09-18T00:00:00Z",
  revoked_at: null,
  completed_at: null,
};

/**
 * A customer granted setup access. The admin panel said "You can work in these
 * accounts now" and offered one button: End access.
 *
 * The backend was finished — has_active_support_grant() plus FOR ALL policies
 * on leads, email_sequences, sequence_steps, message_blocks, email_drafts,
 * icp_profiles and agent_configs. What was missing was any query that asked
 * for another user's rows: every list hook in the app filters on the
 * signed-in user's own id, so permission that had been granted had no surface
 * to act on.
 */

describe("a grant is usable only when the database would agree", () => {
  it("accepts a live grant", () => {
    expect(isGrantActive(live, NOW)).toBe(true);
  });

  it("refuses one the customer revoked", () => {
    expect(isGrantActive({ ...live, revoked_at: "2026-09-04T11:00:00Z" }, NOW)).toBe(false);
  });

  it("refuses one already marked complete", () => {
    expect(isGrantActive({ ...live, completed_at: "2026-09-04T11:00:00Z" }, NOW)).toBe(false);
  });

  it("refuses one past its expiry", () => {
    expect(isGrantActive({ ...live, expires_at: "2026-09-03T00:00:00Z" }, NOW)).toBe(false);
  });

  it("refuses one with no readable expiry rather than assuming it is fine", () => {
    expect(isGrantActive({ ...live, expires_at: null }, NOW)).toBe(false);
    expect(isGrantActive({ ...live, expires_at: "whenever" }, NOW)).toBe(false);
  });

  it("mirrors the SQL predicate it stands in for", () => {
    // A UI that offers to open an account the database will refuse is worse
    // than one that never offered.
    const SQL = readFileSync(
      "supabase/migrations/20260729195800_5f01d58b-6856-46c5-987c-72c3dbeb9bb5.sql",
      "utf8",
    );
    const fn = SQL.slice(SQL.indexOf("has_active_support_grant"), SQL.indexOf("Audit trail"));
    expect(fn).toContain("g.revoked_at IS NULL");
    expect(fn).toContain("g.completed_at IS NULL");
    expect(fn).toContain("g.expires_at > now()");
    expect(fn).toContain("_scope = ANY(g.scopes)");
  });
});

describe("scopes are checked, not assumed", () => {
  it("covers what the grant lists", () => {
    expect(grantCovers(live, SCOPE_CAMPAIGN_ASSETS, NOW)).toBe(true);
    expect(grantCovers(live, SCOPE_LEADS, NOW)).toBe(true);
  });

  it("does not cover a scope the grant omits", () => {
    const assetsOnly = { ...live, scopes: [SCOPE_CAMPAIGN_ASSETS] };
    expect(grantCovers(assetsOnly, SCOPE_LEADS, NOW)).toBe(false);
  });

  it("covers nothing once the grant is dead, whatever it listed", () => {
    expect(grantCovers({ ...live, revoked_at: "2026-09-04T11:00:00Z" }, SCOPE_LEADS, NOW)).toBe(false);
  });
});

describe("the panel says which answer it is showing", () => {
  it("opens both sections for a full grant", () => {
    const s = sectionsFor(live, NOW);
    expect(s).toEqual({ campaignAssets: true, leads: true, blockedReason: null });
  });

  it("distinguishes 'not covered' from 'they have none'", () => {
    // A section that silently comes back empty because the scope was missing
    // looks identical to a customer with no data, and the team would go on to
    // build against nothing.
    const s = sectionsFor({ ...live, scopes: [SCOPE_CAMPAIGN_ASSETS] }, NOW);
    expect(s.campaignAssets).toBe(true);
    expect(s.leads).toBe(false);
    expect(s.blockedReason).toBeNull();
  });

  it("explains a revoked grant in the customer's terms", () => {
    expect(sectionsFor({ ...live, revoked_at: "2026-09-04T11:00:00Z" }, NOW).blockedReason)
      .toMatch(/revoked/i);
  });

  it("explains an expired one and says what to ask for", () => {
    const reason = sectionsFor({ ...live, expires_at: "2026-09-01T00:00:00Z" }, NOW).blockedReason;
    expect(reason).toMatch(/expired/i);
    expect(reason).toMatch(/grant it again/i);
  });

  it("refuses a live grant carrying nothing actionable", () => {
    expect(sectionsFor({ ...live, scopes: [] }, NOW).blockedReason).toMatch(/no scopes/i);
  });
});

describe("how long is left, in words", () => {
  it("counts days", () => {
    expect(expiresInWords("2026-09-18T00:00:00Z", NOW)).toBe("14 days");
  });

  it("counts hours inside a day", () => {
    expect(expiresInWords("2026-09-04T17:00:00Z", NOW)).toBe("5 hours");
  });

  it("says under an hour rather than rounding to zero", () => {
    expect(expiresInWords("2026-09-04T12:30:00Z", NOW)).toBe("under an hour");
  });

  it("says expired rather than a negative number", () => {
    expect(expiresInWords("2026-09-03T00:00:00Z", NOW)).toBe("expired");
  });

  it("copes with no date", () => {
    expect(expiresInWords(null, NOW)).toBe("unknown");
  });
});

describe("the granted access now has a surface", () => {
  const PAGE = readFileSync("src/pages/admin/CampaignSetup.tsx", "utf8");
  const PANEL = readFileSync("src/components/admin/SupportAccessWorkspace.tsx", "utf8");

  it("the active-access row can open the account, not only end it", () => {
    expect(PAGE).toContain("Open account");
    expect(PAGE).toContain("SupportAccessWorkspace");
  });

  it("no longer claims something the UI could not do", () => {
    // The card said "You can work in these accounts now" while offering a
    // single button that ended the access.
    expect(PAGE).not.toContain("You can work in these accounts now");
  });

  it("queries the customer's rows, which is the step nobody had written", () => {
    expect(PANEL).toContain('.eq("user_id", grant.user_id)');
  });

  it("links sequences into the builder that already works under RLS", () => {
    // SequenceBuilder loads by id with no user filter, so the customer's
    // sequence opens under the grant. Only the id was undiscoverable.
    expect(PANEL).toContain("/dashboard/sequences/${s.id}");
    const BUILDER = readFileSync("src/components/sequences/SequenceBuilder.tsx", "utf8");
    const fetch = BUILDER.slice(BUILDER.indexOf("queryKey: ['sequence', id]"));
    expect(fetch.slice(0, 400)).not.toContain("user_id");
  });

  it("records opening an account, not just ending access", () => {
    // The audit table only ever saw the revocation, so what was done in
    // between — the part a customer would ask about — went unrecorded.
    expect(PANEL).toContain('from("support_access_events")');
    expect(PANEL).toContain("Opened the account to do setup work");
  });
});
