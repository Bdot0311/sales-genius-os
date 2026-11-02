/**
 * Reading a company's open roles off its public ATS board.
 *
 * Greenhouse, Lever and Ashby all publish a company's postings as JSON with no
 * auth and no setup on the user's side, which is what makes hiring a free
 * signal. Finding WHICH board a company uses is guesswork from its domain, and
 * that guesswork was the expensive part:
 *
 *   - It ran sequentially. Five candidate slugs against three providers is
 *     fifteen requests at a 6s timeout, so a company with no public board cost
 *     up to ninety seconds before answering "not found".
 *   - It was repeated in full on every call. Nothing remembered the board it
 *     had just found, or that it had looked and found nothing.
 *
 * Neither mattered much while the only caller was a one-off enrichment. Both
 * matter immediately once anything re-polls on a schedule.
 *
 * Probing is parallel here, and the winner is chosen by position rather than
 * by whichever request returns first — otherwise the provider a company is
 * recorded under would vary with network timing, and the dedupe key embeds it.
 */

export interface AtsJob {
  id: string;
  title: string;
  /** ISO date the posting went up or was last touched. */
  date: string;
  url: string | null;
}

export interface AtsProvider {
  /** Stable name; it lands in `signal_events.source` as `ats:<name>`. */
  name: string;
  url(slug: string): string;
  parse(data: unknown): AtsJob[];
}

const iso = (v: unknown): string => {
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
};

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/*
 * Only boards whose endpoint and response shape are verified against a live
 * company. A provider added from memory costs a request per lead forever and
 * silently never matches, which is worse than not having it: the detector
 * reports "no public board" either way, and nobody looks again.
 */
export const ATS_PROVIDERS: readonly AtsProvider[] = [
  {
    name: "greenhouse",
    url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    parse: (d) => {
      const jobs = (d as { jobs?: unknown })?.jobs;
      if (!Array.isArray(jobs)) return [];
      return jobs.map((j: Record<string, unknown>) => ({
        id: str(j.id),
        title: str(j.title),
        date: iso(j.updated_at ?? j.first_published),
        url: str(j.absolute_url) || null,
      }));
    },
  },
  {
    name: "lever",
    url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`,
    parse: (d) => {
      if (!Array.isArray(d)) return [];
      return d.map((j: Record<string, unknown>) => ({
        id: str(j.id),
        title: str(j.text),
        date: iso(j.createdAt),
        url: str(j.hostedUrl) || null,
      }));
    },
  },
  {
    name: "ashby",
    url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`,
    parse: (d) => {
      const jobs = (d as { jobs?: unknown })?.jobs;
      if (!Array.isArray(jobs)) return [];
      return jobs.map((j: Record<string, unknown>) => ({
        id: str(j.id) || str(j.jobUrl) || str(j.title),
        title: str(j.title),
        date: iso(j.publishedAt ?? j.updatedAt),
        url: str(j.jobUrl) || null,
      }));
    },
  },
];

/**
 * Candidate board slugs from a company's domain and name.
 *
 * Boards almost always sit at the company's short slug (stripe, ramp, notion),
 * so the domain root plus a couple of name variants finds most of them.
 */
export function slugCandidates(website?: string | null, name?: string | null, limit = 5): string[] {
  const set = new Set<string>();
  if (website) {
    const host = website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const root = host.split(".")[0];
    if (root) {
      set.add(root);
      set.add(root.replace(/-/g, ""));
    }
  }
  if (name) {
    const n = name.trim().toLowerCase();
    if (n && n !== "unknown") {
      const compact = n.replace(/[^a-z0-9]+/g, "");
      const hyphen = n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (compact) set.add(compact);
      if (hyphen) set.add(hyphen);
    }
  }
  return [...set].filter((s) => s.length >= 2).slice(0, limit);
}

export interface DiscoveredBoard {
  provider: string;
  token: string;
  jobs: AtsJob[];
}

/** Fetch one URL and return parsed JSON, or null for anything that is not usable. */
export type JsonFetcher = (url: string) => Promise<unknown | null>;

/**
 * The board for this company, or null.
 *
 * Every slug-provider pair is probed at once and the winner is the one earliest
 * in (slug order, provider order) — the same answer the sequential version
 * gave, without waiting for each miss in turn. Timing does not decide it,
 * because the provider name ends up in `source` and in the dedupe key.
 */
export async function probeBoards(
  slugs: readonly string[],
  fetchJson: JsonFetcher,
  providers: readonly AtsProvider[] = ATS_PROVIDERS,
): Promise<DiscoveredBoard | null> {
  if (!slugs.length) return null;

  /*
   * Built in preference order — every provider for the first slug, then the
   * second slug, and so on — and that order is what decides the winner.
   *
   * `Promise.all` resolves to its inputs' order regardless of which request
   * finished first, so taking the first non-null result IS taking the
   * best-ranked one. There is deliberately no sort here: it would be
   * unreachable code, and a test cannot tell unreachable code from correct
   * code. The guarantee being leaned on is Promise.all's, so it is named.
   */
  const attempts: Array<Promise<DiscoveredBoard | null>> = [];
  for (const slug of slugs) {
    for (const provider of providers) {
      attempts.push(
        (async () => {
          const data = await fetchJson(provider.url(slug)).catch(() => null);
          if (data === null || data === undefined) return null;
          const jobs = provider.parse(data);
          // An empty board is not a match: providers answer 200 with an empty
          // list for a company they have never heard of, so "no jobs" and "no
          // such board" are the same response.
          if (!jobs.length) return null;
          return { provider: provider.name, token: slug, jobs };
        })(),
      );
    }
  }

  return (await Promise.all(attempts)).find((r) => r !== null) ?? null;
}

/** Fetch the postings for a board already known, skipping discovery. */
export async function fetchKnownBoard(
  provider: string,
  token: string,
  fetchJson: JsonFetcher,
  providers: readonly AtsProvider[] = ATS_PROVIDERS,
): Promise<DiscoveredBoard | null> {
  const p = providers.find((x) => x.name === provider);
  if (!p) return null;
  const data = await fetchJson(p.url(token)).catch(() => null);
  if (data === null || data === undefined) return null;
  const jobs = p.parse(data);
  if (!jobs.length) return null;
  return { provider: p.name, token, jobs };
}

/* ---------- discovery cache ---------- */

/** Cache key for what we know about a company's board. */
export function boardCacheKey(website?: string | null, name?: string | null): string {
  const slugs = slugCandidates(website, name);
  return `ats_board:${slugs[0] ?? (name ?? "").trim().toLowerCase()}`;
}

export interface BoardCacheValue {
  provider?: string;
  token?: string;
  /** Set when a full probe found nothing, so the next poll can skip it. */
  none?: boolean;
}

/*
 * A board that was found stays found for a long time; companies do not change
 * ATS often. A company with no public board might adopt one, so a miss is
 * remembered for long enough to stop a schedule re-probing it hourly and not
 * so long that it is written off.
 */
export const BOARD_CACHE_HIT_DAYS = 30;
export const BOARD_CACHE_MISS_DAYS = 7;

export function boardCacheExpiry(value: BoardCacheValue, now = Date.now()): string {
  const days = value.none ? BOARD_CACHE_MISS_DAYS : BOARD_CACHE_HIT_DAYS;
  return new Date(now + days * 86_400_000).toISOString();
}

/* ---------- hiring velocity ---------- */

/**
 * How many roles went up recently.
 *
 * "They are hiring" and "they are hiring hard" are different signals and the
 * detector only ever sent the first. One newest posting decided everything, so
 * a company with one stale opening and a company that posted six roles this
 * month produced the identical event.
 *
 * Deliberately an absolute count over a window, and NOT a comparison against
 * an earlier window, because the input cannot support a comparison. An ATS
 * board lists roles that are OPEN. A role posted three months ago and since
 * filled is simply gone from it, so any earlier window is missing exactly the
 * postings that worked. Counting "recent versus prior" off one snapshot
 * therefore finds a surge almost everywhere — the bias runs one way, towards
 * the answer that looks exciting. A flat threshold on what is observable is
 * worth more than a ratio computed from a number that is systematically short.
 */
export const SURGE_WINDOW_DAYS = 30;

/** Roles in the window before this counts as hiring hard rather than hiring. */
export const SURGE_MIN_ROLES = 4;

export interface HiringVelocity {
  /** Postings dated within the window. */
  recent: number;
  windowDays: number;
  surge: boolean;
}

export function hiringVelocity(
  jobs: readonly AtsJob[],
  now = Date.now(),
  windowDays = SURGE_WINDOW_DAYS,
  minRoles = SURGE_MIN_ROLES,
): HiringVelocity {
  const cutoff = now - windowDays * 86_400_000;
  const recent = jobs.filter((j) => {
    const t = Date.parse(j.date);
    // A posting dated in the future is bad data from the board, not news.
    return Number.isFinite(t) && t <= now && t >= cutoff;
  }).length;
  return { recent, windowDays, surge: recent >= minRoles };
}
