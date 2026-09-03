/**
 * Link-level risk in an email body.
 *
 * Filters read links harder than they read prose. A shortener hides the
 * destination, a fresh domain has no reputation, and a link to a blacklisted
 * domain drags the message down regardless of who sent it. None of this shows
 * up in a spam-word count, which is what most tools check.
 *
 * The parsing and classification here are pure so they can be tested; the DNS
 * and blacklist lookups live in the function that calls them.
 */

export interface FoundLink {
  url: string;
  domain: string;
  /** Where in the body it appeared, so a finding can point at a line. */
  line: number;
}

export type LinkRiskKind =
  | "shortener"
  | "redirect_chain"
  | "raw_ip"
  | "mismatched_anchor"
  | "blacklisted"
  | "new_domain"
  | "excess_links";

export interface LinkFinding {
  kind: LinkRiskKind;
  url: string | null;
  /** What is wrong, and what to do instead. Never just a label. */
  message: string;
  severity: "warning" | "critical";
}

/**
 * Shorteners, which hide the destination from both the filter and the reader.
 * Filters treat them as evasion because that is what they are usually used for.
 */
export const SHORTENER_DOMAINS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly", "is.gd",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc", "lnkd.in",
  "trib.al", "bl.ink", "s.id", "short.io", "t.ly",
]);

/** More than this in a cold first touch reads as a campaign, not a message. */
export const MAX_LINKS_FIRST_TOUCH = 1;

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractLinks(body: string): FoundLink[] {
  const links: FoundLink[] = [];
  const lines = body.split(/\r?\n/);

  lines.forEach((text, index) => {
    const matches = text.match(URL_PATTERN) ?? [];
    for (const raw of matches) {
      // Trailing punctuation is sentence structure, not part of the URL.
      const url = raw.replace(/[.,;:!?]+$/, "");
      let domain = "";
      try {
        domain = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      } catch {
        continue;
      }
      links.push({ url, domain, line: index + 1 });
    }
  });

  return links;
}

export function isShortener(domain: string): boolean {
  return SHORTENER_DOMAINS.has(domain.toLowerCase().replace(/^www\./, ""));
}

/** A bare IP for a host is a spam signature and nothing else. */
export function isRawIp(domain: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(domain) || domain.includes(":");
}

/**
 * Static link findings — everything decidable without a network call.
 *
 * `firstTouch` tightens the link budget: one link in a cold opener is already
 * pushing it, where a reply thread can carry more without looking like a blast.
 */
export function staticLinkFindings(body: string, firstTouch = true): LinkFinding[] {
  const links = extractLinks(body);
  const findings: LinkFinding[] = [];

  for (const link of links) {
    if (isShortener(link.domain)) {
      findings.push({
        kind: "shortener",
        url: link.url,
        severity: "critical",
        message: `Line ${link.line}: ${link.domain} is a link shortener. Filters treat a hidden destination as evasion — use the full URL, or drop the link and offer to send it in a reply.`,
      });
    }

    if (isRawIp(link.domain)) {
      findings.push({
        kind: "raw_ip",
        url: link.url,
        severity: "critical",
        message: `Line ${link.line}: this link points at a bare IP address rather than a domain. Almost nothing legitimate does that, and filters score it accordingly.`,
      });
    }
  }

  const budget = firstTouch ? MAX_LINKS_FIRST_TOUCH : 3;
  if (links.length > budget) {
    findings.push({
      kind: "excess_links",
      url: null,
      severity: links.length > budget + 2 ? "critical" : "warning",
      message: firstTouch
        ? `${links.length} links in a first touch. One is the safe ceiling for a cold opener — every extra link is another reason to filter it. Move the rest into the follow-up.`
        : `${links.length} links. Keep it to three or fewer; past that the message reads as a campaign.`,
    });
  }

  return findings;
}

/** Domains worth resolving, deduplicated and with shorteners already flagged. */
export function domainsToCheck(body: string): string[] {
  return [...new Set(extractLinks(body).map((l) => l.domain))].filter((d) => !isRawIp(d));
}

/** How old a domain has to be before it carries any reputation at all. */
export const NEW_DOMAIN_DAYS = 90;

export function newDomainFinding(domain: string, ageDays: number | null): LinkFinding | null {
  if (ageDays === null || ageDays >= NEW_DOMAIN_DAYS) return null;
  return {
    kind: "new_domain",
    url: domain,
    severity: ageDays < 30 ? "critical" : "warning",
    message: `${domain} was registered ${ageDays} days ago. Domains under ${NEW_DOMAIN_DAYS} days old carry no reputation, and linking to one from cold email is a strong filter signal.`,
  };
}

export function blacklistFinding(domain: string, lists: string[]): LinkFinding | null {
  if (lists.length === 0) return null;
  return {
    kind: "blacklisted",
    url: domain,
    severity: "critical",
    message: `${domain} is listed on ${lists.join(", ")}. Linking to a blacklisted domain damages this message regardless of your own sending reputation — remove the link until it is delisted.`,
  };
}

export function redirectFinding(url: string, hops: string[]): LinkFinding | null {
  if (hops.length < 2) return null;
  return {
    kind: "redirect_chain",
    url,
    severity: hops.length >= 3 ? "critical" : "warning",
    message: `${url} redirects ${hops.length} times before it lands (${hops.join(" → ")}). Filters follow the chain and score the destination, and a chain this long looks like cloaking.`,
  };
}
