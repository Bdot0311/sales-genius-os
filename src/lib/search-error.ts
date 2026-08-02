/**
 * Turns a failed lead search into the toast the user sees.
 *
 * The edge function already tells us exactly what went wrong via `error_code`,
 * so that code is the only thing we branch on. Keyword sniffing the message is
 * a last resort for responses that carry no code, and it is deliberately
 * narrow: two of the edge function's messages contain the word "credit" only
 * to reassure the user that their credit was *not* spent, and matching those
 * is what made a rejected search report itself as an empty credit balance.
 *
 * Search credits are SalesOS plan credits held in `subscriptions.
 * search_credits_remaining`. They are metered per account and are unrelated to
 * the balance on the upstream data provider's own account, so the copy has to
 * name which balance is empty.
 */

export interface SearchErrorInput {
  /** Human-readable message from the edge function (or a thrown Error). */
  message: string;
  /** `error_code` from the edge function payload, when present. */
  code?: string | null;
  /** Plan credits left, from `remaining_credits`. */
  remainingCredits?: number | null;
  /** True when the account is on the free tier and must upgrade. */
  upgradeRequired?: boolean | null;
}

export interface SearchErrorToast {
  title: string;
  description: string;
  /** Long-lived toasts for anything the user must act on (billing, limits). */
  durationMs?: number;
}

const ACTION_REQUIRED_MS = 10000;

const PLAN_CREDIT_NOTE =
  "These are your SalesOS plan credits, which are separate from the balance on your data provider account.";

/** Codes the edge function returns; anything else falls through to keywords. */
function fromErrorCode(input: SearchErrorInput): SearchErrorToast | null {
  switch (input.code) {
    case "credits_exhausted": {
      if (input.upgradeRequired) {
        return {
          title: "Free search credits used up",
          description:
            "You've used all 100 free SalesOS search credits. Upgrade to a paid plan to keep finding prospects.",
          durationMs: ACTION_REQUIRED_MS,
        };
      }
      return {
        title: "Out of SalesOS search credits",
        description: `Your plan's search credits are used up. Add more credits or wait for the monthly reset. ${PLAN_CREDIT_NOTE}`,
        durationMs: ACTION_REQUIRED_MS,
      };
    }

    case "daily_limit_reached":
      return {
        title: "Daily search limit reached",
        description:
          "You've hit today's search limit for your plan. It resets at midnight — your remaining credits are untouched.",
        durationMs: ACTION_REQUIRED_MS,
      };

    case "account_locked":
      return {
        title: "Account locked",
        description: "Your account is locked. Please contact support to unlock it.",
        durationMs: ACTION_REQUIRED_MS,
      };

    case "auth_error":
      return {
        title: "Signed out",
        description: "Your session expired. Please sign in again to keep searching.",
      };

    // The search never reached the provider, or the provider refused it. In
    // every one of these the credit is refunded, so they must never read as a
    // billing problem.
    case "upstream_rejected":
      return {
        title: "Search rejected",
        description:
          "The lead data provider rejected this search. No credit was used — try simpler filters or a different location.",
      };

    case "network_error":
    case "upstream_unavailable":
      return {
        title: "Search unavailable",
        description:
          "Could not reach the lead data provider. No credit was used — this is usually temporary, please try again in a moment.",
      };

    case "fetch_error":
      return {
        title: "Search failed",
        description: "Something went wrong running that search. Please try again.",
      };

    default:
      return null;
  }
}

/**
 * True when "credit" appears only in a reassurance that none was spent, e.g.
 * "Your search credit was not used". Such a message is not a billing error.
 */
function saysCreditWasNotUsed(message: string): boolean {
  return /\bno\s+credit\s+was\s+used\b|\bcredits?\s+(?:was|were)\s+not\s+used\b/i.test(message);
}

export function classifySearchError(input: SearchErrorInput): SearchErrorToast {
  const coded = fromErrorCode(input);
  if (coded) return coded;

  const message = input.message || "Failed to fetch leads";
  const low = message.toLowerCase();

  const looksLikeBilling =
    !saysCreditWasNotUsed(message) &&
    (low.includes("credit") ||
      low.includes("exhausted") ||
      low.includes("payment") ||
      low.includes("402") ||
      low.includes("upgrade"));

  if (looksLikeBilling) {
    return {
      title: "Out of SalesOS search credits",
      description: `${message} ${PLAN_CREDIT_NOTE}`,
      durationMs: ACTION_REQUIRED_MS,
    };
  }

  if (low.includes("subscription") || low.includes("paid plan") || low.includes("trial")) {
    return { title: "Subscription required", description: message, durationMs: ACTION_REQUIRED_MS };
  }

  if (low.includes("reach") || low.includes("network") || low.includes("provider")) {
    return {
      title: "Search unavailable",
      description:
        "Could not connect to the lead data provider. This is usually a temporary issue — please try again in a moment.",
    };
  }

  return {
    title: "Search failed",
    description:
      message ||
      'No results found. Try a different query — e.g. "VP of Sales at SaaS companies" or "CTOs in New York".',
  };
}
