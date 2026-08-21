// Turning detected signals into research facts an email can open on.
//
// The detectors already find the things that actually earn replies — a Form D
// filed last month, a Head of Growth posted three weeks ago, Segment added to
// the stack — and write them to signal_events with a date, a source and rich
// metadata. All of that drove the intent SCORE and none of it reached the COPY,
// which was researched from the company's own website.
//
// A website says the same thing to every visitor and has no timing. It can
// support "they sell payroll software to SMBs"; it cannot support "you posted
// this role three weeks ago". The second is what a reply is built on, and the
// product was already collecting it.
//
// These are rendered deterministically rather than handed to a model to
// summarize. They are verified events with dates and citable sources — passing
// them through a generator could only lose or distort them.

export interface SignalEventRow {
  signal_type: string;
  occurred_at: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SignalFact {
  fact: string;
  source: string;
  /** ISO date of the event, so recency can be judged and stated. */
  occurred_at: string | null;
}

/** How recent an event has to be to be worth opening an email on. Older than
 *  this and "I noticed you just..." stops being true. */
export const SIGNAL_FRESHNESS_DAYS = 120;

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** "three weeks ago", "last month" — how a person would say it. Vague on
 *  purpose past a month: claiming "47 days ago" reads like surveillance. */
export function whenPhrase(iso: string | null): string {
  const d = daysAgo(iso);
  if (d === null || d < 0) return "";
  if (d <= 10) return "in the last week or so";
  if (d <= 21) return "a couple of weeks ago";
  if (d <= 45) return "in the last month";
  if (d <= 90) return "in the last couple of months";
  return "earlier this year";
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Render one event as a fact a rep could say out loud.
 *
 * Returns null when the metadata does not carry enough to say something
 * concrete. A signal that can only produce "they had a hiring signal" is worse
 * than no signal: it invites exactly the vague opener this is meant to replace.
 */
export function signalEventToFact(event: SignalEventRow): SignalFact | null {
  const m = event.metadata ?? {};
  const when = whenPhrase(event.occurred_at);
  const suffix = when ? ` (${when})` : "";

  switch (event.signal_type) {
    case "hiring_surge":
    case "hiring": {
      const role = str(m.top_role);
      if (!role) return null;
      const open = num(m.open_roles);
      const gtm = num(m.gtm_roles);
      const scale = open && open > 1 ? `, ${open} roles open` : "";
      const gtmNote = gtm && gtm > 0 ? `, ${gtm} of them go-to-market` : "";
      return {
        fact: `Posted a ${role} role${scale}${gtmNote}${suffix}`,
        source: str(m.top_role_url) || str(event.source) || "job board",
        occurred_at: event.occurred_at,
      };
    }

    case "funding_raised": {
      const filing = str(m.filing_name) || str(m.headline);
      if (!filing) return null;
      return {
        fact: `Filed ${filing} with the SEC${suffix}`,
        source: str(m.filing_url) || str(event.source) || "SEC EDGAR",
        occurred_at: event.occurred_at,
      };
    }

    case "tech_stack_change": {
      const product = str(m.product);
      if (!product) return null;
      const change = str(m.change).toLowerCase();
      const verb = change.includes("remov") || change.includes("churn") ? "dropped" : "added";
      const category = str(m.category);
      const cat = category ? ` (${category})` : "";
      const competitor = m.competitor === true ? " — a competitor of ours" : "";
      return {
        fact: `${verb === "added" ? "Added" : "Dropped"} ${product}${cat}${competitor}${suffix}`,
        source: str(m.source_url) || str(event.source) || "technographics",
        occurred_at: event.occurred_at,
      };
    }

    default: {
      // News events and anything added later: the headline is the fact.
      const headline = str(m.headline);
      if (!headline) return null;
      return {
        fact: `${headline}${suffix}`,
        source: str(m.source_url) || str(event.source) || "news",
        occurred_at: event.occurred_at,
      };
    }
  }
}

/**
 * The freshest, most distinct facts for a lead.
 *
 * Newest first, one per signal type: three hiring events say the same thing to
 * a reader, and an email that lists them reads like a dossier rather than a
 * note from a person.
 */
export function toSignalFacts(events: SignalEventRow[], limit = 4): SignalFact[] {
  const fresh = events
    .filter((e) => {
      const d = daysAgo(e.occurred_at);
      return d === null || d <= SIGNAL_FRESHNESS_DAYS;
    })
    .sort((a, b) => Date.parse(b.occurred_at ?? "") - Date.parse(a.occurred_at ?? ""));

  const seenType = new Set<string>();
  const out: SignalFact[] = [];
  for (const event of fresh) {
    if (seenType.has(event.signal_type)) continue;
    const fact = signalEventToFact(event);
    if (!fact) continue;
    seenType.add(event.signal_type);
    out.push(fact);
    if (out.length >= limit) break;
  }
  return out;
}
