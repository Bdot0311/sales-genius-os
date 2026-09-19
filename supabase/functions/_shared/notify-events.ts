import { notifyUserPush } from "./notify-push.ts";

/**
 * The events worth a buzz in someone's pocket.
 *
 * Exactly one thing in the product sent a notification: the agent finishing a
 * run. A prospect replying, a meeting landing in the calendar, a sending
 * domain going bad — all silent, which is the wrong way round. The run summary
 * is the one a salesperson can read later; the reply is the one that decays if
 * they read it later.
 *
 * Kept in one module so the vocabulary stays consistent rather than accreting
 * as ad-hoc calls at each site. Three things every event here gets right:
 *
 *  - **A tag.** Web Push replaces a notification carrying the same tag, so a
 *    second deliverability alert updates the first rather than stacking a
 *    second row on the lock screen. Replies are the exception and say why.
 *  - **A deep link**, to the screen that lets them act, not the dashboard.
 *  - **A subject, not a category.** "Nate at Quilt replied" is worth unlocking
 *    a phone for. "You have a new reply" is not.
 *
 * Every one is fire-and-forget: notifyUserPush never throws, and none of these
 * is allowed to break the work that triggered it.
 */

/** Trim a name for a lock screen, which shows very little of it. */
const short = (value: string | null | undefined, max = 40): string => {
  const clean = (value ?? "").trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/**
 * A prospect replied.
 *
 * The most valuable notification the product can send, and the one most
 * damaged by delay. Batched on purpose: a sync that finds six replies sends
 * one notification, because six buzzes in a second is how someone learns to
 * turn notifications off.
 *
 * Auto-replies are filtered by the caller — an out-of-office is not a reply,
 * and being woken for one is exactly the noise that costs trust in the rest.
 */
export async function notifyRepliesReceived(
  userId: string,
  replies: { fromEmail: string; company?: string | null; subject?: string | null }[],
): Promise<number> {
  if (!replies.length) return 0;

  const [first] = replies;
  const who = short(first.company) || short(first.fromEmail);
  const title =
    replies.length === 1 ? `${who} replied` : `${replies.length} new replies`;
  const body =
    replies.length === 1
      ? short(first.subject, 90) || "Open the inbox to read it."
      : `${who} and ${replies.length - 1} other${replies.length === 2 ? "" : "s"}.`;

  return notifyUserPush(userId, {
    title,
    body,
    url: "/dashboard/inbox",
    // No tag. A reply is the one event where the second one must not quietly
    // replace the first — they are different people waiting on an answer.
    });
}

/** A meeting was booked. The thing the whole product exists to produce. */
export async function notifyMeetingBooked(
  userId: string,
  meeting: { inviteeName?: string | null; inviteeEmail?: string | null; startsAt?: string | null },
): Promise<number> {
  const who = short(meeting.inviteeName) || short(meeting.inviteeEmail) || "Someone";
  const when = meeting.startsAt
    ? new Date(meeting.startsAt).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  return notifyUserPush(userId, {
    title: `${who} booked a meeting`,
    body: when ?? "Open the calendar for the details.",
    url: "/dashboard/calendar",
    tag: "meeting-booked",
  });
}

/**
 * Something is wrong with sending.
 *
 * Tagged by kind, so a nightly scan that re-raises the same problem updates
 * the existing notification rather than adding a row every night.
 */
export async function notifyDeliverabilityAlert(
  userId: string,
  alert: { alertType: string; title: string; detail?: string | null },
): Promise<number> {
  return notifyUserPush(userId, {
    title: short(alert.title, 60) || "Deliverability needs attention",
    body: short(alert.detail, 100) || "Open Deliverability to see what changed.",
    url: "/dashboard/deliverability",
    tag: `deliverability-${alert.alertType}`,
  });
}

/** The agent finished a run. Readable later, so it collapses onto itself. */
export async function notifyAgentRunFinished(
  userId: string,
  agentName: string,
  summary: string,
): Promise<number> {
  return notifyUserPush(userId, {
    title: `${short(agentName, 30) || "Your AI SDR"} finished a run`,
    body: short(summary, 120),
    url: "/dashboard/agent",
    tag: "agent-run",
  });
}
