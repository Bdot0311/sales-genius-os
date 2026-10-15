/**
 * What the deals you actually won have in common.
 *
 * The play is older than any tool: take the customers who bought, find what
 * they share, and go looking for more of them. It is in the TSG playbook as
 * the ten-accounts rule and in the SaaStr one as the pattern finder, and both
 * say the same thing — reps burn the week on accounts that were never going
 * to close, and the evidence for which ones those are is already sitting in
 * the pipeline.
 *
 * Doing it by asking a model to eyeball a list of companies produces a
 * confident sentence with nothing behind it. This counts.
 *
 * ── What it refuses to do ────────────────────────────────────────────────
 *
 * It will not report a pattern from one or two wins. Two fintech customers
 * is not "we sell to fintech", it is two customers, and an ICP narrowed onto
 * that noise sends every future search in one arbitrary direction. Under the
 * floor it says so and returns nothing to act on.
 *
 * Above the floor it reports a dimension only when enough of the wins agree,
 * and it always returns the counts it decided from, so the number behind the
 * claim is visible rather than implied.
 */

/** One won deal, flattened with the lead it came from. */
export interface WonDealRow {
  deal_id?: string | null;
  company_name?: string | null;
  value?: number | null;
  industry?: string | null;
  company_size?: string | null;
  seniority?: string | null;
  job_title?: string | null;
  country?: string | null;
  technologies?: string[] | null;
}

export interface Tally {
  value: string;
  count: number;
  /** Share of the wins that carry this value, 0-1, of those that said. */
  share: number;
}

export interface WonDealPattern {
  /** How many won deals were read. */
  sampleSize: number;
  /** Whether that is enough to say anything. */
  enough: boolean;
  industries: Tally[];
  companySizes: Tally[];
  seniorities: Tally[];
  titles: Tally[];
  geographies: Tally[];
  technologies: Tally[];
  /** Total value of the wins read, when the deals carried one. */
  wonValue: number;
  /** Plain English, for whoever has to read it. */
  summary: string;
}

/**
 * Fewer than this and there is no pattern, only a coincidence.
 *
 * Five is not a statistical threshold and nothing here pretends it is. It is
 * the point where a shared attribute stops being as likely to be an accident
 * of who answered the phone, and it is low enough that an account with real
 * traction can use this rather than being told to come back later.
 */
export const MIN_WINS = 5;

/**
 * Share of the wins that must agree before a dimension is reported.
 *
 * Counted over the wins that HAVE the field, not all of them: industry is
 * blank on plenty of rows, and letting blanks vote means a dimension fails
 * the bar for being unrecorded rather than for being untrue.
 */
export const MIN_SHARE = 0.4;

const norm = (v: unknown): string => String(v ?? "").trim();

/** Count one field across the wins, strongest first. */
export function tally(rows: WonDealRow[], pick: (r: WonDealRow) => string | string[] | null | undefined): Tally[] {
  const counts = new Map<string, { label: string; n: number }>();
  let withValue = 0;
  for (const row of rows) {
    const raw = pick(row);
    const values = (Array.isArray(raw) ? raw : [raw]).map(norm).filter(Boolean);
    if (!values.length) continue;
    withValue++;
    // One row counts once per distinct value, so a lead listing the same
    // technology twice does not outvote a lead that lists it once.
    for (const v of new Set(values.map((v) => v.toLowerCase()))) {
      const label = values.find((x) => x.toLowerCase() === v) ?? v;
      const seen = counts.get(v);
      if (seen) seen.n++;
      else counts.set(v, { label, n: 1 });
    }
  }
  if (!withValue) return [];
  return [...counts.values()]
    .map(({ label, n }) => ({ value: label, count: n, share: n / withValue }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Only the entries enough of the wins agree on. */
export const agreed = (t: Tally[], minShare = MIN_SHARE): Tally[] => t.filter((x) => x.share >= minShare);

export function wonDealPattern(rows: WonDealRow[]): WonDealPattern {
  const sampleSize = rows.length;
  const enough = sampleSize >= MIN_WINS;

  const industries = agreed(tally(rows, (r) => r.industry));
  const companySizes = agreed(tally(rows, (r) => r.company_size));
  const seniorities = agreed(tally(rows, (r) => r.seniority));
  const titles = agreed(tally(rows, (r) => r.job_title));
  const geographies = agreed(tally(rows, (r) => r.country));
  const technologies = agreed(tally(rows, (r) => r.technologies ?? null));
  const wonValue = rows.reduce((sum, r) => sum + (Number(r.value) || 0), 0);

  return {
    sampleSize,
    enough,
    industries: enough ? industries : [],
    companySizes: enough ? companySizes : [],
    seniorities: enough ? seniorities : [],
    titles: enough ? titles : [],
    geographies: enough ? geographies : [],
    technologies: enough ? technologies : [],
    wonValue,
    summary: summarise(sampleSize, enough, { industries, companySizes, seniorities, titles, geographies }),
  };
}

function summarise(
  sampleSize: number,
  enough: boolean,
  p: { industries: Tally[]; companySizes: Tally[]; seniorities: Tally[]; titles: Tally[]; geographies: Tally[] },
): string {
  if (sampleSize === 0) {
    return "No closed-won deals yet, so there is no pattern to read. This becomes useful once a few have closed.";
  }
  if (!enough) {
    return (
      `Only ${sampleSize} closed-won deal${sampleSize === 1 ? "" : "s"}. ` +
      `That is too few to tell a pattern from a coincidence, so nothing is reported — ` +
      `whatever those ${sampleSize} happen to share is as likely to be chance as a real fit. ` +
      `Come back at ${MIN_WINS}.`
    );
  }
  const parts: string[] = [];
  const say = (t: Tally[], noun: string) => {
    if (!t.length) return;
    const top = t.slice(0, 3);
    parts.push(`${noun} ${top.map((x) => `${x.value} (${x.count} of ${sampleSize})`).join(", ")}`);
  };
  say(p.industries, "industry:");
  say(p.companySizes, "company size:");
  say(p.seniorities, "seniority:");
  say(p.titles, "title:");
  say(p.geographies, "where:");

  if (!parts.length) {
    return (
      `${sampleSize} closed-won deals, and they agree on nothing: no industry, size, seniority, ` +
      `title or country is shared by ${Math.round(MIN_SHARE * 100)}% of them. That is a real answer — ` +
      `either the wins are genuinely varied, or the fields they would be read from are empty on the leads.`
    );
  }
  return `Across ${sampleSize} closed-won deals — ${parts.join("; ")}.`;
}

/**
 * The pattern as a search, for the tool that sources new leads.
 *
 * Deliberately loose. find_leads treats a query as the thing to search for and
 * the saved ICP as what scores the results, so a query built from every
 * dimension at once returns nothing and a query built from the strongest two
 * or three returns a list worth scoring.
 */
export function patternQuery(p: WonDealPattern): string | null {
  if (!p.enough) return null;
  const title = p.titles[0]?.value || p.seniorities[0]?.value;
  const industry = p.industries[0]?.value;
  const size = p.companySizes[0]?.value;
  const where = p.geographies[0]?.value;
  if (!title && !industry) return null;

  const who = title ? `${title}s` : "decision makers";
  const at = industry ? ` at ${industry} companies` : " at companies";
  const sized = size ? ` with ${size} employees` : "";
  const place = where ? ` in ${where}` : "";
  return `${who}${at}${sized}${place}`.replace(/\s+/g, " ").trim();
}

/** The ICP columns this pattern can fill in, and nothing else. */
export function icpPatch(p: WonDealPattern): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!p.enough) return patch;
  const take = (t: Tally[]) => t.slice(0, 5).map((x) => x.value);
  if (p.industries.length) patch.industries = take(p.industries);
  if (p.seniorities.length) patch.seniority_levels = take(p.seniorities);
  if (p.titles.length) patch.target_titles = take(p.titles);
  if (p.geographies.length) patch.geographies = take(p.geographies);
  if (p.technologies.length) patch.tech_stack = take(p.technologies);

  /*
   * Size is a range on the ICP and a label on the lead ("51-200"), so the
   * bounds come from the span the winning sizes actually cover rather than
   * from the single most common one. Narrowing to one bucket would exclude
   * the other wins this pattern was read from.
   */
  const bounds = p.companySizes.flatMap((t) => (t.value.replace(/,/g, "").match(/\d+/g) ?? []).map(Number));
  if (bounds.length) {
    patch.company_size_min = Math.min(...bounds);
    patch.company_size_max = Math.max(...bounds);
  }
  return patch;
}
