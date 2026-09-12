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
    id: "2026-09-12",
    date: "2026-09-12",
    title: "What's New, plus a clearer AI SDR story",
    summary:
      "You can now see everything we ship in one place, and the AI SDR has its own home so it's easier to understand what it does for you.",
    items: [
      {
        tag: "new",
        title: "What's New page",
        description:
          "Every improvement, fix and upcoming change in one list. A badge appears in your header whenever there's something you haven't read.",
      },
      {
        tag: "improved",
        title: "AI SDR overview",
        description:
          "A dedicated page walks through how the AI SDR finds people, writes the first touch and follows up, so you know what to hand over to it.",
      },
      {
        tag: "coming",
        title: "Reply-driven follow-ups",
        description:
          "Follow-ups that adapt to how someone replied, instead of running the same steps for everyone.",
      },
    ],
  },
  {
    id: "2026-09-10",
    date: "2026-09-10",
    title: "Follow-ups that actually go out",
    summary:
      "Sequences now keep moving after the first email, and searches respect the seniority you picked.",
    items: [
      {
        tag: "fixed",
        title: "Stuck sequences",
        description:
          "Follow-up emails for enrolled leads no longer stall after the first send — waiting steps are re-checked every hour.",
      },
      {
        tag: "fixed",
        title: "Seniority filter",
        description:
          "Choosing a seniority level now filters correctly even when you search a mix of job titles.",
      },
      {
        tag: "new",
        title: "Service status notices",
        description:
          "If something on our side is degraded, you'll see a short notice at the top of your dashboard instead of guessing.",
      },
    ],
  },
  {
    id: "2026-09-08",
    date: "2026-09-08",
    title: "A smoother start and a smarter coach",
    summary:
      "New accounts get a guided setup, and the AI Sales Coach is available on every paid plan with clear monthly limits.",
    items: [
      {
        tag: "new",
        title: "Guided setup",
        description:
          "A short set of questions builds your ideal customer profile up front, then drops you straight into your first campaign.",
      },
      {
        tag: "improved",
        title: "AI Sales Coach limits",
        description:
          "Each plan now shows exactly how many coaching sessions you get each month, with usage visible on the coach page.",
      },
      {
        tag: "improved",
        title: "Lead imports add, never replace",
        description:
          "Importing a CSV now appends to your saved leads and maps names, emails and LinkedIn URLs properly.",
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
