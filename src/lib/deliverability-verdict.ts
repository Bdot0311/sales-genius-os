/**
 * Turning deliverability data into a verdict.
 *
 * Every competitor in this category ships a metrics wall. A number on its own
 * puts the diagnosis on the user: they see 71% and have to work out whether
 * that is fine, what caused it, and what to do. This module does that work.
 *
 * Every verdict has three layers, in this order:
 *   1. state  — one word
 *   2. cause  — a specific named diagnosis, not a restatement of the number
 *   3. action — the thing that fixes it
 *
 * The rule that keeps this honest: when the data cannot support a named cause,
 * `cause` is null and `unknownReason` says why. "Placement dropped" is a
 * restatement and does not count as a cause; "placement dropped 14 points on
 * M365 tenants only" does. A tile that cannot say which, says so.
 */

export type VerdictState = "healthy" | "degrading" | "at_risk" | "failing" | "unknown";

export interface VerdictAction {
  label: string;
  /**
   * navigate — go somewhere in the app
   * copy     — put an exact value (a DNS record) on the clipboard
   * run      — kick off a check or a test
   * reconnect— re-authorise a mailbox
   */
  kind: "navigate" | "copy" | "run" | "reconnect";
  /** Route for navigate, the literal text for copy, a function key for run. */
  target?: string;
}

export interface Verdict {
  state: VerdictState;
  /** The headline figure, when there is one worth showing. */
  value: string | null;
  /** A named diagnosis. Null when the data cannot support one. */
  cause: string | null;
  /** Why no cause could be named. Only set when `cause` is null. */
  unknownReason?: string;
  action: VerdictAction | null;
}

const STATE_ORDER: Record<VerdictState, number> = {
  healthy: 0, unknown: 1, degrading: 2, at_risk: 3, failing: 4,
};

/** The worst state in a set — what a roll-up tile should show. */
export function worstState(states: VerdictState[]): VerdictState {
  return states.reduce<VerdictState>(
    (worst, s) => (STATE_ORDER[s] > STATE_ORDER[worst] ? s : worst),
    "healthy",
  );
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

// ---------------------------------------------------------------------------
// Inbox placement
// ---------------------------------------------------------------------------

export interface PlacementInput {
  provider: string;
  placement: string;
  tab?: string | null;
  observedAt?: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  yahoo: "Yahoo",
  m365: "Microsoft 365",
  workspace: "Google Workspace",
};

const providerLabel = (p: string) => PROVIDER_LABELS[p] ?? p;

/**
 * Where mail landed, per provider.
 *
 * Deliberately not derived from open rate. Open tracking needs a pixel, the
 * pixel raises spam score, and spam-foldered mail still fires it — so the
 * number meant to measure placement is inflated by the failure it should catch.
 * This reads seed tests or it reports nothing.
 */
export function placementVerdict(results: PlacementInput[]): Verdict {
  const usable = results.filter(
    (r) => r.placement !== "unsupported" && r.placement !== "pending" && r.placement !== "missing",
  );

  if (usable.length === 0) {
    const waiting = results.some((r) => r.placement === "pending");
    return {
      state: "unknown",
      value: null,
      cause: null,
      unknownReason: waiting
        ? "A seed test is in flight. Placement appears once the message arrives."
        : "No seed test has run yet. Placement is measured by sending to real inboxes, not inferred from opens.",
      action: { label: "Run a placement test", kind: "run", target: "placement" },
    };
  }

  const inbox = usable.filter((r) => r.placement === "inbox");
  const spam = usable.filter((r) => r.placement === "spam");
  const promotions = usable.filter((r) => r.placement === "promotions" || r.tab === "promotions");
  const inboxRate = inbox.length / usable.length;

  // Spam anywhere is the loudest signal, and naming the providers is the cause.
  if (spam.length > 0) {
    const names = [...new Set(spam.map((r) => providerLabel(r.provider)))];
    const everywhere = spam.length === usable.length;
    return {
      state: everywhere ? "failing" : "at_risk",
      value: pct(inboxRate),
      cause: everywhere
        ? `Filtered to spam at every provider tested (${names.join(", ")}). This is an authentication or reputation problem, not a copy problem.`
        : `Filtered to spam at ${names.join(" and ")} while reaching the inbox elsewhere. A provider-specific filter is rejecting this sender.`,
      action: { label: "Check authentication", kind: "navigate", target: "#authentication" },
    };
  }

  if (promotions.length > 0) {
    const names = [...new Set(promotions.map((r) => providerLabel(r.provider)))];
    return {
      state: "degrading",
      value: pct(inboxRate),
      cause: `Delivered but sorted into Promotions at ${names.join(" and ")}. Gmail reads links, images and marketing phrasing as bulk mail — the message is landing, just not where anyone reads it.`,
      action: { label: "Check content risk", kind: "navigate", target: "#content" },
    };
  }

  return {
    state: "healthy",
    value: pct(inboxRate),
    cause: `Reaching the primary inbox at ${[...new Set(usable.map((r) => providerLabel(r.provider)))].join(", ")}.`,
    action: null,
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface DomainAuthInput {
  domain: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  dkim_selector?: string | null;
  last_checked_at?: string | null;
}

/**
 * SPF, DKIM and DMARC across the sending domains.
 *
 * `unknown` is treated as its own answer rather than folded into a pass: a
 * lookup we could not resolve is not a record that exists, and reporting it as
 * healthy is how a domain silently fails for weeks.
 */
export function authVerdict(domains: DomainAuthInput[]): Verdict {
  if (domains.length === 0) {
    return {
      state: "unknown",
      value: null,
      cause: null,
      unknownReason: "No sending domain has been added, so there is nothing to check.",
      action: { label: "Add a domain", kind: "navigate", target: "#authentication" },
    };
  }

  const failing: string[] = [];
  const unresolved: string[] = [];

  for (const d of domains) {
    const missing = [
      d.spf_status === "fail" ? "SPF" : null,
      d.dkim_status === "fail" ? "DKIM" : null,
      d.dmarc_status === "fail" ? "DMARC" : null,
    ].filter(Boolean) as string[];
    if (missing.length > 0) failing.push(`${d.domain} (${missing.join(", ")})`);

    const unsure = [
      d.spf_status === "unknown" ? "SPF" : null,
      d.dkim_status === "unknown" ? "DKIM" : null,
      d.dmarc_status === "unknown" ? "DMARC" : null,
    ].filter(Boolean) as string[];
    if (unsure.length > 0) unresolved.push(`${d.domain} (${unsure.join(", ")})`);
  }

  if (failing.length > 0) {
    const allThree = domains.every(
      (d) => d.spf_status === "fail" && d.dkim_status === "fail" && d.dmarc_status === "fail",
    );
    return {
      state: allThree ? "failing" : "at_risk",
      value: `${failing.length} of ${domains.length}`,
      cause: allThree
        ? `${failing.join("; ")} — none of the three records are published. Receivers have no way to tell your mail from a forgery, and Gmail and Outlook now reject bulk senders that fail all three.`
        : `Missing records on ${failing.join("; ")}. Each missing record is a reason for a receiver to distrust the message.`,
      action: { label: "Copy the exact records", kind: "navigate", target: "#authentication" },
    };
  }

  if (unresolved.length > 0) {
    return {
      state: "unknown",
      value: null,
      cause: null,
      unknownReason: `DNS lookups did not resolve for ${unresolved.join("; ")}. That is a failed check, not a passed one — retry before treating it as healthy.`,
      action: { label: "Re-check now", kind: "run", target: "domain-auth" },
    };
  }

  return {
    state: "healthy",
    value: `${domains.length} of ${domains.length}`,
    cause: `SPF, DKIM and DMARC all publish correctly on ${domains.map((d) => d.domain).join(", ")}.`,
    action: null,
  };
}

// ---------------------------------------------------------------------------
// Bounces
// ---------------------------------------------------------------------------

export interface VolumeInput {
  sent: number;
  bounced: number;
  complaints: number;
}

/** Below this, a bounce rate is noise: one bad address out of twelve is 8%. */
export const MIN_SENDS_FOR_RATE = 50;

export function bounceVerdict(v: VolumeInput): Verdict {
  if (v.sent < MIN_SENDS_FOR_RATE) {
    return {
      state: "unknown",
      value: null,
      cause: null,
      unknownReason: `Only ${v.sent} sends so far. A bounce rate needs at least ${MIN_SENDS_FOR_RATE} to mean anything — one bad address in a small batch reads as a crisis.`,
      action: null,
    };
  }

  const rate = v.bounced / v.sent;
  const value = pct(rate);

  if (rate >= 0.05) {
    return {
      state: "failing",
      value,
      cause: `${v.bounced} of ${v.sent} sends bounced. Above 5% providers start throttling the sender outright, and the list is the cause — these addresses were never deliverable.`,
      action: { label: "Verify your list", kind: "navigate", target: "/leads" },
    };
  }
  if (rate >= 0.02) {
    return {
      state: "at_risk",
      value,
      cause: `${v.bounced} of ${v.sent} sends bounced, over the 2% line where reputation starts to erode. Unverified addresses in the list are the usual cause.`,
      action: { label: "Verify your list", kind: "navigate", target: "/leads" },
    };
  }
  return {
    state: "healthy",
    value,
    cause: `${v.bounced} bounces in ${v.sent} sends, comfortably under the 2% line.`,
    action: null,
  };
}

export function complaintVerdict(v: VolumeInput): Verdict {
  if (v.sent < MIN_SENDS_FOR_RATE) {
    return {
      state: "unknown",
      value: null,
      cause: null,
      unknownReason: `Only ${v.sent} sends so far — not enough to read a complaint rate.`,
      action: null,
    };
  }

  const rate = v.complaints / v.sent;
  const value = pct(rate);

  // Google and Yahoo publish 0.3% as the hard line and 0.1% as the target.
  if (rate >= 0.003) {
    return {
      state: "failing",
      value,
      cause: `${v.complaints} spam complaints in ${v.sent} sends. Google and Yahoo treat 0.3% as the line where they stop delivering a sender — you are at or past it.`,
      action: { label: "Pause and review targeting", kind: "navigate", target: "#accounts" },
    };
  }
  if (rate >= 0.001) {
    return {
      state: "at_risk",
      value,
      cause: `${v.complaints} spam complaints in ${v.sent} sends, above the 0.1% target. People are marking this as spam rather than ignoring it, which points at relevance, not deliverability.`,
      action: { label: "Review targeting", kind: "navigate", target: "/leads" },
    };
  }
  return {
    state: "healthy",
    value,
    cause: `${v.complaints} complaints in ${v.sent} sends, under the 0.1% target.`,
    action: null,
  };
}

// ---------------------------------------------------------------------------
// Connection health — uptime, kept deliberately separate from the above.
//
// A mailbox that is connected and sending is not a mailbox whose mail is
// landing. The category conflates the two and markets the first as the second.
// These states describe whether the pipe is open. Nothing more.
// ---------------------------------------------------------------------------

export type ConnectionState = "sending" | "degraded" | "blocked" | "disconnected";

export interface ConnectionDiagnosis {
  state: ConnectionState;
  /** Plain English, always. A raw provider error never reaches the UI. */
  explanation: string;
  fix: { label: string; kind: "reconnect" | "resume" | "none" } | null;
}

export interface ConnectionInput {
  email: string;
  status: string;
  pausedReason?: string | null;
  sentToday: number;
  dailyLimit: number;
  /** Whether an OAuth integration row still exists and is active. */
  integrationActive: boolean;
  /** Epoch ms the access token expires; null when unknown. */
  tokenExpiresAt?: number | null;
  /** Whether a refresh token is stored — without one, expiry is terminal. */
  hasRefreshToken?: boolean;
  lastSentAt?: string | null;
}

/**
 * Raw provider errors are for logs, not for people.
 *
 * Each entry maps a substring providers actually emit to what it means and what
 * to do. Anything unmatched gets a generic line rather than the raw string —
 * showing `invalid_grant` to a user tells them nothing and looks broken.
 */
const ERROR_EXPLANATIONS: { match: RegExp; explanation: string }[] = [
  { match: /invalid_grant|token (has been )?expired|refresh token/i,
    explanation: "Google sign-in for this mailbox has expired. Reconnecting takes a few seconds and no settings are lost." },
  { match: /insufficient|scope|permission|forbidden|403/i,
    explanation: "This mailbox is connected but has not granted permission to send. Reconnect and accept the send permission." },
  { match: /rate.?limit|429|too many|quota/i,
    explanation: "The provider is rate-limiting this mailbox. Sending resumes on its own once the limit resets, usually within a few hours." },
  { match: /auth|credential|password|535|invalid_client/i,
    explanation: "The mailbox rejected the saved credentials. Reconnect the account to refresh them." },
  { match: /reputation/i,
    explanation: "Sending was paused automatically to protect this mailbox's reputation. Fix the underlying issue before resuming." },
  { match: /disabled|suspended|account.*closed/i,
    explanation: "The provider has suspended this mailbox. It has to be resolved with the provider before sending can resume." },
];

export function explainProviderError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Sending is paused. No reason was recorded.";
  const hit = ERROR_EXPLANATIONS.find((e) => e.match.test(text));
  return hit
    ? hit.explanation
    : "Sending is paused and the provider did not give a reason we recognise. Reconnecting the mailbox usually clears it.";
}

export function diagnoseConnection(input: ConnectionInput): ConnectionDiagnosis {
  if (!input.integrationActive) {
    return {
      state: "disconnected",
      explanation: "This mailbox is no longer linked to a signed-in account, so nothing can send from it.",
      fix: { label: "Reconnect", kind: "reconnect" },
    };
  }

  // An expired token with no refresh token cannot recover on its own.
  const expired = input.tokenExpiresAt != null && Date.now() >= input.tokenExpiresAt;
  if (expired && input.hasRefreshToken === false) {
    return {
      state: "disconnected",
      explanation: "Google sign-in for this mailbox has expired and cannot renew itself. Reconnecting takes a few seconds.",
      fix: { label: "Reconnect", kind: "reconnect" },
    };
  }

  if (input.status === "disabled") {
    return {
      state: "disconnected",
      explanation: "This mailbox is switched off and will not send until it is re-enabled.",
      fix: { label: "Re-enable", kind: "resume" },
    };
  }

  if (input.status === "paused") {
    const reason = input.pausedReason ?? "";
    const manual = /manual/i.test(reason);
    return {
      state: "blocked",
      explanation: manual
        ? "You paused this mailbox. It will not send until you resume it."
        : explainProviderError(reason),
      fix: { label: "Resume sending", kind: "resume" },
    };
  }

  if (input.dailyLimit > 0 && input.sentToday >= input.dailyLimit) {
    return {
      state: "degraded",
      explanation: `This mailbox has sent its full ${input.dailyLimit} for today. It starts again tomorrow — raising the limit too fast is what gets a mailbox filtered.`,
      fix: null,
    };
  }

  return {
    state: "sending",
    explanation: input.dailyLimit > 0
      ? `Sending normally. ${input.sentToday} of ${input.dailyLimit} used today.`
      : "Sending normally.",
    fix: null,
  };
}

/** Roll-up for the Connection Health heading. */
export function connectionSummary(diagnoses: ConnectionDiagnosis[]): {
  sending: number; degraded: number; blocked: number; disconnected: number; total: number;
} {
  const count = (s: ConnectionState) => diagnoses.filter((d) => d.state === s).length;
  return {
    sending: count("sending"),
    degraded: count("degraded"),
    blocked: count("blocked"),
    disconnected: count("disconnected"),
    total: diagnoses.length,
  };
}
