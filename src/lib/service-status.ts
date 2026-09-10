// User-facing wording for a live service problem.
//
// The database only ever tells the app which kind of problem is open and how
// serious it is — never the internal alert message, which carries stack traces,
// customer ids and upstream payloads. The sentence a customer reads is written
// here, on purpose: an outage banner is customer communication, so it says what
// stopped working, what still works, and that we are on it.
//
// A category with no entry here shows nothing. That is deliberate — silence
// beats a banner full of engineering language.

export type StatusSeverity = "error" | "critical";

export interface ServiceStatusRow {
  category: string;
  severity: string;
  since: string;
}

export interface StatusCopy {
  /** Short label: what area is affected. */
  title: string;
  /** What the customer can and can't do right now, in their words. */
  body: string;
}

/** Wording per problem area. Degraded ("error") and down ("critical") differ. */
const COPY: Record<string, { error: StatusCopy; critical: StatusCopy }> = {
  system_health: {
    error: {
      title: "Some parts of OutReign are running slowly",
      body: "Your data is safe and nothing has been lost. A few actions may take longer than usual while our team works on it.",
    },
    critical: {
      title: "We're working on a service disruption",
      body: "Some features may not respond right now. Nothing you've saved is lost, and our team is actively on it.",
    },
  },
  email_delivery_failure: {
    error: {
      title: "Some emails are going out slower than usual",
      body: "Your scheduled emails are queued, not lost — they'll send as soon as delivery catches up. Our team is on it.",
    },
    critical: {
      title: "Email sending is paused",
      body: "Emails you send or schedule are being held in the queue and will go out once sending resumes. Nothing is lost, and we're fixing it now.",
    },
  },
  outreach_send_error: {
    error: {
      title: "Some outreach emails are failing to send",
      body: "Affected emails stay in your drafts so you can resend them. Our team is already looking into it.",
    },
    critical: {
      title: "Outreach sending is temporarily unavailable",
      body: "Your drafts and sequences are safe and will resume automatically. We're working on a fix right now.",
    },
  },
  sequence_dispatch_failure: {
    error: {
      title: "Sequence follow-ups are running behind",
      body: "Enrolled leads stay enrolled and their steps will catch up automatically. Nobody will be skipped.",
    },
    critical: {
      title: "Sequences are paused",
      body: "No follow-ups are going out at the moment. Your enrollments are untouched and will resume from where they left off.",
    },
  },
  lead_provider_failure: {
    error: {
      title: "Lead data is coming back incomplete",
      body: "Some searches may return fewer contacts than usual. Credits aren't charged for empty results.",
    },
    critical: {
      title: "Lead search is temporarily unavailable",
      body: "New searches may fail while our data network recovers. Your saved leads are unaffected and your credits are safe.",
    },
  },
  lead_search_failure: {
    error: {
      title: "Lead search is returning fewer results",
      body: "Some searches may come back short right now. You won't be charged credits for results we can't deliver.",
    },
    critical: {
      title: "Lead search is temporarily unavailable",
      body: "Searches may fail for a short while. Your saved leads and credits are unaffected.",
    },
  },
  enrichment_failure: {
    error: {
      title: "Contact enrichment is slower than usual",
      body: "Some lookups may take longer or come back without an email. Credits aren't spent on failed lookups.",
    },
    critical: {
      title: "Contact enrichment is temporarily unavailable",
      body: "Finding emails and phone numbers may fail right now. No credits are charged for failed lookups.",
    },
  },
  ai_credits_exhausted: {
    error: {
      title: "AI features are running at reduced capacity",
      body: "Writing and coaching may be slower or briefly unavailable. Everything you've generated is saved.",
    },
    critical: {
      title: "AI features are temporarily unavailable",
      body: "AI writing, sequences and coaching may not respond right now. Your saved work is unaffected and we're restoring service.",
    },
  },
  ai_generation_failure: {
    error: {
      title: "AI writing is failing on some requests",
      body: "If a draft doesn't generate, try again in a few minutes. Nothing already written is affected.",
    },
    critical: {
      title: "AI writing is temporarily unavailable",
      body: "Generating emails, sequences and coaching replies may fail right now. Our team is on it.",
    },
  },
  oauth_refresh_failure: {
    error: {
      title: "Some mailbox connections are dropping",
      body: "If sending from your mailbox fails, reconnecting it under Integrations usually fixes it. We're working on the underlying issue.",
    },
    critical: {
      title: "Mailbox connections are failing",
      body: "Connected inboxes may disconnect or refuse to send. Your emails stay queued until the connection is back.",
    },
  },
  calendar_sync_failure: {
    error: {
      title: "Calendar sync is running behind",
      body: "New meetings may take a while to appear. Nothing on your calendar is changed or deleted.",
    },
    critical: {
      title: "Calendar sync is paused",
      body: "Booked meetings may not show up in OutReign for now. Your calendar itself is unaffected.",
    },
  },
  stripe_webhook_failure: {
    error: {
      title: "Billing updates are delayed",
      body: "A recent payment or plan change may take a little longer to appear on your account. Nothing is charged twice.",
    },
    critical: {
      title: "Billing updates aren't going through",
      body: "Plan changes and payments may not show on your account yet. No duplicate charges will be made, and we're fixing it.",
    },
  },
};

/**
 * Pick the one incident to show. Two open problems at once is real, but two
 * banners is noise: the more serious one wins, and the newer of two equals.
 */
export function selectStatus(rows: ServiceStatusRow[] | null | undefined): {
  copy: StatusCopy;
  severity: StatusSeverity;
  since: string;
  key: string;
} | null {
  const known = (rows ?? []).filter(
    (r) => COPY[r.category] && (r.severity === "error" || r.severity === "critical"),
  );
  if (!known.length) return null;

  known.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return Date.parse(b.since) - Date.parse(a.since);
  });

  const top = known[0];
  const severity = top.severity as StatusSeverity;
  return {
    copy: COPY[top.category][severity],
    severity,
    since: top.since,
    // Identifies this incident, so dismissing it hides this one only — a new
    // or escalating problem shows again rather than inheriting the dismissal.
    key: `${top.category}:${severity}:${top.since}`,
  };
}
