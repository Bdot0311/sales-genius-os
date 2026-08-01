// Deterministic mechanical checks for Email Quality Checker v2 (Phase 3).
// These run client-side on every keystroke, are stable across runs, and are the
// Free/Starter tier. The R.E.P.L.Y. rubric (Growth+) is scored separately by the
// check-email-rubric edge function. Kept separate from the rubric on purpose.

export type Severity = "ok" | "warn" | "bad";

export interface MechanicalCheck {
  key: string;
  label: string;
  severity: Severity;
  detail: string;
}

export interface MechanicalResult {
  wordCount: number;
  readingGrade: number;
  checks: MechanicalCheck[];
  unresolvedTokens: string[];
}

const SPAM_TRIGGERS = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "earn money", "make money", "risk free", "special promotion", "100%",
];

// Matches unresolved personalization tokens like {{first_name}}, [Company], <name>.
const TOKEN_REGEX = /\{\{\s*[\w. -]+\s*\}\}|\[[\w .-]+\]|<[\w .-]+>/g;
// Tokens that look intentionally personalized vs a stray bracket.
const TOKEN_LIKELY = /name|company|first|last|title|role|industry|city|team/i;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function syllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

export function computeMechanicalChecks(subject: string, rawBody: string): MechanicalResult {
  const body = stripHtml(rawBody);
  const words = body.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = Math.max(body.split(/[.!?]+/).filter((s) => s.trim()).length, 1);
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const readingGrade = Math.max(1, Math.round(0.39 * (wordCount / sentences) + 11.8 * (syl / Math.max(wordCount, 1)) - 15.59));

  const checks: MechanicalCheck[] = [];
  const add = (key: string, label: string, severity: Severity, detail: string) => checks.push({ key, label, severity, detail });

  // word count
  add("word_count", "word count",
    wordCount === 0 ? "bad" : wordCount <= 90 ? "ok" : wordCount <= 130 ? "warn" : "bad",
    wordCount === 0 ? "no body yet" : `${wordCount} words`);

  // reading grade
  add("reading_grade", "reading grade",
    readingGrade <= 8 ? "ok" : readingGrade <= 11 ? "warn" : "bad", `grade ${readingGrade}`);

  // links
  const links = (rawBody.match(/https?:\/\/[^\s<>"']+/gi) || []).length + (rawBody.match(/href\s*=/gi) || []).length;
  add("links", "links", links === 0 ? "ok" : links === 1 ? "warn" : "bad", `${links} link${links === 1 ? "" : "s"}`);

  // images
  const images = (rawBody.match(/<img/gi) || []).length;
  add("images", "images", images === 0 ? "ok" : "warn", `${images} image${images === 1 ? "" : "s"}`);

  // attachment mention (we can't see real attachments, so flag the word as a nudge)
  const attach = /\battach(ed|ment)\b/i.test(body);
  add("attachment", "attachment", attach ? "warn" : "ok", attach ? "mentions an attachment, which hurts cold deliverability" : "no attachment mentioned");

  // spam triggers
  const lower = `${subject} ${body}`.toLowerCase();
  const spamHits = SPAM_TRIGGERS.filter((t) => lower.includes(t));
  add("spam", "spam triggers", spamHits.length === 0 ? "ok" : spamHits.length <= 2 ? "warn" : "bad",
    spamHits.length ? `contains ${spamHits.join(", ")}` : "none");

  // all-caps runs (words of 3+ caps, excluding common acronyms is out of scope, keep simple)
  const caps = words.filter((w) => /^[A-Z]{3,}$/.test(w));
  add("all_caps", "all caps", caps.length === 0 ? "ok" : caps.length <= 1 ? "warn" : "bad",
    caps.length ? `${caps.length} all-caps run${caps.length === 1 ? "" : "s"}` : "none");

  // excessive punctuation
  const punct = (body.match(/!{2,}|\?{2,}|!\?|\?!/g) || []).length + (body.match(/!/g) || []).length;
  add("punctuation", "punctuation", punct === 0 ? "ok" : punct <= 1 ? "warn" : "bad",
    punct ? "heavy or repeated punctuation" : "clean");

  // personalization token coverage + unresolved tokens
  const tokens = rawBody.match(TOKEN_REGEX) || [];
  const unresolved = tokens.filter((t) => TOKEN_LIKELY.test(t));
  add("tokens", "personalization tokens", unresolved.length === 0 ? "ok" : "bad",
    unresolved.length ? `${unresolved.length} unresolved: ${unresolved.join(", ")}` : "no unresolved tokens");

  // subject line length + reads like a subject vs a headline
  const subjWords = subject.trim().split(/\s+/).filter(Boolean).length;
  const looksLikeHeadline = subjWords > 6 || /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){2,}/.test(subject.trim());
  add("subject_length", "subject length",
    subjWords === 0 ? "warn" : subjWords <= 6 ? "ok" : "warn",
    subjWords === 0 ? "no subject yet" : `${subjWords} words`);
  add("subject_style", "subject style", looksLikeHeadline ? "warn" : "ok",
    looksLikeHeadline ? "reads like a headline, aim for an internal-note tone" : "reads like a personal subject");

  return { wordCount, readingGrade, checks, unresolvedTokens: unresolved };
}
