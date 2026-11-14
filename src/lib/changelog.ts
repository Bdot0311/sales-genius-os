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
    /*
     * This promised something that already works.
     *
     * Selecting saved leads and enriching them in one pass, with a live count
     * of what was found, skipped and failed, has shipped — it is billed for in
     * the pricing entry below. Leaving it on the roadmap as "up next" tells
     * someone a feature they used this morning is not built yet, which is a
     * worse thing for this page to say than nothing. What is genuinely
     * missing is the half about money.
     */
    status: "next",
    title: "See what a bulk run will cost before it runs",
    description:
      "Enriching a selection spends a credit for each contact it finds, and today you watch the count rather than the bill. Next, an estimate before you start and a running total as it goes, so a thousand-lead run is a decision rather than a surprise.",
  },
  {
    /*
     * One item, because it was one feature written twice.
     *
     * "Your own sending domains, end to end" and "Inboxes made for you, not
     * by you" were the same promise from two angles — both ended at a warmed
     * mailbox you can send from, and both said warmup. Side by side on the
     * page they read as two things coming, which inflates the roadmap and
     * tells a reader the domain arrives before the inboxes do.
     *
     * The description also has to stop re-promising the part that works:
     * apply-cloudflare-dns already writes the SPF and DMARC records, and
     * check-domain-auth and verify-domain already check them. What is missing
     * is the ends — buying the domain, and creating the mailboxes on it.
     */
    status: "next",
    title: "A sending domain you never have to leave to set up",
    description:
      "Today you bring a domain you own and OutReign writes and checks its records for you. Next, the two ends either side of that: buy the domain here, and have the mailboxes on it created with their signatures, display names and warmup already running — instead of making each one by hand in Google and connecting them back one at a time.",
  },
  {
    status: "exploring",
    title: "Outreach that is not only email",
    description:
      "A sequence that can open with a LinkedIn connection, follow with an email, and leave a call task on the day the lead opens it — with replies on any of them stopping the rest, the way they already do for email.",
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
    id: "2026-11-14-dashboard-refresh",
    date: "2026-11-14",
    title: "A clearer sales workspace",
    summary: "More room for your work, clearer numbers and softly illuminated panels in both themes.",
    items: [
      { tag: "improved", title: "Refreshed dashboard", description: "Your workspace keeps the same pages and actions with clearer headings, more spacious navigation and consistent panels. Overview gives your live metrics and attention items more room, on desktop and mobile.", href: "/dashboard" },
    ],
  },
  {
    id: "2026-11-13-agent-research-replies",
    date: "2026-11-13",
    title: "Clearer agent research replies",
    summary: "Read company findings without missing sentences or lists running together.",
    items: [
      { tag: "fixed", title: "Complete, readable findings", description: "Agent replies keep their company-by-company lists and research findings after researching or drafting leads, alongside verified progress counts.", href: "/dashboard/agent/chat" },
    ],
  },
  {
    id: "2026-11-11-agent-lead-lookups",
    date: "2026-11-11",
    title: "Recheck the right leads in agent chat",
    summary: "Switch between lead groups and recheck them without mixing up the results.",
    items: [
      { tag: "fixed", title: "Accurate repeat lookups", description: "When you ask an agent to recheck a lead group, it refreshes that group's leads and remaining draft count. If the lookup limit is reached, it tells you instead of returning another group's leads.", href: "/dashboard/agent/chat" },
    ],
  },
  {
    id: "2026-11-06-ai-assistant-connection",
    date: "2026-11-06",
    title: "Connect Grok, Cursor and other AI assistants",
    summary: "AI assistants that refused to load OutReign's tools can now connect and sign in.",
    items: [
      { tag: "improved", title: "Every outreach email in Unified Inbox", description: "Review drafts, scheduled and queued messages, completed sends and failed emails together, including drafts created by API and connected AI assistants. Older emails are no longer hidden by a fixed list limit.", href: "/dashboard/inbox" },
      { tag: "new", title: "Find and check prospects from connected assistants", description: "The API and connected AI assistants can search for new prospects, find companies, look up people, check email addresses, enrich and research saved leads, score them and draft emails. Your account's permissions, credits and limits still apply; nothing is sent by these new actions.", href: "/connect" },
      { tag: "new", title: "Manage your sales workspace from connected tools", description: "Connected tools can review templates, campaign briefs, objections, signals, mailbox health and results, or update supported targeting, campaign and inbox settings after you confirm the changes.", href: "/connect" },
      { tag: "fixed", title: "AI assistant connection", description: "Assistants such as Grok and Cursor that showed \"failed to load\" for OutReign now connect at api.outreign.io/mcp. Remove the connector, add it again, and sign in.", href: "/connect" },
    ],
  },
  {
    id: "2026-11-05-enriched-filter",
    date: "2026-11-05",
    title: "Filter saved leads by enrichment",
    summary: "See which saved leads are enriched — and which still need it — without scrolling the whole list.",
    items: [
      { tag: "new", title: "Enriched filter", description: "Saved Leads has an Enriched dropdown: show only enriched leads, or only the ones still waiting, so you know exactly where to spend enrichment.", href: "/dashboard/leads/saved" },
    ],
  },
  {
    id: "2026-11-03-integration-connections",
    date: "2026-11-03",
    title: "Webhook connections save correctly",
    summary: "Connect Zapier or Slack without the connection-saving error.",
    items: [
      { tag: "fixed", title: "Save webhook connections", description: "Zapier and Slack webhook settings now save and remain connected when you reload Integrations.", href: "/integrations" },
      { tag: "improved", title: "OutReign API address", description: "API docs, inbound webhook URLs and the AI assistant connection now use api.outreign.io. Existing URLs keep working.", href: "/api-docs" },
    ],
  },
  {
    id: "2026-11-02-research-coverage",
    date: "2026-11-02",
    title: "Research checks another web source",
    summary: "Lead and account research now check an additional web search source alongside existing research, keeping links you can verify.",
    items: [{ tag: "improved", title: "Broader web research", description: "Research combines results from both connected web search sources, removes duplicate links, and continues with existing sources if one is unavailable.", href: "/dashboard/accounts" }],
  },
  {
    id: "2026-11-01-scheduled-email-signatures",
    date: "2026-11-01",
    title: "Scheduled email edits keep your signature",
    summary: "Correct a scheduled email or change its send time without losing your signature logo or clickable links.",
    items: [
      {
        tag: "fixed",
        title: "Signatures and links survive edits",
        description: "The scheduled email editor keeps your formatted message, signature images, and link destinations when you save changes.",
        href: "/dashboard/outreach",
      },
    ],
  },
  {
    id: "2026-10-30-research-sources",
    date: "2026-10-30",
    title: "Research finds its own news and tech signals",
    summary: "Researching a lead now looks up company news and tech-stack changes even if you never enriched it, and account why-now research searches the web for recent, linked news.",
    items: [
      {
        tag: "improved",
        title: "Lead research pulls news and tech changes",
        description: "If a lead has no news or tech-stack signals yet, research checks for them first, so the brief can open on something dated and sourced.",
        href: "/dashboard/outreach",
      },
      {
        tag: "improved",
        title: "Why-now research searches the web",
        description: "Account why-now reasons now include recent news found on the web, each with a link you can check.",
        href: "/dashboard/accounts",
      },
    ],
  },
  {
    id: "2026-10-21-payment-recovery",
    date: "2026-10-21",
    title: "Fixing a payment gives you a fresh start",
    summary: "A recovered payment no longer lets an old card failure cut short your next renewal's grace period.",
    items: [
      {
        tag: "fixed",
        title: "Later renewals keep their payment recovery window",
        description: "After you fix a failed payment, a later card failure gets its own one-day grace period and recovery window instead of immediately moving your account to Free.",
        href: "/settings?tab=billing",
      },
    ],
  },
  {
    id: "2026-10-17-deliverability-honesty",
    date: "2026-10-17",
    title: "A reply stops the sequence, and steers it",
    summary:
      "Replying used to leave the rest of the follow-ups going out. Now a reply ends the sequence, \"try me in March\" holds it until March, and a question comes back with a draft answer. Warmup also reports its inbox placement honestly, and send limits count your actual sends.",
    items: [
      {
        tag: "fixed",
        title: "Replying stops the follow-ups",
        description:
          "A prospect who answered kept receiving the rest of the sequence. The check for it existed, but nothing ever marked the lead as having replied, so it never ran. A reply now ends the sequence on the spot, whatever stage it had reached.",
        href: "/dashboard/outreach",
      },
      {
        tag: "new",
        title: "\"Try me in March\" is heard as March",
        description:
          "When a reply names a time, the sequence pauses and comes back on that date instead of ending or carrying on regardless. A \"not right now\" with no date in it is treated as a no and stops, rather than us picking a date on your behalf.",
        href: "/dashboard/outreach",
      },
      {
        tag: "new",
        title: "A question comes back with an answer drafted",
        description:
          "When a reply asks something, a draft answer is waiting with it, written from their words and ready for you to edit. Nothing is sent for you, and it will not invent a price, a customer name or a number to fill a gap.",
        href: "/dashboard/inbox",
      },
      {
        tag: "fixed",
        title: "Your inbox placement number is real",
        description:
          "When a warmup email landed in spam we recorded that, then moved it to the inbox for you. On the next pass we found it in the inbox and overwrote the original reading, so every mailbox showed perfect placement no matter how much mail was being filtered. Placement is now recorded once, where the message actually arrived, and your reputation score reflects it.",
        href: "/dashboard/deliverability",
      },
      {
        tag: "fixed",
        title: "Warmup keeps to its daily ramp",
        description:
          "Running warmup by hand while the hourly run was already going could send twice the daily target for a mailbox. Each mailbox's allowance is now claimed before anything is sent, so extra runs do nothing instead of doubling the volume. Warmup replies are capped the same way.",
        href: "/dashboard/deliverability",
      },
      {
        tag: "fixed",
        title: "One confirmation email, not one per reload",
        description:
          "Reloading the page after checkout, or opening the confirmation link in a second tab, sent another \"Subscription Confirmed\" email. Platform emails now carry a key that is checked before anything is sent, so a repeat arrives once. Password reset emails are deliberately exempt: asking for another one still sends another one.",
      },
      {
        tag: "fixed",
        title: "Daily send limits count your actual sends",
        description:
          "Your daily limit was checked against a stored counter that could stop moving, most often after a failed payment — so the number on the Outreach page read zero while mail was going out. Both the daily and the monthly limit are now counted from the emails you have actually sent, and an account with no active plan sends on the Free allowance as the billing notice says.",
        href: "/dashboard/outreach",
      },
    ],
  },
  {
    id: "2026-10-16-failed-payments",
    date: "2026-10-16",
    title: "Clearer handling when a payment fails",
    summary:
      "A failed payment now has one day of grace and a one-click fix, and a scheduled email can never be sent twice.",
    items: [
      {
        tag: "billing",
        title: "What happens when your card is declined",
        description:
          "Your plan stays on for one day after a failed payment. After that the account moves to Free until the payment succeeds, and paying restores your plan straight away. We retry the card for three days; if it still hasn't gone through, the subscription ends and the account stays on Free. A bar at the top of the dashboard shows where you are and has a Fix payment button.",
        // Settings is mounted at /settings, not under /dashboard. This arrived
        // pointing at /dashboard/settings, which has no route and lands on Not
        // Found — the one link in the entry someone follows because their card
        // was declined, and the exact dead path the route check was written
        // after two earlier items took.
        href: "/settings",
      },
      {
        tag: "fixed",
        title: "A scheduled email is sent once",
        description:
          "When two send runs overlapped, both could pick up the same queued email and deliver it twice. Each email is now claimed before it is sent, so a prospect receives it once however the sends are scheduled.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Cancelling tells you if it already went",
        description:
          "Cancelling an email that was already on its way said \"cancelled\" and sent it anyway. Cancelling now stops anything that has not started, and says plainly when it is too late rather than claiming otherwise. Editing behaves the same way.",
        href: "/dashboard/outreach",
      },
      {
        tag: "fixed",
        title: "Lead scores no longer quietly stop updating",
        description:
          "If a scoring run was interrupted, the leads it was working on were left in a state nothing picked up again — so their ICP fit and signal scores stayed frozen at whatever they were, with nothing to show it. Interrupted work is now picked up on the next pass.",
        href: "/dashboard/leads/saved",
      },
      {
        tag: "improved",
        title: "Drafts, and the checks on them, use a stronger model",
        description:
          "Writing an email, grading it against the rules, and the research behind the personalisation now all run on a more capable model. The checks matter as much as the writing: a weak grader passes copy a strong writer would not have sent.",
        href: "/dashboard/outreach",
      },
      {
        tag: "improved",
        title: "A long enrich or score run finishes in the background",
        description:
          "Asking the agent to enrich, score or research more leads than one reply could cover used to leave the remainder undone, reported only as \"skipped\". The rest is now queued and worked through in the background, and the agent tells you which leads are still outstanding.",
        href: "/dashboard/agent/chat",
      },
      {
        tag: "improved",
        title: "One busy account no longer holds up everyone else",
        description:
          "Background drafting, scoring and sending took work strictly oldest-first across the whole product, so a large import could sit in front of everybody else's queue. Each account now takes turns, and a small batch is picked up in the same minute it is queued.",
        href: "/dashboard/leads/saved",
      },
      {
        tag: "new",
        title: "Learn your ICP from the deals you have won",
        description:
          "Point the agent at your closed-won deals and it looks for what they have in common — industry, company size, seniority — and offers to write those back into your ICP. It needs a handful of wins before it will say anything, so an early account is told it does not have enough yet rather than given a pattern made of two deals.",
        href: "/dashboard/icp",
      },
    ],
  },
  {
    id: "2026-10-15-working-unsubscribe",
    date: "2026-10-15",
    title: "Every email carries a working unsubscribe",
    summary: "Bulk sends now include an unsubscribe link and header, and opt-outs are per account.",
    items: [
      {
        tag: "fixed",
        title: "Unsubscribing no longer blocks other businesses",
        description:
          "Unsubscribe requests now apply to the account that sent the email, so a prospect opting out of one business's emails is no longer suppressed by every account. Unsubscribe links already in people's inboxes keep working too, instead of being invalidated by the next account that emailed them.",
        href: "/dashboard/outreach",
      },
      {
        tag: "new",
        title: "One-click unsubscribe on every scheduled send",
        description:
          "Emails sent from campaigns and scheduled batches now include a visible unsubscribe link in the footer and a one-click unsubscribe header, the standard Gmail and Yahoo require from bulk senders. Missing it is what gets legitimate mail filed as spam.",
        href: "/dashboard/deliverability",
      },
    ],
  },
  {
    id: "2026-10-14-greeting-flexibility",
    date: "2026-10-14",
    title: "Emails that greet a lead warmly get through",
    summary: "A greeting like \"Hi there,\" or a nickname no longer stops a send.",
    items: [
      {
        tag: "fixed",
        title: "\"Hi there,\" sends",
        description:
          "Emails and bulk campaigns that open with a general greeting, a shortened name like \"Hi Bob\" for Robert, or a title like \"Dr. Lee\" now send normally instead of being held back. A greeting that names the wrong person is still caught before it goes out.",
        href: "/dashboard/outreach",
      },
    ],
  },
  {
    id: "2026-10-10-profile-identity",
    date: "2026-10-10",
    title: "Your name and photo",
    summary: "Personalize the account shown in your sidebar.",
    items: [{ tag: "new", title: "Edit your display name and profile photo", description: "Add, change or remove your photo and choose a display name in Settings → Profile. Your account menu updates as soon as you save.", href: "/settings?tab=profile" }],
  },
  {
    id: "2026-10-09-light-mode",
    date: "2026-10-09",
    title: "A lighter charcoal theme",
    summary: "Switch between deep dark and lighter charcoal with the same video background and visual effects.",
    items: [
      {
        tag: "new",
        title: "Dark or lighter charcoal, your choice",
        description:
          "The sun/moon toggle brightens the same design without hiding the video background or visual effects. Your choice is remembered on this device, so the app opens the way you left it.",
      },
    ],
  },
  {
    id: "2026-10-08-saved-leads-one-page",
    date: "2026-10-08",
    title: "Your whole lead list on one page",
    summary: "Saved Leads no longer splits into pages of 50 — every matching lead is on one scrollable list.",
    items: [
      {
        tag: "improved",
        title: "Scroll instead of paging",
        description:
          "The Saved Leads list now shows all of your leads in one long scroll, however many you have. Search, filters, sorting, export and bulk actions all work across the full list.",
      },
      {
        tag: "new",
        title: "Custom agents can keep your CRM clean",
        description:
          "Custom agent builds have a new CRM group: find bad lead records (missing or invalid emails, duplicates, missing names or companies, stale stages), fix contact details, and create, update or remove pipeline deals.",
        href: "/dashboard/agent/chat",
      },
      {
        tag: "new",
        title: "Agents can work across all of outbound",
        description:
          "Agents can now edit your ICP, pause or resume sequences and individual leads, tag replies, check mailbox health and deliverability alerts, pause a mailbox or change its daily limit, manage templates, objection talk tracks and campaign briefs, and report open and reply rates. Pick any of these when you build a custom agent.",
        href: "/dashboard/agent/chat",
      },
    ],
  },
  {
    id: "2026-09-30-stripe-updates-save",
    date: "2026-09-30",
    title: "Plan and credit updates now save every time",
    summary: "Subscription changes from your payment account apply to your plan and credits immediately.",
    items: [
      {
        tag: "billing",
        title: "Upgrades, downgrades and cancellations no longer miss",
        description:
          "Some plan changes, renewals and cancellations were silently failing to save — leaving your plan, credits or billing dates out of step until someone noticed. They now apply straight away. Prices and credit allowances are unchanged.",
      },
    ],
  },
  {
    id: "2026-09-28-google-sign-in",
    date: "2026-09-28",
    title: "Signing in with Google works again",
    summary: "Choosing your Google account now takes you straight into your dashboard.",
    items: [
      {
        tag: "fixed",
        title: "Google sign-in keeps you signed in",
        description:
          "After picking a Google account you were sometimes sent back to the homepage still signed out. You now land in your dashboard.",
      },
    ],
  },
  {
    id: "2026-09-26-saved-leads-filters",
    date: "2026-09-26",
    title: "Dashboard lead counts open the right leads",
    summary: "Clicking \"no email\" or \"never contacted\" on the dashboard now shows every matching lead.",
    items: [
      {
        tag: "fixed",
        title: "Every matching lead, not just the first page",
        description:
          "The Saved Leads view opened from the dashboard now lists, counts and exports all of those leads across your whole account.",
      },
      {
        tag: "fixed",
        title: "Deleting a full page keeps you in your list",
        description:
          "Deleting every lead on a later page now takes you back to the last page that still has leads.",
      },
    ],
  },
  {
    id: "2026-09-25-stay-signed-in",
    date: "2026-09-25",
    title: "You stay signed in",
    summary: "Coming back to the app no longer signs you out, and your agent's drafting counts are accurate.",
    items: [
      {
        tag: "fixed",
        title: "No more surprise sign-outs",
        description:
          "Returning to OutReign after switching apps or locking your phone no longer sends you back to the login page.",
      },
      {
        tag: "fixed",
        title: "Accurate \"left to draft\" count",
        description:
          "When your agent tells you how many leads still need a draft, that number now covers your whole list.",
      },
      {
        tag: "fixed",
        title: "Settings tabs sit where they should",
        description:
          "On a wide screen the Settings tab list no longer overlaps the page heading, and the tab you open is the tab that's highlighted.",
        href: "/settings",
      },
      {
        tag: "fixed",
        title: "Cancelled batches can be redrafted",
        description:
          "If you cancel a background drafting batch, asking your agent to draft those leads again now works.",
      },
      {
        tag: "improved",
        title: "Select and delete drafts in bulk",
        description:
          "The Drafts list now has row checkboxes and Select all, so you can clear several saved drafts at once.",
        href: "/dashboard/outreach",
      },
    ],
  },
  {
    id: "2026-09-21-replies-and-billing",
    date: "2026-09-21",
    title: "Replies now find you",
    summary:
      "Your monthly search allowance now follows your plan, and replies are picked up from your mailbox without you opening the app.",
    items: [
      {
        tag: "billing",
        title: "Your search allowance matches your plan",
        description:
          "When your plan changes, your monthly search allowance now changes with it. Accounts that were still showing the free allowance after upgrading have been corrected, and anything already used is kept.",
        href: "/dashboard/leads",
      },
      {
        tag: "fixed",
        title: "Replies arrive without opening the inbox",
        description:
          "Your connected mailbox is checked automatically every few minutes, so a prospect's reply lands in your inbox, is available to your agent and can notify your phone without you opening the app.",
        href: "/dashboard/inbox",
      },
      {
        tag: "fixed",
        title: "Cleaner enrichment history on your leads",
        description:
          "Each enrichment now shows as one entry instead of two, and a run that found some details is labelled \"Partly enriched\" rather than \"Failed\".",
        href: "/dashboard/leads",
      },
    ],
  },
  {
    id: "2026-09-19-lead-intelligence",
    date: "2026-09-19",
    title: "Saved leads now tell you who to email first",
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
        href: "/dashboard/leads/saved",
      },
      {
        tag: "new",
        title: "Filter down to the leads worth your morning",
        description:
          "New filters let you show only high-priority leads, or only the ones ready to be emailed, so you can work the top of the list first instead of scrolling.",
        href: "/dashboard/leads/saved",
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
