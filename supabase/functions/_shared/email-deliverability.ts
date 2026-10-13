/**
 * The checks about whether an email ARRIVES, in one place.
 *
 * email-audit.ts owns the writing rules — banned openers, the one-ask rule,
 * unbacked claims, length. It has no opinion on spam-trigger wording, link and
 * image counts, reading grade, all-caps runs, punctuation, you-to-we balance,
 * where the CTA sits, or a signature longer than the email. Those are
 * deliverability and style, and they were implemented three times:
 *
 *   src/lib/email-rubric.ts              computeMechanicalChecks, 11 checks
 *   src/components/outreach/EmailQualityChecker.tsx   12 compute* functions
 *   src/lib/email-quality-checker.ts     a dead fourth copy, zero importers
 *
 * Three copies with three sets of thresholds. The spam list in one had "100%"
 * and the other did not. The word ceiling was 90/130 in one, 75/130 in the
 * second and 50/90/140 on the server. A draft could pass the panel that gates
 * the send and fail the panel directly above it, which is not a disagreement a
 * user can be expected to resolve.
 *
 * So the rules live here, next to the audit, in plain TypeScript with no Deno
 * globals and no remote imports — which is what lets the browser run the exact
 * function the server runs rather than its own approximation of it.
 *
 * Nothing here is ever a blocker. agent-run holds a draft when the audit
 * returns anything that is not a note, and a single link is not a reason to
 * refuse to send an email. Warnings and notes only.
 */

import { closingLine, SUBJECT_MAX_WORDS, type Finding, type Severity } from "./email-audit.ts";

/**
 * Words that land mail in Promotions regardless of who wrote it.
 *
 * The union of the four lists this replaces: the rubric panel's twelve, the
 * quality card's eleven, and the sixteen that agent-run and agent-test each
 * held a private copy of. "100%" was in one, "no obligation", "$$$",
 * "discount" and "cash bonus" in two others, so which words counted depended
 * on which code path happened to look at the email.
 */
export const SPAM_TRIGGERS: string[] = [
  "free", "guarantee", "winner", "congratulations", "act now", "limited time",
  "click here", "earn money", "make money", "risk free", "special promotion",
  "no obligation", "100%", "$$$", "discount", "cash bonus",
];

/** Reading grade above which a cold email stops being skimmable. */
export const GRADE_EASY = 8;
export const GRADE_DENSE = 11;

/** Share of opening clauses that should be about them rather than us. */
export const YOU_RATIO_GOOD = 0.5;
export const YOU_RATIO_WEAK = 0.25;

/** A signature at this share of the body is already too big. */
export const SIGNATURE_SHARE = 0.6;

export { SUBJECT_MAX_WORDS };

export interface DeliverabilityInput {
  subject?: string;
  /** The body as it will be sent, HTML and signature included. */
  body: string;
  /** First touches are held to the stricter image rule. */
  isFirstTouch?: boolean;
}

export interface DeliverabilityMetrics {
  words: number;
  readingGrade: number;
  links: number;
  images: number;
  spamHits: string[];
  capsRuns: number;
  punctuation: number;
  mentionsAttachment: boolean;
  youRatio: number | null;
  subjectWords: number;
  looksLikeHeadline: boolean;
  signatureWords: number;
  bodyWords: number;
}

export interface DeliverabilityReport {
  findings: Finding[];
  metrics: DeliverabilityMetrics;
}

export function stripHtml(s: string): string {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Syllables in a word, for the Flesch-Kincaid grade.
 *
 * One implementation. It existed twice, character for character, in two files
 * that each computed the same grade from it and then disagreed about what the
 * grade meant.
 */
export function countSyllables(raw: string): number {
  let word = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return word.length ? 1 : 0;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return word.match(/[aeiouy]{1,2}/g)?.length ?? 1;
}

/** Flesch-Kincaid grade level, floored at 1. */
export function readingGrade(text: string): number {
  const clean = stripHtml(text);
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const sentences = Math.max(clean.split(/[.!?]+/).filter((s) => s.trim()).length, 1);
  const syllables = words.reduce((n, w) => n + countSyllables(w), 0);
  return Math.max(1, Math.round(0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59));
}

/** Where an HTML signature block starts, or -1. */
function htmlStart(body: string): number {
  return String(body ?? "").search(/<[a-z]/i);
}

/**
 * Whether the ask sits where the eye lands.
 *
 * Returns null when there is no question at all — that is the audit's no_ask
 * rule, and two rules reporting the same absence is how the old panel managed
 * to show "No clear ask detected" and "No question detected — add a CTA" as
 * two separate failures for one missing sentence.
 */
export function ctaPlacement(body: string): "last" | "near" | "buried" | null {
  const text = stripHtml(body);
  if (!text.includes("?")) return null;

  /*
   * The closing line comes from email-audit, so "where the email ends" has one
   * answer. This walked back over sign-offs with its own rules and skipped any
   * line under fifteen characters — which skipped "Worth a look?", thirteen
   * characters and the entire point of the email — and then needed a "near the
   * end" fallback to call its own result acceptable.
   */
  const closing = stripHtml(closingLine(body));
  if (!closing) return null;
  if (closing.includes("?")) return "last";

  // One line above the close still reads as the ask on a phone.
  const lines = String(body ?? "").split("\n").map((l) => stripHtml(l)).filter(Boolean);
  const at = lines.findIndex((l) => l === closing);
  if (at > 0 && lines[at - 1].includes("?")) return "near";
  return "buried";
}

/** Clauses that open on them, over clauses that open on us. Null when neither. */
export function youRatio(text: string): number | null {
  const sentences = stripHtml(text).split(/[.!?]+/).filter((s) => s.trim());
  let me = 0;
  let you = 0;
  for (const s of sentences) {
    const t = s.trim().toLowerCase();
    if (/^(i |we |our )/.test(t) || t.startsWith("i'")) me++;
    if (/^(you |your )/.test(t)) you++;
  }
  return me + you === 0 ? null : you / (me + you);
}

export function deliverabilityReport(input: DeliverabilityInput): DeliverabilityReport {
  const raw = String(input.body ?? "");
  const subject = String(input.subject ?? "").trim();
  const text = stripHtml(raw);
  const words = text.split(/\s+/).filter(Boolean);

  const sigAt = htmlStart(raw);
  const signatureWords = sigAt > -1 ? stripHtml(raw.slice(sigAt)).split(/\s+/).filter(Boolean).length : 0;
  const bodyWords = sigAt > -1 ? stripHtml(raw.slice(0, sigAt)).split(/\s+/).filter(Boolean).length : words.length;

  const lower = `${subject} ${text}`.toLowerCase();
  const subjectWords = subject.split(/\s+/).filter(Boolean).length;

  const metrics: DeliverabilityMetrics = {
    words: words.length,
    readingGrade: readingGrade(raw),
    links: (raw.match(/https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi) ?? []).length + (raw.match(/href\s*=/gi) ?? []).length,
    images: (raw.match(/<img/gi) ?? []).length,
    spamHits: SPAM_TRIGGERS.filter((t) => lower.includes(t)),
    capsRuns: words.filter((w) => /^[A-Z]{3,}$/.test(w)).length,
    punctuation: (text.match(/!{2,}|\?{2,}|!\?|\?!/g) ?? []).length + (text.match(/!/g) ?? []).length,
    mentionsAttachment: /\battach(ed|ment)\b/i.test(text),
    youRatio: youRatio(raw),
    subjectWords,
    looksLikeHeadline: subjectWords > SUBJECT_MAX_WORDS || /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){2,}/.test(subject),
    signatureWords,
    bodyWords,
  };

  const findings: Finding[] = [];
  const add = (rule: string, severity: Severity, evidence: string, why: string, fix: string) =>
    findings.push({ rule, severity, evidence, why, fix });

  if (metrics.spamHits.length) {
    add(
      "spam_trigger",
      metrics.spamHits.length > 2 ? "warning" : "note",
      metrics.spamHits.join(", "),
      "Filters score these words directly, so the email can be perfect and still land in Promotions.",
      "Replace each with the plain business equivalent. Change as few words as possible.",
    );
  }

  if (metrics.links > 0) {
    add(
      "link_count",
      metrics.links > 1 ? "warning" : "note",
      `${metrics.links} link${metrics.links === 1 ? "" : "s"}`,
      "A link in a first touch from a cold domain is the single strongest spam signal a short email can carry.",
      "Describe what you would have linked to and offer to send it in the reply.",
    );
  }

  if (metrics.images > 0) {
    add(
      "image_in_email",
      input.isFirstTouch ? "warning" : "note",
      `${metrics.images} image${metrics.images === 1 ? "" : "s"}`,
      "An image makes the mail look like marketing to both the filter and the reader.",
      "Remove the <img> tags. Plain text from a warmed sender beats a designed template in spam.",
    );
  }

  if (metrics.readingGrade > GRADE_EASY) {
    add(
      "reading_grade",
      metrics.readingGrade > GRADE_DENSE ? "warning" : "note",
      `grade ${metrics.readingGrade}`,
      "A stranger skims on a phone. Dense sentences get abandoned rather than answered.",
      "Split any sentence over twenty words and swap the multi-syllable words for short ones.",
    );
  }

  if (metrics.capsRuns > 0) {
    add(
      "all_caps",
      metrics.capsRuns > 1 ? "warning" : "note",
      `${metrics.capsRuns} all-caps run${metrics.capsRuns === 1 ? "" : "s"}`,
      "Shouting reads as bulk mail and scores as it too.",
      "Use sentence case. If it is an acronym the reader knows, leave it; otherwise spell it out.",
    );
  }

  if (metrics.punctuation > 0) {
    add(
      "heavy_punctuation",
      metrics.punctuation > 1 ? "warning" : "note",
      `${metrics.punctuation} exclamation or repeated mark${metrics.punctuation === 1 ? "" : "s"}`,
      "Enthusiasm a stranger has not earned the right to feel reads as a template.",
      "Cut the exclamation marks. One flat declarative sentence is more credible.",
    );
  }

  if (metrics.mentionsAttachment) {
    add(
      "attachment_mention",
      "note",
      "mentions an attachment",
      "Attachments from an unknown sender are filtered hard, and naming one has the same effect.",
      "Offer to send it in the reply instead.",
    );
  }

  if (metrics.youRatio !== null && metrics.youRatio < YOU_RATIO_GOOD) {
    add(
      "self_focused",
      metrics.youRatio < YOU_RATIO_WEAK ? "warning" : "note",
      `${Math.round(metrics.youRatio * 100)}% of clauses open on them`,
      "The buyer cares about their outcome, not your product. More 'I/we' than 'you' is the clearest tell of a pitch.",
      "Flip the sentence subjects: start from their situation and keep the facts identical.",
    );
  }

  const placement = ctaPlacement(raw);
  if (placement === "buried") {
    add(
      "cta_buried",
      "note",
      "the question is not on the closing line",
      "The eye lands on the last line before the sign-off. An ask above it is read as context, not as a question.",
      "Move the question to the last content line before your name, without rewriting it.",
    );
  }

  if (signatureWords > 0 && bodyWords > 0 && signatureWords > bodyWords * SIGNATURE_SHARE) {
    add(
      "oversized_signature",
      signatureWords > bodyWords ? "warning" : "note",
      `${signatureWords} signature words against ${bodyWords} of body`,
      "A signature block bigger than the message is weight the filter counts and the reader scrolls past.",
      "Shorten the signature in Settings. No edit to the body can fix this one.",
    );
  }

  if (subject && metrics.looksLikeHeadline && metrics.subjectWords <= SUBJECT_MAX_WORDS) {
    // Over the word count the audit's long_subject already says it, with the count.
    add(
      "headline_subject",
      "note",
      `"${subject}"`,
      "Title Case reads as a campaign. An internal note is lower case and specific.",
      "Write it the way you would message a colleague: no capitals, no product name.",
    );
  }

  return { findings, metrics };
}

/** The deliverability findings alone, for callers that only want the rules. */
export function auditDeliverability(input: DeliverabilityInput): Finding[] {
  return deliverabilityReport(input).findings;
}

/**
 * The spam-word gate agent-run and agent-test both used.
 *
 * Each had its own identical copy of this function over its own identical copy
 * of the list. Kept with the same name and the same return shape so the two
 * call sites did not have to change, but there is now one list behind it.
 */
export function deliverabilityCheck(subject: string, body: string): { ok: boolean; hits: string[] } {
  const text = `${subject} ${body}`.toLowerCase();
  const hits = SPAM_TRIGGERS.filter((w) => text.includes(w));
  return { ok: hits.length === 0, hits };
}
