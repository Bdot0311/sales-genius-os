/**
 * Header set by our own edge functions when a draft is agent work.
 *
 * A browser can send any header. It is only read when the bearer is the
 * service role (see draftTierForCaller). Studio, bulk, MCP and REST never
 * get Pro by asking for it in the body.
 */
export const DRAFT_TIER_HEADER = "x-outreign-draft-tier";

export type DraftTier = "pro" | "standard";

/**
 * Which tier writes this email.
 *
 * Agent chat, the autonomous agent and the job worker are the heavy path and
 * stay on Pro. Outreach Studio, bulk send, MCP and the REST API are the light
 * path and stay on Standard. The body is not an input: a signed-in client
 * cannot raise itself to Pro, and the REST route (which calls generate-email
 * with the service role) stays on Standard because it does not set the header.
 */
export function draftTierForCaller(internal: boolean, tierHeader: string | null | undefined): DraftTier {
  if (!internal) return "standard";
  return tierHeader?.trim().toLowerCase() === "pro" ? "pro" : "standard";
}
