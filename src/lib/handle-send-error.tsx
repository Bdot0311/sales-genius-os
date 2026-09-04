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
  remedy?: string[];
  previously_sent_at?: string | null;
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
  if (status === 409 && payload.code === "duplicate_send") {
    // Named separately because it is not a failure — the email was already
    // delivered — and because the obvious next move (rewrite the draft) is the
    // one that does not work. The toast says what does.
    const when = payload.previously_sent_at
      ? new Date(payload.previously_sent_at).toLocaleDateString()
      : null;
    toast.error("They already got this email", {
      duration: 10_000,
      description:
        `${when ? `Sent ${when}. ` : ""}Nothing is wrong with the draft — rewriting it will not change this. ` +
        `Send a follow-up on a new angle with a different subject line instead.`,
    });
    return;
  }
  toast.error(payload.error || "Failed to send email");
}

/**
 * The reason a function call failed, out of the response body.
 *
 * supabase-js reports every non-2xx as "Edge Function returned a non-2xx
 * status code" and puts the real response on `error.context`. A user pressing
 * Send Now got that sentence and nothing else, while the body underneath said
 * which mailbox had hit its limit or which credential had expired — the same
 * shape as every other failure in this product, where the explanation exists
 * and nobody shows it.
 *
 * Only 429 was ever unpacked. Every other status fell through to the generic
 * string, which is exactly the case where a user has no idea what to do next.
 */
export async function readFunctionError(
  error: unknown,
): Promise<{ status: number; payload: SendErrorPayload }> {
  const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } })?.context;
  const status = typeof context?.status === "number" ? context.status : 0;

  let payload: SendErrorPayload = {};
  try {
    const parsed = await context?.json?.();
    if (parsed && typeof parsed === "object") payload = parsed as SendErrorPayload;
  } catch {
    // A body that is not JSON (an HTML gateway page, an empty 502) tells us
    // nothing more than the status already did.
    payload = {};
  }

  if (!payload.error) {
    // supabase-js's own message is the sentence this function exists to
    // replace, so it never becomes the reason — not even as a fallback.
    const own = (error as { message?: string })?.message ?? "";
    const usable = own && !/non-2xx status code/i.test(own) ? own : "";

    payload = {
      ...payload,
      error:
        status >= 500
          ? `The send service returned an error (${status}). Nothing was sent — try again in a moment.`
          : status
            ? `The send was refused (${status}) and no reason was given.`
            : usable || "The send failed and no reason came back. Nothing was sent.",
    };
  }

  return { status, payload };
}

/** Read the failure and show it, in one step. */
export async function reportSendFailure(error: unknown): Promise<SendErrorPayload> {
  const { status, payload } = await readFunctionError(error);
  showSendError(status, payload);
  return payload;
}
