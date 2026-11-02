import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ATS_PROVIDERS,
  BOARD_CACHE_HIT_DAYS,
  BOARD_CACHE_MISS_DAYS,
  boardCacheExpiry,
  boardCacheKey,
  SURGE_MIN_ROLES,
  SURGE_WINDOW_DAYS,
  fetchKnownBoard,
  hiringVelocity,
  probeBoards,
  slugCandidates,
  type JsonFetcher,
} from "../../supabase/functions/_shared/ats-boards.ts";

const DETECTOR = readFileSync(
  new URL("../../supabase/functions/detect-hiring-signals/index.ts", import.meta.url),
  "utf8",
);

/**
 * Finding a company's job board is guesswork from its domain, and the
 * guesswork was the expensive part.
 *
 * Five candidate slugs against three providers is fifteen requests at a 6s
 * timeout, run one after another, so a company with no public board cost up to
 * ninety seconds to answer "not found" — and that answer was recomputed from
 * scratch every single call, because nothing remembered either the board it
 * had just found or the fact that it had looked.
 *
 * Harmless while the only caller was a one-off enrichment. Not harmless the
 * moment anything polls on a schedule.
 */

/**
 * A fetcher backed by a fixture map, which counts what was asked for.
 *
 * `delays` makes a given URL answer late. Without it every probe resolves in
 * the same tick, input order and arrival order coincide, and a test cannot
 * tell "decided by preference" from "decided by whoever replied first".
 */
function fakeFetcher(responses: Record<string, unknown>, delays: Record<string, number> = {}) {
  const asked: string[] = [];
  const fetcher: JsonFetcher = async (url) => {
    asked.push(url);
    const wait = delays[url] ?? 0;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    return url in responses ? responses[url] : null;
  };
  return { fetcher, asked };
}

const ghBody = (titles: string[]) => ({
  jobs: titles.map((t, i) => ({
    id: 100 + i,
    title: t,
    updated_at: "2026-10-01T00:00:00Z",
    absolute_url: `https://boards.greenhouse.io/acme/jobs/${100 + i}`,
  })),
});

describe("probing a company's ATS board", () => {
  it("finds a board and normalizes the postings", async () => {
    const url = ATS_PROVIDERS[0].url("acme");
    const { fetcher } = fakeFetcher({ [url]: ghBody(["Head of Growth", "Backend Engineer"]) });
    const board = await probeBoards(["acme"], fetcher);
    expect(board?.provider).toBe("greenhouse");
    expect(board?.token).toBe("acme");
    expect(board?.jobs.map((j) => j.title)).toEqual(["Head of Growth", "Backend Engineer"]);
    expect(board?.jobs[0].url).toContain("greenhouse.io");
    expect(board?.jobs[0].date).toBe("2026-10-01T00:00:00.000Z");
  });

  it("probes every slug and provider in one pass, not one after another", async () => {
    /*
     * The thing this was restructured for. Three slugs over three providers is
     * nine requests; sequentially each miss costs its own timeout before the
     * next is tried.
     */
    const { fetcher, asked } = fakeFetcher({});
    const board = await probeBoards(["a", "b", "c"], fetcher);
    expect(board).toBeNull();
    expect(asked.length).toBe(3 * ATS_PROVIDERS.length);
  });

  it("an empty board is not a match", async () => {
    /*
     * Measured, not assumed: SmartRecruiters answers 200 with
     * `{"totalFound":0,"content":[]}` for companies it has never heard of, and
     * Greenhouse likewise returns a well-formed empty list. "No jobs" and "no
     * such board" are the same response, so neither can count as found — or
     * the company gets cached under a board that is not theirs.
     */
    const url = ATS_PROVIDERS[0].url("acme");
    const { fetcher } = fakeFetcher({ [url]: { jobs: [] } });
    expect(await probeBoards(["acme"], fetcher)).toBeNull();
  });

  it("the winner is decided by position, never by which reply lands first", async () => {
    /*
     * Parallel probing introduced this risk and it matters: the provider name
     * goes into `signal_events.source` and into the dedupe key, so a company
     * whose provider flips with network timing would re-signal as a new event
     * each poll.
     *
     * Here the SECOND slug answers on provider 1 and the FIRST slug answers on
     * provider 2. Earliest slug wins regardless of provider order within it.
     */
    const preferred = ATS_PROVIDERS[1].url("first");
    const { fetcher } = fakeFetcher(
      {
        [preferred]: [
          { id: "x", text: "AE", createdAt: 1760000000000, hostedUrl: "https://jobs.lever.co/first/x" },
        ],
        [ATS_PROVIDERS[0].url("second")]: ghBody(["SDR"]),
      },
      // The preferred answer arrives LAST. If arrival decided, "second" wins.
      { [preferred]: 40 },
    );
    const board = await probeBoards(["first", "second"], fetcher);
    expect(board?.token, "the earlier slug must win even when it replies last").toBe("first");
    expect(board?.provider).toBe("lever");
  });

  it("within one slug, the provider order decides", async () => {
    const first = ATS_PROVIDERS[0].url("acme");
    const { fetcher } = fakeFetcher(
      {
        [first]: ghBody(["SDR"]),
        [ATS_PROVIDERS[1].url("acme")]: [
          { id: "x", text: "AE", createdAt: 1760000000000, hostedUrl: "https://jobs.lever.co/acme/x" },
        ],
      },
      // Again the preferred provider is the slow one.
      { [first]: 40 },
    );
    const board = await probeBoards(["acme"], fetcher);
    expect(board?.provider).toBe(ATS_PROVIDERS[0].name);
  });

  it("no slugs means no requests", async () => {
    const { fetcher, asked } = fakeFetcher({});
    expect(await probeBoards([], fetcher)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("a thrown fetch is a miss, not a crash", async () => {
    const fetcher: JsonFetcher = async () => {
      throw new Error("socket hang up");
    };
    await expect(probeBoards(["acme"], fetcher)).resolves.toBeNull();
  });
});

describe("re-reading a board already known", () => {
  it("goes straight to that provider and asks nothing else", async () => {
    const url = ATS_PROVIDERS[0].url("acme");
    const { fetcher, asked } = fakeFetcher({ [url]: ghBody(["Head of Growth"]) });
    const board = await fetchKnownBoard("greenhouse", "acme", fetcher);
    expect(board?.jobs).toHaveLength(1);
    expect(asked).toEqual([url]);
  });

  it("an unknown provider name does not throw", async () => {
    const { fetcher, asked } = fakeFetcher({});
    expect(await fetchKnownBoard("some-ats-we-dropped", "acme", fetcher)).toBeNull();
    expect(asked, "a provider we no longer have should cost no request").toEqual([]);
  });

  it("a board that has gone empty reports null, so discovery runs again", async () => {
    const { fetcher } = fakeFetcher({ [ATS_PROVIDERS[0].url("acme")]: { jobs: [] } });
    expect(await fetchKnownBoard("greenhouse", "acme", fetcher)).toBeNull();
  });
});

describe("remembering what discovery cost", () => {
  it("keys on the company, consistently", () => {
    expect(boardCacheKey("https://www.acme.com/careers", "Acme Inc")).toBe(
      boardCacheKey("http://acme.com", "Acme Inc"),
    );
    expect(boardCacheKey("https://acme.com", null)).toContain("ats_board:");
  });

  it("different companies do not share an entry", () => {
    expect(boardCacheKey("https://acme.com", "Acme")).not.toBe(boardCacheKey("https://globex.com", "Globex"));
  });

  it("a found board is remembered for longer than a miss", () => {
    /*
     * Companies rarely change ATS, so a hit keeps. A company with no public
     * board may adopt one, so a miss is remembered only long enough to stop a
     * schedule re-probing it constantly.
     */
    expect(BOARD_CACHE_HIT_DAYS).toBeGreaterThan(BOARD_CACHE_MISS_DAYS);
    const now = Date.parse("2026-10-31T00:00:00.000Z");
    const hit = Date.parse(boardCacheExpiry({ provider: "greenhouse", token: "acme" }, now));
    const miss = Date.parse(boardCacheExpiry({ none: true }, now));
    expect(hit - now).toBe(BOARD_CACHE_HIT_DAYS * 86_400_000);
    expect(miss - now).toBe(BOARD_CACHE_MISS_DAYS * 86_400_000);
    expect(hit).toBeGreaterThan(miss);
  });

  it("a miss still expires, so a company is never written off for good", () => {
    const now = Date.now();
    expect(Date.parse(boardCacheExpiry({ none: true }, now))).toBeGreaterThan(now);
    expect(BOARD_CACHE_MISS_DAYS).toBeLessThanOrEqual(30);
  });
});

describe("the detector uses the cache", () => {
  it("a remembered miss answers without touching the network", () => {
    expect(DETECTOR).toContain("if (cached?.none)");
    const noneAt = DETECTOR.indexOf("if (cached?.none)");
    const probeAt = DETECTOR.indexOf("probeBoards(");
    expect(noneAt, "the early return has to come before any probing").toBeLessThan(probeAt);
  });

  it("a remembered board is read directly before falling back to a probe", () => {
    const knownAt = DETECTOR.indexOf("fetchKnownBoard(");
    const probeAt = DETECTOR.indexOf("probeBoards(");
    expect(knownAt).toBeGreaterThan(-1);
    expect(knownAt).toBeLessThan(probeAt);
  });

  it("what a probe learned is written back, hit or miss", () => {
    expect(DETECTOR).toContain('{ none: true }');
    expect(DETECTOR).toContain('onConflict: "cache_key"');
    expect(DETECTOR).toContain("boardCacheExpiry(value)");
  });

  it("a stale entry is not used", () => {
    // An entry past expires_at must be ignored rather than trusted forever.
    expect(DETECTOR).toContain("new Date(cachedRow.expires_at).getTime() > Date.now()");
  });
});

describe("slug candidates", () => {
  it("derives the domain root and name variants", () => {
    const slugs = slugCandidates("https://www.acme-corp.com/careers", "Acme Corp");
    expect(slugs).toContain("acme-corp");
    expect(slugs).toContain("acmecorp");
  });

  it("ignores a placeholder company name", () => {
    expect(slugCandidates(null, "unknown")).toEqual([]);
  });

  it("drops one-character slugs and caps the list", () => {
    expect(slugCandidates("https://a.com", "A")).toEqual([]);
    expect(slugCandidates("https://averylongcompanyname.com", "A Very Long Company Name").length)
      .toBeLessThanOrEqual(5);
  });

  it("every provider produces a distinct URL for the same slug", () => {
    const urls = ATS_PROVIDERS.map((p) => p.url("acme"));
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(u).toMatch(/^https:\/\//);
  });

  it("every provider has a name usable in a source prefix", () => {
    for (const p of ATS_PROVIDERS) expect(p.name).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe("hiring hard, as distinct from hiring", () => {
  const job = (daysOld: number, title = "Account Executive") => ({
    id: `j${daysOld}`,
    title,
    date: new Date(Date.now() - daysOld * 86_400_000).toISOString(),
    url: null,
  });

  it("counts only postings inside the window", () => {
    const v = hiringVelocity([job(2), job(10), job(29), job(45), job(200)]);
    expect(v.recent).toBe(3);
    expect(v.windowDays).toBe(SURGE_WINDOW_DAYS);
  });

  it("enough recent roles is a surge, a trickle is not", () => {
    expect(hiringVelocity(Array.from({ length: SURGE_MIN_ROLES }, (_, i) => job(i + 1))).surge).toBe(true);
    expect(hiringVelocity(Array.from({ length: SURGE_MIN_ROLES - 1 }, (_, i) => job(i + 1))).surge).toBe(false);
  });

  it("a pile of old roles is not a surge", () => {
    /*
     * The case a standing total gets wrong. Nine roles open says nothing about
     * whether they were posted this month or last year, and `open_roles` is
     * exactly that standing total — which is why the surge is counted on dates
     * instead.
     */
    const v = hiringVelocity([job(120), job(130), job(140), job(150), job(160), job(200)]);
    expect(v.recent).toBe(0);
    expect(v.surge).toBe(false);
  });

  it("a posting dated in the future is bad data, not news", () => {
    const future = { id: "f", title: "AE", date: new Date(Date.now() + 5 * 86_400_000).toISOString(), url: null };
    expect(hiringVelocity([future, job(1), job(2), job(3)]).recent).toBe(3);
  });

  it("an unparseable date is skipped rather than counted as today", () => {
    const bad = { id: "b", title: "AE", date: "not a date", url: null };
    expect(hiringVelocity([bad, job(1)]).recent).toBe(1);
  });

  it("no jobs is no surge", () => {
    const v = hiringVelocity([]);
    expect(v.recent).toBe(0);
    expect(v.surge).toBe(false);
  });

  it("is an absolute count, never a ratio against an earlier window", () => {
    /*
     * This is a correctness property of the INPUT, not a style preference, so
     * it is pinned.
     *
     * An ATS board lists roles that are OPEN. A role posted three months ago
     * and since filled is gone from it, so any earlier window is missing
     * precisely the postings that worked. "Recent versus prior" off a single
     * snapshot therefore reports a surge nearly everywhere, and the bias runs
     * one way — towards the exciting answer.
     *
     * Four roles last month is four roles last month whether or not anything
     * came before, so an empty history must not change the verdict.
     */
    const fourRecent = Array.from({ length: 4 }, (_, i) => job(i + 1));
    const withHistory = [...fourRecent, job(200), job(210), job(220), job(230), job(240)];
    expect(hiringVelocity(fourRecent).surge).toBe(true);
    expect(hiringVelocity(withHistory).surge, "history must not suppress it").toBe(true);
    expect(hiringVelocity(withHistory).recent).toBe(4);
  });

  it("the detector picks the surge type and weights it above a single hire", () => {
    expect(DETECTOR).toContain('velocity.surge ? "hiring_surge"');
    // Above a single GTM hire (30), below a funding round (40).
    expect(DETECTOR).toContain("velocity.surge ? 36 : isGtm ? 30 : 12");
    // Counted on the relevant roles, so it follows whoever the user sells to.
    expect(DETECTOR).toContain("hiringVelocity(relevant)");
  });

  it("the detector records the count the copy needs", () => {
    expect(DETECTOR).toContain("recent_roles: velocity.recent");
    expect(DETECTOR).toContain("window_days: velocity.windowDays");
  });

  it("only one hiring signal is emitted per poll", () => {
    /*
     * toSignalFacts keeps one fact per signal_type, so a surge emitted
     * alongside a plain hiring event would put two sentences about the same
     * job board into one email.
     */
    const assignments = [...DETECTOR.matchAll(/\bsignalType\s*=/g)].length;
    expect(assignments, "one signal type chosen, not several emitted").toBe(1);
    const inserts = [...DETECTOR.matchAll(/\.from\("signal_events"\)\s*\.insert\(/g)].length;
    expect(inserts).toBeLessThanOrEqual(1);
  });
});
