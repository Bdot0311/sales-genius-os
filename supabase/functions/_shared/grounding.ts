/**
 * Keeping the agent builder from inventing the user's business.
 *
 * The builder turns a sentence like "an agent that follows up with people who
 * opened but didn't reply" into an agent config. Two of those fields —
 * company_context and value_props — are then written into every email that
 * agent ever sends. The prompt says never to invent them. Nothing checked.
 *
 * That is the highest-leverage hallucination in the product: it happens once,
 * silently, at setup, and then contaminates output indefinitely. The user does
 * not see a wrong sentence being generated; they see emails that confidently
 * describe a company that isn't theirs.
 *
 * So generated text is checked against what the user actually supplied. The
 * model may rephrase, compress and tidy — that is useful. It may not introduce
 * facts, and above all it may not introduce numbers.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "help", "helps", "in", "is", "it", "its", "of", "on", "or", "our", "that",
  "the", "their", "them", "they", "this", "to", "we", "with", "you", "your",
  "who", "what", "when", "which", "will", "can", "more", "most", "other",
  "using", "used", "use", "into", "than", "then", "so", "up", "out", "about",
]);

/**
 * Content words, lowercased and stemmed just enough to survive plurals.
 *
 * Hyphens and apostrophes split rather than binding, so "follow-up" lines up
 * with the "follows up" the user wrote. Treating them as one token made an
 * ordinary rephrasing look like invented copy.
 */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().replace(/['\u2019-]/g, " ").match(/[a-z]{3,}/g) ?? [])
    .map((w) => w.replace(/s$/, ""))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Any figure a reader would take as a claim.
 *
 * Percentages, multipliers, money, and plain counts. A generated "helps teams
 * book 3x more meetings" is exactly the sentence that gets into a cold email
 * and cannot be backed when a prospect asks about it.
 */
export function figuresIn(text: string): string[] {
  return text.match(/\b\d+(?:[.,]\d+)?\s*(?:%|x\b|k\b|m\b|bn\b)?|\$\s?\d[\d.,]*/gi) ?? [];
}

export interface GroundingCheck {
  grounded: boolean;
  reason?: "introduces_figures" | "introduces_claims" | "empty";
  /** Words or figures present in the output and absent from every source. */
  novel: string[];
}

/**
 * How much new wording is rephrasing rather than invention.
 *
 * A ratio alone is wrong on short strings: "founder-led outreach in the UK" is
 * a fair compression of what the user said, and two domain words it chose tip
 * any percentage test. So a small absolute allowance applies to everything, and
 * the ratio only takes over once a candidate is long enough for it to mean
 * something.
 *
 * The strict rule is the one on figures, and it is separate from this. That is
 * where the actual harm lives: a fabricated number reaches a prospect and
 * cannot be defended when they ask about it.
 */
const NOVEL_ALLOWANCE = 2;
const NOVEL_SHARE = 0.4;

export function checkGrounded(candidate: string, sources: string[]): GroundingCheck {
  const text = candidate.trim();
  if (!text) return { grounded: false, reason: "empty", novel: [] };

  const sourceText = sources.filter(Boolean).join(" \n ");
  const sourceWords = new Set(contentWords(sourceText));
  const sourceFigures = new Set(figuresIn(sourceText).map((f) => f.replace(/\s/g, "").toLowerCase()));

  // Figures are judged strictly. A number the user never gave is a fabricated
  // proof point regardless of how well the surrounding sentence matches.
  const novelFigures = figuresIn(text).filter(
    (f) => !sourceFigures.has(f.replace(/\s/g, "").toLowerCase()),
  );
  if (novelFigures.length > 0) {
    return { grounded: false, reason: "introduces_figures", novel: novelFigures };
  }

  const words = contentWords(text);
  if (words.length === 0) return { grounded: true, novel: [] };

  const novel = [...new Set(words.filter((w) => !sourceWords.has(w)))];
  const budget = Math.max(NOVEL_ALLOWANCE, words.length * NOVEL_SHARE);

  return novel.length <= budget
    ? { grounded: true, novel }
    : { grounded: false, reason: "introduces_claims", novel };
}

/** Keep the grounded entries, and say how many were dropped. */
export function keepGrounded(
  candidates: string[],
  sources: string[],
): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const candidate of candidates) {
    if (checkGrounded(candidate, sources).grounded) kept.push(candidate);
    else dropped.push(candidate);
  }
  return { kept, dropped };
}
