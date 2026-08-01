// Deterministic style-lint for generated cold email touches (Phase 4).
// The generator runs each draft through this; any violation triggers a
// regenerate with the failing rules named. Pure and testable.

export interface StyleLimits {
  maxWords: number;       // per touch body
  maxSubjectWords: number;
}

export const DEFAULT_LIMITS: StyleLimits = { maxWords: 90, maxSubjectWords: 6 };

// Openers that must never appear in a touch.
const BANNED_OPENERS = [
  "i hope this finds you well",
  "hope this finds you well",
  "quick question",
  "circling back",
  "just following up",
  "just checking in",
  "reaching out",
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export interface LintResult {
  ok: boolean;
  violations: string[];
}

export function lintTouch(subject: string, rawBody: string, limits: StyleLimits = DEFAULT_LIMITS): LintResult {
  const body = stripHtml(rawBody);
  const lower = body.toLowerCase();
  const v: string[] = [];

  // em-dashes (unicode or the "--" typographic stand-in)
  if (/[—–]/.test(body) || /\s--\s/.test(body)) v.push("no em-dashes");

  // exclamation points
  if (/!/.test(body)) v.push("no exclamation points");

  // more than one question
  if ((body.match(/\?/g) || []).length > 1) v.push("at most one question per email");

  // "not X but Y" construction
  if (/\bnot\b[^.?!]{1,60}\bbut\b/i.test(body)) v.push("no 'not X but Y' construction");

  // triadic list (classic rule-of-three with an oxford "and")
  if (/\b[\w'-]+,\s+[\w'-]+,\s+and\s+[\w'-]+/i.test(body)) v.push("no triadic lists");

  // bolded lead-ins (markdown bold at the start of a line)
  if (/(^|\n)\s*\*\*[^*]+\*\*\s*[:-]/.test(rawBody)) v.push("no bolded lead-ins");

  // banned openers
  for (const b of BANNED_OPENERS) {
    if (lower.includes(b)) { v.push(`remove the phrase "${b}"`); break; }
  }

  // word ceiling
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > limits.maxWords) v.push(`under ${limits.maxWords} words (currently ${words})`);

  // subject: under N words, sentence case (no headline caps)
  const subjWords = subject.trim().split(/\s+/).filter(Boolean);
  if (subjWords.length >= limits.maxSubjectWords) v.push(`subject under ${limits.maxSubjectWords} words`);

  return { ok: v.length === 0, violations: v };
}
