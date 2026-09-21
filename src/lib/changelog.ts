/**
 * The product changelog, as customers read it.
 *
 * The first version of this file was generated from merged pull requests, and
 * it read like it: four separate entries dated the same day, because four
 * branches landed that day; titles joining two unrelated fixes with "and",
 * because they shipped together; and twenty-four of twenty-five items tagged
 * "fixed" or "improved", because that is what a week of engineering looks like
 * from the inside. A changelog that is ninety percent bug fixes tells a
 * customer the product keeps breaking. It is not what they came to read.
 *
 * What they came to read is: what can I do now that I could not do yesterday,
 * what changed about something I already rely on, and what is coming. So:
 *
 *   - One entry per day, not per branch. Ship four things on Tuesday and
 *     Tuesday has one entry with four items.
 *   - Titles name one thing, in the customer's words. Not "Accounts lists open
 *     the right record, and reveals charge the right credit".
 *   - Anything that changes what someone is billed leads, in plain language,
 *     tagged `billing`. Softening that into "credits update instantly" is the
 *     one edit this file must never make.
 *   - `href` sends them to the thing being described. A changelog entry you
 *     cannot click is an announcement, not a feature.
 *   - Fixes are worth listing when a customer noticed the bug. An internal
 *     refactor is not an entry.
 *
 * Newest first. `date` is an ISO date (YYYY-MM-DD).
 */

export type ChangelogTag = "new" | "improved" | "fixed" | "billing";

export interface ChangelogItem {
  tag: ChangelogTag;
  title: string;
  description: string;
  /** Where to go to use it. Omitted when there is nowhere to send them. */
  href?: string;
}

export interface ChangelogEntry {
  /** Stable id, used for the anchor link. */
  id: string;
  date: string;
  title: string;
  summary: string;
  items: ChangelogItem[];
}

/**
 * What is being worked on now.
 *
 * Kept separate from the dated entries and pinned to the top of the page,
 * because "what's coming" is the half of a changelog people actually check for,
 * and it was previously one item buried inside an entry from two days ago.
 *
 * Nothing here carries a date. A roadmap with dates on it is a promise, and a
 * changelog is the wrong place to make one.
 */
export interface RoadmapItem {
  title: string;
  description: string;
  /** Roughly where it is. Deliberately coarse. */
  status: "building" | "next" | "exploring";
}

export const ROADMAP: RoadmapItem[] = [
  {
    status: "building",
    title: "Follow-ups that read the reply",
    description:
      "Today every enrolled lead walks the same steps. Next, a reply that says \"not now\" pauses the sequence and schedules a check-back, and one that asks a question hands you a draft answer instead of sending step three.",
  },
  {
    status: "next",
    title: "Enrich a whole list at once",
    description:
      "Select any number of saved leads and fill in their missing emails, titles and company data in one pass, with a running count of what was found and what it cost.",
  },
  {
    status: "next",
    title: "Your own sending domains, end to end",
    description:
      "Buy a domain, warm it, and route sending through it without leaving OutReign — with the DNS records checked for you rather than handed to you as a list.",
  },
  {
    status: "exploring",
    title: "Shared workspaces",
    description:
      "More than one seat on an account, with leads, sequences and mailboxes belonging to the team rather than to whoever signed up.",
  },
];

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-09-21-replies-and-billing",
    date: "2026-09-21",
    title: "Replies now find you",
    summary:
      "Replies are picked up automatically, and the billing dashboard now reports subscription and churn totals from the records that actually control customer access.",
    items: [
      {
        tag: "fixed",
        title: "Replies arrive without opening the inbox",
        description:
          "Your connected mailbox is checked automatically every few minutes, so a prospect's reply lands in your inbox, is available to your agent and can notify your phone without you opening the app.",
        href: "/dashboard/inbox",
      },
      {
        tag: "billing",
        title: "Billing and churn totals reflect real account changes",
        description:
          "New subscriptions, payment issues, completed cancellations, scheduled cancellations and chargebacks now come from billing history and current account status instead of disappearing when an alert is handled.",
      },
      {
        tag: "billing",
        title: "Your search allowance matches your plan",
        description:
          "When your plan changes, your monthly search allowance now changes with it. Accounts that were still showing the free allowance after upgrading have been corrected, and anything already used is kept.",
        href: "/dashboard/leads",
      },
    ],
  },
  {
    id: "2026-09-19-lead-intelligence",
    date: "2026-09-19",
    title: "Your saved leads can now tell you who to email first",
    summary:
      "Ask for an evaluation on any saved lead and you get a straight read on fit, buying intent, priority and the best next step — and your emails are written to match it.",
    items: [
      {
        tag: "fixed",
        href: "/dashboard/leads/saved",
        title: "Lead evaluations open without a refresh loop",
        description:
          "Saved Leads now displays evaluation badges normally instead of showing a misleading new-version refresh message.",
      },
      {
        tag: "new",
        title: "Fit, intent and priority on your saved leads",
        description:
          "Select leads on Saved Leads and hit Evaluate, or open a lead and evaluate it there. You get a clear read on how well they fit your ideal customer, how warm they look, how urgently to reach out and whether to email now or research first — with a confidence level, so a shaky call is never dressed up as a sure thing.",
        href: "/dashboard/saved-leads",
      },
      {
        tag: "new",
        title: "Filter down to the leads worth your morning",
        description:
          "New filters let you show only high-priority leads, or only the ones ready to be emailed, so you can work the top of the list first instead of scrolling.",
        href: "/dashboard/saved-leads",
      },
      {
        tag: "improved",
        title: "Emails written to the strategy for that person",
        description:
          "When a lead has been evaluated, your drafts follow the recommended angle: how personal to go, what kind of subject line, and what to ask for at the end. Your AI agent can read the same evaluation when you ask it about a lead.",
        href: "/dashboard/agent",
      },
    ],
  },
  {
    id: "2026-09-18",
    date: "2026-09-18",
    title: "Deliverability alerts and warm-up are running again",
    summary:
      "The scheduled checks behind your sender health had stopped running, and a small number of people were being logged out unexpectedly. Both are fixed.",
    items: [
      {
        tag: "fixed",
        title: "Sender reputation, warm-up and alert emails resume on schedule",
        description:
          "Daily reputation scoring, warm-up sends, alert emails and lead re-scoring after an ICP change had quietly stopped running. They are back on their normal schedule, so your deliverability numbers are current again.",
        href: "/dashboard/deliverability",
      },
      {
        tag: "fixed",
        title: "No more surprise sign-outs",
        description:
          "If your saved login was no longer valid, some pages loaded empty or errored instead of simply asking you to sign in again. Now the app clears the stale login cleanly and takes you straight back to the sign-in screen.",
      },
      {
        tag: "improved",
        title: "Your AI agent finishes what it starts",
        description:
          "If the agent started a job and its reply was cut short, it now picks up right where it left off and finishes the work — and when it searches for leads, you can see the search happening as it runs.",
        href: "/dashboard/agent",
      },
      {
        tag: "improved",
        title: "Every guide on the blog is now findable in search",
        description:
          "Only the earliest articles were listed for search engines, so newer guides could sit unfound for weeks. All 34 articles are now submitted to Google with their real publish dates, and new ones are added automatically the day they go up.",
        href: "/blog",
      },
    ],
  },
  {

    id: "2026-09-16",
    date: "2026-09-16",
    title: "Emails your AI agent writes meet a higher bar",
    summary:
      "The AI agent now holds every email it drafts to a much stricter quality standard before anything goes near a lead, and drafts that fall short are thrown away rather than retried until something squeaks through.",
    items: [
      {
        tag: "improved",
        title: "A stricter quality bar on every agent email",
        description:
          "Emails written by your AI agent are now scored against a much tougher standard for relevance, tone and length before they can be sent. What reaches your leads should read noticeably sharper.",
        href: "/dashboard/agent",
      },
      {
        tag: "improved",
        title: "No more settling for a passable draft",
        description:
          "When a draft can't reach the bar, it's discarded and the run stops instead of pushing out a weaker version. Better a shorter run with good emails than a full run with mediocre ones.",
        href: "/dashboard/agent",
      },
      {
        tag: "improved",
        title: "Failed sends now say why",
        description:
          "When an email can't be sent, the Sent tab now tells you the reason right on the row — including when it's your own Google connection that needs reconnecting, so you can fix it yourself in a minute.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Your agent no longer finishes a run empty-handed",
        description:
          "The quality standard was set so high that a genuinely good email could still be thrown out, and some runs reached nobody at all. Strong drafts now go out, and only truly weak ones are held back.",
        href: "/dashboard/agent",
      },
      {
        tag: "fixed",
        title: "Failed sends stay visible in the Sent tab",
        description:
          "Emails that failed could slip off the end of the list on busy accounts, so you never saw the reason. They now sit in order with everything else.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Notifications come back on their own",
        description:
          "After a security update to how notifications are signed, devices that already had alerts turned on went quiet. They now re-register themselves the next time you open OutReign.",
        href: "/settings?tab=notifications",
      },
      {
        tag: "fixed",
        title: "Failed sends no longer drag down your stats",
        description:
          "An email that couldn't be sent no longer counts as a send in your performance numbers or the Sent tab, and it shows the reason instead of a misleading \"sent\" time — so open, reply and click rates reflect what actually went out.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Push notifications actually reach your phone",
        description:
          "Alerts sent to your phone or desktop were being rejected before they arrived, so \"Send test notification\" reported nothing sent. That's fixed. Turn notifications back on once per device under Settings to re-register it.",
        href: "/settings?tab=notifications",
      },
      {
        tag: "new",
        title: "A page all about our cold email software",
        description:
          "There's now a dedicated page explaining how OutReign handles cold email end to end — picking who to email with ICP scoring, keeping you out of spam with verified addresses, and drafting every message for you.",
        href: "/cold-email-software",
      },
    ],
  },
  {
    id: "2026-09-15",
    date: "2026-09-15",
    title: "You'll be told when there's something new",
    summary:
      "The \"What's new\" nudge in the header now lights up the moment a new update is published, and the page marks exactly which updates you haven't read.",
    items: [
      {
        tag: "fixed",
        title: "The \"What's new\" nudge appears again",
        description:
          "New updates were going out quietly. The header now highlights as soon as something is published, and goes quiet once you've read it.",
        href: "/dashboard/whats-new",
      },
      {
        tag: "improved",
        title: "\"New to you\" stays on the right update",
        description:
          "Filtering the list by New, Improved, Fixed or Billing no longer moves the marker onto updates you had already read.",
        href: "/dashboard/whats-new",
      },
    ],
  },
  {
    id: "2026-09-14",
    date: "2026-09-14",
    title: "Credits move again, and the dashboard was rebuilt",
    summary:
      "Revealing a contact now spends a credit, which is what the meter was always meant to count. Every page in the dashboard was rebuilt on one set of components, and a batch of things that were quietly wrong got fixed along the way.",
    items: [
      {
        tag: "billing",
        title: "Revealing a contact costs one credit",
        description:
          "Searching stays free on every paid plan — you can run as many as your daily limit allows. A credit is spent when a contact is revealed: Enrich & Save, a person lookup that finds someone, or a bulk enrich. Previously reveals were not charged at all, which is why your balance never moved. No credit is taken when nothing is found.",
        href: "/dashboard/leads",
      },
      {
        tag: "fixed",
        title: "The credit meter updates as you spend",
        description:
          "It was read once when the page loaded and never again, so the number sat still until you refreshed. It now follows your balance live, including changes made in another tab.",
      },
      {
        tag: "improved",
        title: "The whole dashboard, rebuilt",
        description:
          "Every page now shares the same header, panels, empty states and type scale. Overview leads with what needs doing — leads with no email address, reachable leads nobody has contacted — rather than a row of links to pages already in the sidebar.",
        href: "/dashboard",
      },
      {
        tag: "fixed",
        title: "Warnings you could not read",
        description:
          "Alerts, deliverability notices and everything the AI Coach writes were rendering in colours meant for a white background, on a near-black one. They were somewhere between dim and invisible. All legible now.",
      },
      {
        tag: "fixed",
        title: "Person search returns a person, or says it found nobody",
        description:
          "Looking someone up by name and company could hand back the name and company you typed, dressed as a result, and charge you for it. A result now has to contain something the lookup actually discovered. No match, no charge.",
        href: "/dashboard/leads",
      },
      {
        tag: "improved",
        title: "Look before you save",
        description:
          "A person lookup no longer writes to your leads on its own. You see what was found first; if they are already a lead, you get a list of exactly which fields would change before you update them.",
        href: "/dashboard/leads",
      },
      {
        tag: "improved",
        title: "The pipeline totals itself",
        description:
          "Open deals, open value, weighted forecast and closed won sit above the board, instead of being seven column headings you added up by eye.",
        href: "/dashboard/pipeline",
      },
      {
        tag: "fixed",
        title: "Searches finish, or explain themselves",
        description:
          "A slow data source can no longer leave a search running indefinitely. Searches have a firm time limit, and a search that cannot finish refunds its credit.",
      },
      {
        tag: "fixed",
        title: "Inbox placement says whose problem it is",
        description:
          "When the shared test inbox cannot be read, the test now says so, stops offering a re-check that cannot succeed, and tells you which mailbox it is measuring against.",
        href: "/dashboard/deliverability",
      },
    ],
  },
  {
    id: "2026-09-13",
    date: "2026-09-13",
    title: "Honest empty searches",
    summary:
      "A search that comes back with nothing now distinguishes between \"nobody matches\" and \"we could not reach the data network\", and your monthly credit count is back in the header on every device.",
    items: [
      {
        tag: "fixed",
        title: "\"No leads found\" means no leads found",
        description:
          "When the lead data network cannot answer, you are told that, and no credit is spent. It used to look identical to a search that genuinely matched nobody.",
      },
      {
        tag: "fixed",
        title: "Monthly credits in the header again",
        description: "Visible on desktop, tablet and phone.",
      },
      {
        tag: "improved",
        title: "Failed searches fail fast",
        description: "A search that cannot complete stops quickly instead of hanging until it times out.",
      },
    ],
  },
  {
    id: "2026-09-12",
    date: "2026-09-12",
    title: "This page, and a home for the AI SDR",
    summary:
      "Product updates now live somewhere you can find them, and the AI SDR has a page explaining what it actually does on your behalf.",
    items: [
      {
        tag: "new",
        title: "What's new",
        description:
          "Everything shipped, newest first, with what is being built next pinned to the top. A dot appears next to the sparkle in the header when there is something you have not read.",
        href: "/dashboard/whats-new",
      },
      {
        tag: "new",
        title: "AI SDR overview",
        description:
          "How it finds prospects, writes a first touch, and decides when to follow up — in one place rather than spread across the app.",
        href: "/dashboard/agent",
      },
    ],
  },
  {
    id: "2026-09-10",
    date: "2026-09-10",
    title: "Sequences keep moving",
    summary:
      "Follow-up emails were not sending after the first step. They are, and seniority filters now behave across mixed job titles.",
    items: [
      {
        tag: "fixed",
        title: "Follow-ups send",
        description:
          "Enrolled leads were stopping after step one. Every waiting step is now rechecked hourly and sends on schedule.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Seniority filter",
        description:
          "Picking a seniority level filters correctly even when the search spans many job titles.",
      },
      {
        tag: "new",
        title: "Service status notices",
        description:
          "If something on our side is slow or down, a short notice appears at the top of your dashboard rather than leaving you to guess.",
      },
    ],
  },
  {
    id: "2026-09-08",
    date: "2026-09-08",
    title: "Guided setup for new accounts",
    summary:
      "New accounts answer a few questions about who they sell to and land in their first campaign, instead of an empty dashboard.",
    items: [
      {
        tag: "new",
        title: "Guided setup",
        description:
          "A short flow that captures your ideal customer, then takes you straight into your first campaign.",
      },
      {
        tag: "improved",
        title: "Coach limits are visible",
        description:
          "Each plan's monthly coaching allowance, and how much of it you have used, on the Coach page itself.",
        href: "/dashboard/coach",
      },
      {
        tag: "fixed",
        title: "CSV import adds instead of replacing",
        description:
          "Importing a list appends to your saved leads and maps names, emails and LinkedIn URLs correctly. It used to overwrite.",
        href: "/dashboard/leads/saved",
      },
    ],
  },
];

export const LATEST_CHANGELOG_DATE = CHANGELOG.reduce(
  (latest, entry) => (entry.date > latest ? entry.date : latest),
  "",
);

/** How many entries a customer has not seen, for the header dot. */
export const unreadCount = (seenDate: string): number =>
  CHANGELOG.filter((entry) => entry.date > seenDate).length;

export const TAG_LABELS: Record<ChangelogTag, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  billing: "Billing",
};
