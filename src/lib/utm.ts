/**
 * Canonical UTM tagging for outreign.io links.
 *
 * Two jobs:
 *  1. `buildTaggedLink` — one source of truth for the links we post anywhere
 *     (directories, socials, newsletters, DMs). Used by the admin link builder.
 *  2. `CHANNELS` — the channel presets, so the same post never gets tagged two
 *     different ways and every arrival is attributable even when the referrer is
 *     stripped by a mobile app.
 */

export const SITE_ORIGIN = "https://outreign.io";

export type Channel = {
  id: string;
  label: string;
  utm_source: string;
  utm_medium: string;
  group: "Social" | "Communities" | "Directories" | "Owned" | "Outbound";
};

export const CHANNELS: Channel[] = [
  { id: "x", label: "X / Twitter post", utm_source: "x", utm_medium: "social", group: "Social" },
  { id: "x-bio", label: "X bio link", utm_source: "x", utm_medium: "bio", group: "Social" },
  { id: "x-dm", label: "X DM", utm_source: "x", utm_medium: "dm", group: "Social" },
  { id: "linkedin", label: "LinkedIn post", utm_source: "linkedin", utm_medium: "social", group: "Social" },
  { id: "linkedin-dm", label: "LinkedIn DM", utm_source: "linkedin", utm_medium: "dm", group: "Social" },
  { id: "linkedin-bio", label: "LinkedIn profile link", utm_source: "linkedin", utm_medium: "bio", group: "Social" },
  { id: "instagram", label: "Instagram", utm_source: "instagram", utm_medium: "social", group: "Social" },
  { id: "tiktok", label: "TikTok", utm_source: "tiktok", utm_medium: "social", group: "Social" },
  { id: "youtube", label: "YouTube", utm_source: "youtube", utm_medium: "social", group: "Social" },
  { id: "threads", label: "Threads", utm_source: "threads", utm_medium: "social", group: "Social" },

  { id: "reddit", label: "Reddit", utm_source: "reddit", utm_medium: "community", group: "Communities" },
  { id: "hackernews", label: "Hacker News", utm_source: "hackernews", utm_medium: "community", group: "Communities" },
  { id: "discord", label: "Discord", utm_source: "discord", utm_medium: "community", group: "Communities" },
  { id: "slack", label: "Slack community", utm_source: "slack", utm_medium: "community", group: "Communities" },
  { id: "indiehackers", label: "Indie Hackers", utm_source: "indiehackers", utm_medium: "community", group: "Communities" },
  { id: "facebook-group", label: "Facebook group", utm_source: "facebook", utm_medium: "community", group: "Communities" },

  { id: "producthunt", label: "Product Hunt", utm_source: "producthunt", utm_medium: "directory", group: "Directories" },
  { id: "peerpush", label: "PeerPush", utm_source: "peerpush", utm_medium: "directory", group: "Directories" },
  { id: "uneed", label: "Uneed", utm_source: "uneed", utm_medium: "directory", group: "Directories" },
  { id: "orynth", label: "Orynth", utm_source: "orynth", utm_medium: "directory", group: "Directories" },
  { id: "smollaunchpad", label: "Smol LaunchPad", utm_source: "smollaunchpad", utm_medium: "directory", group: "Directories" },
  { id: "launchigniter", label: "LaunchIgniter", utm_source: "launchigniter", utm_medium: "directory", group: "Directories" },
  { id: "directory-other", label: "Other directory", utm_source: "directory", utm_medium: "directory", group: "Directories" },

  { id: "newsletter", label: "Newsletter / broadcast", utm_source: "newsletter", utm_medium: "email", group: "Owned" },
  { id: "blog", label: "Guest post / blog", utm_source: "blog", utm_medium: "referral", group: "Owned" },
  { id: "podcast", label: "Podcast / interview", utm_source: "podcast", utm_medium: "referral", group: "Owned" },
  { id: "signature", label: "Email signature", utm_source: "signature", utm_medium: "email", group: "Owned" },
  { id: "qr", label: "QR code / print", utm_source: "print", utm_medium: "offline", group: "Owned" },

  { id: "cold-email", label: "Cold email", utm_source: "cold-email", utm_medium: "outbound", group: "Outbound" },
  { id: "affiliate", label: "Partner / affiliate", utm_source: "partner", utm_medium: "referral", group: "Outbound" },
  { id: "ads", label: "Paid ads", utm_source: "ads", utm_medium: "cpc", group: "Outbound" },
];

/** Common landing destinations, so tagged links point somewhere intentional. */
export const DESTINATIONS: Array<{ path: string; label: string }> = [
  { path: "/", label: "Home" },
  { path: "/pricing", label: "Pricing" },
  { path: "/blog", label: "Blog" },
  { path: "/connect", label: "Connect (AI assistants)" },
  { path: "/auth", label: "Sign up" },
];

const slug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

/** Builds one canonical tagged URL. Empty optional parts are omitted. */
export function buildTaggedLink(opts: {
  path?: string;
  source: string;
  medium: string;
  campaign?: string;
  content?: string;
  origin?: string;
}): string {
  const origin = opts.origin || SITE_ORIGIN;
  const path = opts.path && opts.path !== "/" ? opts.path : "/";
  const url = new URL(path, origin);
  url.searchParams.set("utm_source", slug(opts.source));
  url.searchParams.set("utm_medium", slug(opts.medium));
  if (opts.campaign?.trim()) url.searchParams.set("utm_campaign", slug(opts.campaign));
  if (opts.content?.trim()) url.searchParams.set("utm_content", slug(opts.content));
  return url.toString();
}

/** Every channel tagged at once, for a given destination + campaign. */
export function buildAllChannelLinks(path: string, campaign?: string) {
  return CHANNELS.map((c) => ({
    ...c,
    url: buildTaggedLink({ path, source: c.utm_source, medium: c.utm_medium, campaign }),
  }));
}
