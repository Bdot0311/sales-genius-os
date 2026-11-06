// Plan-tier capping for agent tools.
//
// Roles and custom builds decide what an agent is *meant* to do; the plan tier
// decides what it is *allowed* to do. A free-tier custom build that grants
// itself send_drafts must still be draft-only, otherwise "custom build" becomes
// a way around the plan. Both agent-chat and build-agent apply this cap.

import { ALL_AGENT_TOOLS, CORE_TOOLS } from "./agent-tool-scope.ts";

export type AgentTierId = "free" | "starter" | "growth" | "pro" | "elite";

export const PLAN_TO_AGENT_TIER: Record<string, AgentTierId> = {
  free: "free",
  starter: "starter",
  growth: "growth",
  pro: "pro",
  agency: "elite",
  elite: "elite",
};

/** Tools each tier may NOT use, whatever the role or custom allow-list says. */
export const TIER_BLOCKED_TOOLS: Record<AgentTierId, string[]> = {
  // Explore tier: research and draft only. Nothing leaves the account, nothing
  // is destroyed, no autonomous runs.
  free: [
    "verify_email",
    "send_drafts",
    "send_outreach",
    "schedule_drafts",
    "cancel_scheduled_email",
    "draft_sequence",
    "enroll_lead_in_sequence",
    "run_full_agent",
    "delete_leads",
    "delete_drafts",
    "delete_inbox_threads",
    "delete_deal",
    "update_sending_account",
    "update_sequence_status",
    "update_enrollment",
  ],
  // Starter can send, but sequences and fully autonomous runs are growth+.
  starter: ["draft_sequence", "enroll_lead_in_sequence", "run_full_agent"],
  growth: [],
  pro: [],
  elite: [],
};

export const agentTierForPlan = (plan: string | null | undefined): AgentTierId =>
  PLAN_TO_AGENT_TIER[(plan ?? "free").toLowerCase()] ?? "free";

/** Intersect a resolved tool list with what the tier permits. */
export function capToolsToTier(tools: string[], tier: AgentTierId): string[] {
  const blocked = new Set(TIER_BLOCKED_TOOLS[tier] ?? []);
  const capped = tools.filter((t) => !blocked.has(t));
  // Core read-only tools survive every cap so an agent is never mute.
  return [...new Set([...CORE_TOOLS, ...capped])];
}

/** Tools this tier can never grant (used to explain upgrades in the UI/prompt). */
export function blockedToolsFor(tools: string[], tier: AgentTierId): string[] {
  const blocked = new Set(TIER_BLOCKED_TOOLS[tier] ?? []);
  return tools.filter((t) => blocked.has(t) && ALL_AGENT_TOOLS.includes(t));
}

/** Reads the account's plan and returns its agent tier. */
export async function resolveAgentTier(
  admin: { from: (t: string) => any },
  userId: string,
): Promise<AgentTierId> {
  try {
    const { data } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    return agentTierForPlan(data?.plan);
  } catch {
    return "free";
  }
}

export function tierScopeNote(tier: AgentTierId, removed: string[]): string {
  if (!removed.length) return "";
  return `\nPLAN LIMIT (${tier} plan): these tools are not on this account's plan and were removed from this build: ${removed.join(
    ", ",
  )}. If the user asks for that work, say it needs a plan upgrade — do not attempt it and do not pretend the build can do it.`;
}
