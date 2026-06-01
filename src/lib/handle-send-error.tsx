import { toast } from "sonner";
import { createElement } from "react";

interface SendErrorPayload {
  error?: string;
  code?: string;
  upgradeRequired?: boolean;
  plan?: string;
  monthlyLimit?: number;
  monthlySent?: number;
  monthlyRemaining?: number;
  resetAt?: string;
  dailyLimit?: number;
  dailySent?: number;
}

/**
 * Renders a rich toast for send failures. For 429 monthly-cap responses it
 * surfaces the exact remaining quota and an in-app Upgrade action.
 */
export function showSendError(status: number, payload: SendErrorPayload) {
  if (status === 429 && payload.upgradeRequired) {
    const limit = payload.monthlyLimit?.toLocaleString() ?? "?";
    const sent = payload.monthlySent?.toLocaleString() ?? "?";
    toast.error("Monthly email cap reached", {
      duration: 10_000,
      description: `${sent} / ${limit} sent on ${payload.plan ?? "your"} plan · 0 remaining this month. Upgrade to keep sending.`,
      action: {
        label: "Upgrade",
        onClick: () => { window.location.assign("/pricing"); },
      },
    });
    return;
  }
  if (status === 429) {
    toast.error("Daily send limit reached", {
      description: payload.error || `${payload.dailySent ?? "?"}/${payload.dailyLimit ?? "?"} sent today. Try again tomorrow or raise the limit in Outreach settings.`,
    });
    return;
  }
  toast.error(payload.error || "Failed to send email");
}
