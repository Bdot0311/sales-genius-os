/**
 * Product changelog shown on the What's New page.
 *
 * Add newest entries at the TOP. `date` must be an ISO date (YYYY-MM-DD).
 * The header "New" badge appears whenever a customer hasn't opened the page
 * since the most recent entry's date.
 */

export type ChangelogTag = "new" | "improved" | "fixed" | "coming";

export interface ChangelogItem {
  tag: ChangelogTag;
  title: string;
  description: string;
}

export interface ChangelogEntry {
  /** Stable id, used for the anchor link. */
  id: string;
  date: string;
  title: string;
  summary: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: "2026-09-14-3",
    date: "2026-09-14",
    title: "Lead profiles now enrich with one click",
    summary:
      "Enrich & Save pulls in real contact details, job titles, and company info, and your remaining search credits update right away.",
    items: [
      {
        tag: "fixed",
        title: "Enrichment fills in the blanks",
        description:
          "The Enrich & Save button now adds emails, phone numbers, job titles, and company details as you'd expect.",
      },
      {
        tag: "improved",
        title: "Credits update instantly",
        description:
          "Each enrichment uses one search credit, and your credit counter reflects it immediately so you always know where you stand.",
      },
      {
        tag: "fixed",
        title: "Everyone's credits count the same",
        description:
          "Your credit meter now tracks usage consistently across every account type, so the number you see is always accurate.",
      },
    ],
  },
  {
    id: "2026-09-14-2",
    date: "2026-09-14",
    title: "People search results are more accurate, and inbox tests are steadier",
    summary:
      "Looking up a specific person now returns the right person or clearly says no match, and the inbox placement test no longer gives misleading results when a test inbox can't be read.",
    items: [
      {
        tag: "fixed",
        title: "Person lookups return the right person",
        description:
          "Searching by name and company now shows the actual match, or tells you honestly when we can't find anyone.",
      },
      {
        tag: "improved",
        title: "Look before you save",
        description:
          "You'll see what we found before anything is saved to your leads, so you can decide whether to keep it.",
      },
      {
        tag: "improved",
        title: "Credit meter follows your real balance",
        description:
          "Your search credit balance updates as you use it, so the number in the header is always current.",
      },
      {
        tag: "fixed",
        title: "Inbox placement test is more dependable",
        description:
          "If the test inbox can't be read at the moment, you'll get a clear message instead of a confusing result.",
      },
    ],
  },
  {
    id: "2026-09-14",
    date: "2026-09-14",
    title: "Lead searches now finish or tell you why",
    summary:
      "Long searches time out with a clear explanation instead of silently failing, and data-network issues are surfaced so you know to retry later.",
    items: [
      {
        tag: "fixed",
        title: "No more searches that never come back",
        description:
          "Searches now have a firm time limit, so a slow data source can't leave you waiting forever. If a search can't finish, your credit is refunded.",
      },
      {
        tag: "fixed",
        title: "You'll see when the data network is down",
        description:
          "If our lead data partners can't respond, you'll see that directly instead of a blank 'no leads found' page.",
      },
    ],
  },
  {
    id: "2026-09-13",
    date: "2026-09-13",
    title: "Search failures are clearer, and your monthly credits are back in the header",
    summary:
      "When our lead data network is unavailable, we say so plainly, and your monthly search credit count is visible again across all devices.",
    items: [
      {
        tag: "fixed",
        title: "Honest empty searches",
        description:
          "If the data network can't answer, we say so and don't charge a search credit.",
      },
      {
        tag: "fixed",
        title: "Monthly credits in the header",
        description:
          "Your remaining monthly credits show again on desktop, tablet, and mobile.",
      },
      {
        tag: "improved",
        title: "Faster failed searches",
        description:
          "Searches that can't complete now fail quickly instead of hanging until they time out.",
      },
    ],
  },
  {
    id: "2026-09-12",
    date: "2026-09-12",
    title: "A What's New page, plus a clearer look at the AI SDR",
    summary:
      "All product updates now live in one place, and the AI SDR has its own page explaining what it handles for you.",
    items: [
      {
        tag: "new",
        title: "What's New page",
        description:
          "See every new feature, improvement, and fix in one place. A badge appears in the header whenever there's something you haven't read.",
      },
      {
        tag: "improved",
        title: "Easy dashboard return",
        description:
          "A clear Back to dashboard button saves you from hunting for the sidebar or refreshing the page.",
      },
      {
        tag: "improved",
        title: "AI SDR overview",
        description:
          "A dedicated page walks through how the AI SDR finds prospects, writes first touches, and follows up.",
      },
      {
        tag: "coming",
        title: "Reply-driven follow-ups",
        description:
          "Soon, follow-ups will adapt based on how each prospect replies, instead of running the same steps for everyone.",
      },
    ],
  },
  {
    id: "2026-09-10",
    date: "2026-09-10",
    title: "Sequences keep moving, and seniority filters work as expected",
    summary:
      "Follow-up emails now send after the first step, and choosing a seniority level filters correctly across mixed job titles.",
    items: [
      {
        tag: "fixed",
        title: "Stuck sequences",
        description:
          "Follow-up emails for enrolled leads now send on schedule, with waiting steps rechecked every hour.",
      },
      {
        tag: "fixed",
        title: "Seniority filter",
        description:
          "The seniority level you pick now filters correctly, even when you search across many job titles.",
      },
      {
        tag: "new",
        title: "Service status notices",
        description:
          "If anything on our side is slow or down, you'll see a short notice at the top of your dashboard instead of guessing.",
      },
    ],
  },
  {
    id: "2026-09-08",
    date: "2026-09-08",
    title: "A guided setup and clearer AI Sales Coach limits",
    summary:
      "New accounts answer a short setup flow, then land straight in their first campaign. The AI Sales Coach now shows its monthly limit on every paid plan.",
    items: [
      {
        tag: "new",
        title: "Guided setup",
        description:
          "Answer a few questions about your ideal customer, then start your first campaign right away.",
      },
      {
        tag: "improved",
        title: "AI Sales Coach limits",
        description:
          "Each plan shows exactly how many coaching sessions you get each month, with usage right on the coach page.",
      },
      {
        tag: "improved",
        title: "Lead imports add, never replace",
        description:
          "Importing a CSV now appends to your saved leads and maps names, emails, and LinkedIn URLs correctly.",
      },
    ],
  },
];

export const LATEST_CHANGELOG_DATE = CHANGELOG.reduce(
  (latest, entry) => (entry.date > latest ? entry.date : latest),
  "",
);

export const TAG_LABELS: Record<ChangelogTag, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  coming: "Coming soon",
};
