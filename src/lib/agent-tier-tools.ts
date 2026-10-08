/**
 * Mirrors supabase/functions/_shared/agent-tier-scope.ts.
 *
 * The edge functions are what actually enforce this; these helpers exist so the
 * UI can show which agent actions a plan includes and which need an upgrade.
 * Keep both files in sync.
 */
import { getAgentTier, type PlanType } from "@/lib/plan-features";

export type AgentTierId = "free" | "starter" | "growth" | "pro" | "elite";

export const TIER_BLOCKED_TOOLS: Record<AgentTierId, string[]> = {
  free: [
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
  ],
  starter: ["draft_sequence", "enroll_lead_in_sequence", "run_full_agent"],
  growth: [],
  pro: [],
  elite: [],
};

export const agentTierIdForPlan = (plan: PlanType): AgentTierId =>
  getAgentTier(plan).id as AgentTierId;

export const isToolOnPlan = (tool: string, plan: PlanType): boolean =>
  !(TIER_BLOCKED_TOOLS[agentTierIdForPlan(plan)] ?? []).includes(tool);

export const capToolsToPlan = (tools: string[], plan: PlanType): string[] =>
  tools.filter((t) => isToolOnPlan(t, plan));

export const toolsBlockedByPlan = (tools: string[], plan: PlanType): string[] =>
  tools.filter((t) => !isToolOnPlan(t, plan));
