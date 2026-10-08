/**
 * The directory badges, and which of them are worth showing near a CTA.
 *
 * There are eighteen. All of them belong in the footer — each is a
 * reciprocal backlink, which is the job they are actually doing — but a wall
 * of eighteen badges beside a call to action does not read as credibility.
 * It reads as "we submitted to every directory that would take us", which is a
 * statement about marketing effort rather than about the product.
 *
 * Trust converts on the authority of the source, not the count of sources. A
 * visitor who recognises one badge is reassured; a visitor shown seventeen they
 * have never heard of starts wondering why so many were needed. So three are
 * promoted and the rest stay where they were.
 *
 * The three are rotated to reflect current launch wins. Right now that is the
 * Microlaunch win, the Smol LaunchPad daily winner badge, and PeerPush. The
 * other listings stay in the footer doing their actual job — the reciprocal link.
 *
 * One thing these are NOT: evidence the product works. A directory listing
 * says the product launched. What a buyer deciding on outbound software wants
 * is placement, reply rate, a named outcome — the numbers the product itself
 * measures. Badges sit alongside that claim; they do not substitute for it.
 */

export interface DirectoryBadge {
  href: string;
  src: string;
  alt: string;
  /** Intrinsic size, so the row reserves space and nothing shifts on load. */
  w: number;
  h: number;
}

/**
 * Shown next to the primary CTA.
 *
 * Currently: the Microlaunch POTD badge, the Smol LaunchPad daily winner badge,
 * and the PeerPush badge. These are the launch wins being highlighted right now.
 */
export const FEATURED_BADGES: DirectoryBadge[] = [
  {
    href: "https://microlaunch.net/p/outreign?utm_source=badge-winner-microlaunch&utm_medium=badge",
    src: "https://wild-dust-0517.microlaunch.workers.dev/badges/potd/ml_potd_badge_v4.svg",
    alt: "Microlaunch - Launch, get feedback, exposure and first customers over a month",
    w: 306,
    h: 96,
  },
  {
    href: "https://smollaunchpad.com/projects/outreign",
    src: "/badges/smol-launchpad-top1-dark.svg",
    alt: "Smol LaunchPad Top 1 Daily Winner",
    w: 210,
    h: 54,
  },
  {
    href: "https://peerpush.com/p/outreign",
    src: "https://peerpush.com/p/outreign/badge.png",
    alt: "OutReign on PeerPush",
    w: 230,
    h: 54,
  },
];

/**
 * Every badge, footer order.
 *
 * The featured three are in here too. A promoted badge still needs its footer
 * link — the reciprocal backlink is the reason most of these exist, and
 * removing it to avoid a duplicate would trade the only measurable benefit
 * they have for tidiness.
 */
export const ALL_BADGES: DirectoryBadge[] = [
  { href: "https://sellwithboost.com", src: "https://sellwithboost.com/badge/listing-dark.svg", alt: "Listed on Sell With Boost", w: 160, h: 40 },
  { href: "https://landingboost.app/badges/top-1", src: "https://landingboost.app/badges/top1-dark.svg", alt: "Top 1% Landing Page — Verified by LandingBoost", w: 200, h: 40 },
  { href: "https://nicklaunches.com/products/salesos/?utm_source=outreign.io&utm_medium=badge&utm_campaign=featured", src: "https://nicklaunches.com/badges/featured-dark.svg", alt: "OutReign on Nick Launches", w: 244, h: 56 },
  { href: "https://rankinpublic.xyz/products/outreign.io", src: "https://rankinpublic.xyz/api/badges/badge-featured.png?site=outreign.io", alt: "Featured on RankInPublic", w: 125, h: 40 },
  FEATURED_BADGES[0],
  { href: "https://launchllama.co?utm_source=badge&utm_medium=referral", src: "https://speaktechenglish.com/wp-content/uploads/2026/04/Screenshot_2026-04-09_at_17.40.44-removebg-preview.png", alt: "Featured on Launch Llama", w: 200, h: 50 },
  { href: "https://launchigniter.com/product/outreign-io?ref=badge-outreign-io", src: "https://launchigniter.com/api/badge/outreign-io?theme=dark", alt: "Featured on LaunchIgniter", w: 212, h: 55 },
  FEATURED_BADGES[1],
  { href: "https://microlaunch.net/p/outreign?utm_source=badge-challenger-microlaunch&utm_medium=badge", src: "https://wild-dust-0517.microlaunch.workers.dev/microlaunch-challenger-badges/ml_challenger_v5.svg", alt: "Microlaunch - Launch, get feedback, exposure and first customers over a month", w: 306, h: 96 },
  { href: "https://launchnest.io/p/outreign", src: "https://launchnest.io/badge/outreign.svg?variant=featured", alt: "OutReign on LaunchNest", w: 220, h: 56 },
  { href: "https://spacerrapps.com/apps/outreign?ref=badge", src: "https://spacerrapps.com/badge/outreign.svg?theme=light", alt: "OutReign is featured on Spacerr", w: 192, h: 54 },
  { href: "https://boostdomainrating.com/item/outreign.io?utm_source=badge", src: "https://boostdomainrating.com/api/badge/outreign.io?color=dark", alt: "OutReign - Domain Rating", w: 212, h: 54 },
  { href: "https://orynth.dev/projects/outreign", src: "https://orynth.dev/api/badge/outreign?theme=dark&style=minimal", alt: "Featured on Orynth", w: 152, h: 48 },
  FEATURED_BADGES[2],
  { href: "https://launchstag.com/p/outreign", src: "https://launchstag.com/badge-dark.svg", alt: "Featured on Launchstag", w: 198, h: 62 },
  { href: "https://www.producthunt.com/products/outreign-io?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-outreign-io", src: "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1174023&theme=dark&t=1781681273997", alt: "OutReign.io - Find who to sell to then close them. | Product Hunt", w: 250, h: 54 },
  { href: "https://www.uneed.best/tool/outreign", src: "https://www.uneed.best/EMBED1B.png", alt: "Featured on Uneed", w: 200, h: 54 },
  { href: "https://scoutforge.net/apps/outreign?ref=badge", src: "https://scoutforge.net/badge/outreign/image?theme=dark&size=default", alt: "OutReign on Scout Forge", w: 300, h: 72 },
  { href: "https://dang.ai", src: "https://assets.dang.ai/badges/dang-verified-dark.png", alt: "Verified on DANG!", w: 260, h: 94 },
  { href: "https://showmyproduct.com/p/outreign-m9yg", src: "https://showmyproduct.com/badge/outreign-m9yg.svg?theme=dark", alt: "On the wall at ShowMyProduct", w: 252, h: 54 },
];
