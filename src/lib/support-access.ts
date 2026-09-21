/**
 * What an active support grant actually lets the team see.
 *
 * The backend for this feature was finished: has_active_support_grant() plus
 * FOR ALL policies on leads, email_sequences, sequence_steps, message_blocks,
 * email_drafts, icp_profiles and agent_configs, and an audit table for what
 * gets done under a grant.
 *
 * The admin panel showed the grant, said "You can work in these accounts now",
 * and offered exactly one button: End access. There was no way to reach any of
 * it — every list query in the app filters on the signed-in user's own id, so
 * a customer's sequences were invisible to the person who had been granted
 * permission to build them.
 *
 * (One asymmetry made the gap cheap to close. SequenceBuilder loads a sequence
 * by id with no user filter, so it works on a customer's sequence under RLS
 * already. The admin simply had no way to discover the id.)
 *
 * Scopes are two, granted together by the Settings card but stored separately
 * and enforced separately, so the panel has to render what THIS grant covers
 * rather than assuming. A section that silently comes back empty because the
 * scope was missing looks identical to a customer with no data.
 */

/**
 * Scopes are granular on purpose.
 *
 * There used to be one "campaign_assets" scope, and a customer who ticked it
 * to get a sequence built also handed over their ICP and their agent settings
 * in the same breath. Each area is its own consent now, so a grant only opens
 * what the customer actually agreed to.
 */
/** Sequences, their steps, message blocks and saved drafts. */
export const SCOPE_SEQUENCES = "sequences";
/** Who they're going after: the ICP profile. */
export const SCOPE_TARGETING = "targeting";
/** The AI agent's configuration. */
export const SCOPE_AGENT = "agent";
/** The scope covering the customer's lead records. */
export const SCOPE_LEADS = "leads";

/** Every scope a customer can consent to, in the order we show them. */
export const SUPPORT_SCOPES = [SCOPE_SEQUENCES, SCOPE_TARGETING, SCOPE_AGENT, SCOPE_LEADS] as const;

/** What each scope means, in the customer's words. */
export const SCOPE_LABELS: Record<string, string> = {
  [SCOPE_SEQUENCES]: "Your sequences, message blocks and drafts",
  [SCOPE_TARGETING]: "Your ideal customer profile",
  [SCOPE_AGENT]: "Your AI agent settings",
  [SCOPE_LEADS]: "Your saved leads",
};

export interface GrantLike {
  scopes?: string[] | null;
  granted_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  completed_at?: string | null;
}

/**
 * Whether a grant is usable right now.
 *
 * Mirrors has_active_support_grant in SQL. Kept identical on purpose: a UI
 * that offers to open an account the database will refuse is worse than one
 * that never offered.
 */
export function isGrantActive(grant: GrantLike, now: Date = new Date()): boolean {
  if (grant.revoked_at || grant.completed_at) return false;
  const expires = grant.expires_at ? Date.parse(grant.expires_at) : NaN;
  return Number.isFinite(expires) && expires > now.getTime();
}

export function grantCovers(grant: GrantLike, scope: string, now: Date = new Date()): boolean {
  return isGrantActive(grant, now) && (grant.scopes ?? []).includes(scope);
}

/** How long the team has left, in the words a person would use. */
export function expiresInWords(expiresAt: string | null | undefined, now: Date = new Date()): string {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(at)) return "unknown";
  const ms = at - now.getTime();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The sections a grant can populate, with the reason when it cannot.
 *
 * Returning a reason rather than filtering the section away is deliberate:
 * "not covered by this grant" and "they have none" are different answers, and
 * the team needs to know which one it is looking at before deciding whether to
 * ask the customer for more.
 */
export interface SectionAvailability {
  campaignAssets: boolean;
  leads: boolean;
  /** Non-empty when nothing at all is reachable. */
  blockedReason: string | null;
}

export function sectionsFor(grant: GrantLike, now: Date = new Date()): SectionAvailability {
  if (!isGrantActive(grant, now)) {
    return {
      campaignAssets: false,
      leads: false,
      blockedReason: grant.revoked_at
        ? "This customer revoked access."
        : grant.completed_at
        ? "This setup was marked complete, so access has ended."
        : "This grant has expired. Ask the customer to grant it again.",
    };
  }
  const campaignAssets = grantCovers(grant, SCOPE_CAMPAIGN_ASSETS, now);
  const leads = grantCovers(grant, SCOPE_LEADS, now);
  return {
    campaignAssets,
    leads,
    blockedReason:
      campaignAssets || leads
        ? null
        : "This grant carries no scopes we can act on. Ask the customer to grant it again.",
  };
}
