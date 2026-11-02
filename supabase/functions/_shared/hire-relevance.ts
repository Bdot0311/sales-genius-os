/**
 * Which hires count as a buying signal, for THIS seller.
 *
 * The detector asked one hardcoded question: is this a sales, revops, growth
 * or marketing role? That is the right question for selling outbound tooling
 * and the wrong one for everybody else using the product. Someone selling to
 * engineering leaders got "hiring 4 backend engineers" filed as
 * `hiring_growth` at weight 12 — a third of what the signal was worth to them
 * — while a company's one stale marketing opening scored 30.
 *
 * The data to answer it properly was already there and already filled in.
 * `icp_profiles.hiring_signals` is a field on the ICP page with a MultiSelect
 * of ten options, and until now its only use was being pasted into a model
 * prompt as prose. Nothing read it as a rule.
 *
 * Three tiers, most explicit first:
 *
 *   1. `hiring_signals` — the user said, in a purpose-built field, which hires
 *      matter. Mapped through the same ten options the UI offers.
 *   2. `target_titles` — who they sell to. A company hiring the title you sell
 *      to, or staff under it, is building that function out. Weaker evidence
 *      than (1) but far better than guessing, and more profiles have it.
 *   3. the original go-to-market regex, unchanged, so a user who has filled in
 *      neither sees exactly today's behaviour.
 *
 * Which tier answered is recorded on the signal, because "why is this scored
 * 30" should be answerable without reading this file.
 */

export type RelevanceSource = "icp_hiring_signals" | "icp_target_titles" | "default";

/**
 * The original hardcoded question, kept verbatim as the last fallback.
 *
 * A GTM hire means they are building pipeline, which is the strongest signal
 * for outbound tooling specifically. It is OutReign's own ICP, which is why it
 * is now the default rather than the rule.
 */
export const DEFAULT_GTM_RE =
  /\b(sales|account executive|\bae\b|sdr|bdr|revenue|rev\s?ops|go[-\s]?to[-\s]?market|\bgtm\b|demand gen|growth|marketing|partnership|business development)\b/i;

/** Normalize an option or title for comparison: lowercase, alphanumerics only. */
const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/*
 * The ten options the ICP page offers, each mapped to the titles it means.
 *
 * Keyed on the normalized option text so "Hiring SDRs / BDRs" matches however
 * the punctuation is written. An option added to the UI without an entry here
 * simply contributes nothing, which `hire-relevance.test.ts` fails on rather
 * than letting it silently narrow what a user asked for.
 */
export const HIRING_SIGNAL_TITLE_PATTERNS: ReadonlyArray<{ option: string; titles: RegExp }> = [
  { option: "Hiring SDRs / BDRs", titles: /\b(sdr|bdr|sales development|business development rep)/i },
  { option: "Hiring AEs", titles: /\b(ae|account executive|enterprise sales)\b/i },
  { option: "Hiring Head of Sales / VP Sales", titles: /\b(head of sales|vp of sales|vp sales|sales director|cro|chief revenue)\b/i },
  { option: "Hiring RevOps", titles: /\b(rev\s?ops|revenue operations|sales operations|sales ops)\b/i },
  { option: "Hiring Marketing Ops", titles: /\b(marketing ops|marketing operations|demand gen|growth marketing|lifecycle marketing)\b/i },
  { option: "Hiring Customer Success", titles: /\b(customer success|csm|account manager|onboarding specialist)\b/i },
  { option: "Hiring Engineers (scaling)", titles: /\b(engineer|developer|swe|sre|devops|platform|backend|frontend|full[-\s]?stack)\b/i },
  { option: "Hiring Data team", titles: /\b(data engineer|data scientist|data analyst|analytics engineer|machine learning|\bml\b)\b/i },
  { option: "Hiring Founding [role]", titles: /\bfounding\b/i },
  { option: "Hiring Security / Compliance", titles: /\b(security|compliance|grc|infosec|soc ?2|privacy)\b/i },
];

const BY_OPTION = new Map(HIRING_SIGNAL_TITLE_PATTERNS.map((p) => [key(p.option), p.titles]));

/** Coerce a jsonb column that should hold an array of strings. */
function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A title matched as a whole phrase, with word boundaries only where one can
 * actually hold.
 *
 * `\b` marks a word/non-word transition, so wrapping a title that ends in
 * punctuation — "Engineer (C++)" — in `\b...\b` produces a pattern that can
 * never match anything: after the closing paren there is no word character for
 * the boundary to sit against. Titles are user-typed text, so this is a thing
 * that happens, and it fails silently in the worst way: the seller's own
 * target title matches no posting and the company reads as not hiring.
 */
function titlePattern(title: string): string {
  const left = /^\w/.test(title) ? "\\b" : "";
  const right = /\w$/.test(title) ? "\\b" : "";
  return `${left}${escapeRe(title)}${right}`;
}

export interface IcpRelevanceInput {
  hiring_signals?: unknown;
  target_titles?: unknown;
}

export interface HireRelevance {
  source: RelevanceSource;
  /** Whether a posting title is the kind of hire this seller cares about. */
  isRelevant(title: string): boolean;
  /** What the decision was based on, for the signal's metadata. */
  describe(): string;
}

export function hireRelevance(icp: IcpRelevanceInput | null | undefined): HireRelevance {
  const signals = strings(icp?.hiring_signals);
  const mapped = signals.map((s) => BY_OPTION.get(key(s))).filter((r): r is RegExp => !!r);
  if (mapped.length) {
    return {
      source: "icp_hiring_signals",
      isRelevant: (title) => mapped.some((re) => re.test(title)),
      describe: () => signals.join(", "),
    };
  }

  /*
   * Titles are matched as whole words, not substrings. "AE" inside "Nurse
   * Practitioner" is not an account executive, and a seller targeting "VP of
   * Sales" should not have every posting containing "sales" count — which is
   * exactly the over-matching the default regex is already prone to and the
   * reason this tier anchors on the phrase the user actually typed.
   */
  const titles = strings(icp?.target_titles);
  if (titles.length) {
    const res = titles.map((t) => new RegExp(titlePattern(t), "i"));
    return {
      source: "icp_target_titles",
      isRelevant: (title) => res.some((re) => re.test(title)),
      describe: () => titles.join(", "),
    };
  }

  return {
    source: "default",
    isRelevant: (title) => DEFAULT_GTM_RE.test(title),
    describe: () => "go-to-market roles (no ICP hiring signals or target titles set)",
  };
}
