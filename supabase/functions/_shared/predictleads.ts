// Parsing helpers for PredictLeads news events.
//
// Only the News Events dataset is used. Their Technology Detections duplicates
// Bloomberry, which is already wired, cached and tested, and their Job Openings
// duplicates detect-hiring-signals, which reads the same boards for free — so
// this deliberately reaches for the one dataset that fills a gap. The only
// funding signal in the product before this was SEC Form D, which is US-only.
//
// docs.predictleads.com is unreachable from our network, so field names are
// read through alias lists rather than one guessed schema, and the edge
// function logs the shape of the first uncached response so they can be pinned
// from logs. This is the same posture that caught epoch-seconds dates and a
// churn being read as an adoption on the Bloomberry integration.

const norm = (s: unknown): string => (typeof s === "string" ? s.toLowerCase().trim() : "");

const LIST_KEYS = ["data", "news_events", "events", "results", "items", "records"];
const CATEGORY_KEYS = ["category", "event_category", "news_category", "type", "event_type", "kind"];
const TITLE_KEYS = ["title", "headline", "summary", "description", "text", "name"];
const URL_KEYS = ["url", "news_article_url", "article_url", "source_url", "link", "permalink"];
const DATE_KEYS = ["found_at", "published_at", "date", "event_date", "occurred_at", "created_at", "discovered_at"];

/** JSON:API style payloads nest the real record under `attributes`. */
function flatten(item: Record<string, unknown>): Record<string, unknown> {
  const attrs = item.attributes;
  return attrs && typeof attrs === "object" ? { ...item, ...(attrs as Record<string, unknown>) } : item;
}

export function extractEvents(payload: unknown, depth = 0): Record<string, unknown>[] {
  const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
  if (Array.isArray(payload)) return payload.filter(isRec).map(flatten);
  if (!isRec(payload) || depth > 2) return [];
  for (const k of LIST_KEYS) {
    if (Array.isArray(payload[k])) return (payload[k] as unknown[]).filter(isRec).map(flatten);
  }
  for (const k of ["response", "result"]) {
    const inner = extractEvents(payload[k], depth + 1);
    if (inner.length) return inner;
  }
  return [];
}

function pick(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && (v[0] as string).trim()) return (v[0] as string).trim();
  }
  return null;
}

function pickDate(item: Record<string, unknown>, nowMs: number): string | null {
  for (const k of DATE_KEYS) {
    const v = item[k];
    if (typeof v !== "string" && typeof v !== "number") continue;
    // Epoch handling, learned from Bloomberry: Date.parse cannot read one, and a
    // bare year must not decode to 1970.
    const n = typeof v === "number" ? v : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
    if (Number.isFinite(n) && n >= 1e8) {
      const ms = n < 1e11 ? n * 1000 : n;
      if (ms <= nowMs + 86_400_000 && ms >= Date.parse("1990-01-01T00:00:00Z")) return new Date(ms).toISOString();
      continue;
    }
    const t = Date.parse(String(v));
    if (!Number.isNaN(t) && t <= nowMs + 86_400_000) return new Date(t).toISOString();
  }
  return null;
}

/**
 * Category to the signal it becomes, and what it is worth.
 *
 * Calibrated against the ladder already in the product — hiring_growth 12,
 * tech_stack_change 18, hiring_gtm 30, funding_raised 40 — so intent stays
 * comparable across sources rather than this one source dominating.
 *
 * receives_financing deliberately reuses `funding_raised` rather than inventing
 * a parallel type: detect-funding-signals already writes that from SEC Form D,
 * and two names for one event would split it across the scoring engine.
 */
const CATEGORY_SIGNALS: Record<string, { type: string; weight: number }> = {
  receives_financing: { type: "funding_raised", weight: 40 },
  goes_public: { type: "funding_raised", weight: 38 },
  acquires: { type: "company_expansion", weight: 35 },
  merges_with: { type: "company_expansion", weight: 35 },
  hires: { type: "new_executive_hire", weight: 30 },
  promotes: { type: "new_executive_hire", weight: 24 },
  expands_offices: { type: "company_expansion", weight: 25 },
  expands_facilities: { type: "company_expansion", weight: 25 },
  opens_new_location: { type: "company_expansion", weight: 25 },
  increases_headcount_by: { type: "company_expansion", weight: 25 },
  launches: { type: "product_launch", weight: 20 },
  is_developing: { type: "product_launch", weight: 18 },
  partners_with: { type: "partnership", weight: 15 },
  integrates_with: { type: "partnership", weight: 15 },
  signs_new_client: { type: "company_expansion", weight: 14 },
  recognized_as: { type: "company_expansion", weight: 12 },
};

/**
 * Categories that are real events but not buying signals.
 *
 * Layoffs, closures and lawsuits say a company is contracting. Scoring them as
 * intent would put the accounts least able to buy at the top of the queue, so
 * they are dropped rather than given a low weight.
 */
const NEGATIVE_CATEGORIES = new Set([
  "closes_offices", "decreases_headcount_by", "files_suit_against", "has_issues_with",
  "leaves", "goes_out_of_business", "files_for_bankruptcy", "lays_off",
]);

export interface NewsSignal {
  category: string;
  signalType: string;
  weight: number;
  title: string | null;
  url: string | null;
  at: string | null;
}

/** Normalize a news-events payload into scored signals, newest first. */
export function normalizeNewsEvents(payload: unknown, nowMs = Date.now()): NewsSignal[] {
  const out: NewsSignal[] = [];
  const seen = new Set<string>();
  for (const item of extractEvents(payload)) {
    const rawCategory = pick(item, CATEGORY_KEYS);
    if (!rawCategory) continue;
    const category = norm(rawCategory).replace(/[\s-]+/g, "_");
    if (NEGATIVE_CATEGORIES.has(category)) continue;

    const mapped = CATEGORY_SIGNALS[category];
    // An unmapped category is still a real event — PredictLeads adds categories
    // and a silent drop would lose them. It scores at the bottom of the ladder
    // rather than being guessed upward.
    const signalType = mapped?.type ?? "company_news";
    const weight = mapped?.weight ?? 10;

    const title = pick(item, TITLE_KEYS);
    const key = `${category}|${norm(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ category, signalType, weight, title, url: pick(item, URL_KEYS), at: pickDate(item, nowMs) });
  }
  return out.sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0));
}

/** The strongest event inside the window; ties broken by recency. */
export function topSignal(events: NewsSignal[], lookbackDays: number, nowMs = Date.now()): NewsSignal | null {
  const cutoff = nowMs - lookbackDays * 86_400_000;
  const fresh = events.filter((e) => !e.at || Date.parse(e.at) >= cutoff);
  if (!fresh.length) return null;
  return fresh.reduce((best, e) => {
    if (e.weight !== best.weight) return e.weight > best.weight ? e : best;
    return (Date.parse(e.at ?? "") || 0) > (Date.parse(best.at ?? "") || 0) ? e : best;
  });
}
