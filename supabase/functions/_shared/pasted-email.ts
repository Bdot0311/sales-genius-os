/**
 * The email inside a review request, separated from the question around it.
 *
 * The server-side Opus audit was scoring the whole user message. A question
 * such as "is a 30 minute meeting too much?" then counted as a second ask and
 * its words counted toward the length rules, so the findings described the
 * wrapper rather than the paste. This extractor does not invent a boundary:
 * a missing or ambiguous paste is reported as such, and the caller asks
 * instead of auditing text it cannot point at.
 */

import { looksLikePastedEmail } from "./copy-review-intent.ts";

export type PastedEmail =
  | { status: "ready"; subject: string; body: string }
  | { status: "missing"; reason: string }
  | { status: "ambiguous"; reason: string };

const REVIEW_LINE =
  /\b(?:audit|review|critique|what(?:'s| is| are)\s+wrong|what do you think of|how(?:'s| is)\s+this|check\s+(?:this|the|my)|rate\s+(?:this|my)|good enough|any\s+good)\b/i;

const GREETING_RE =
  /(?:^|[:\n?]\s*)((?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear)\s+[A-Z][\w'-]*\s*,)/gm;

const GREETING_LINE = /^(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear)\s+[A-Z][\w'-]*\s*,/;

const SIGN_OFF = /^\s*(?:thanks|cheers|best|regards|sincerely)\b/i;

const SUBJECT_RE = /^[ \t]*subject[ \t]*:[ \t]*(.*)$/gim;

function wordCount(text: string): number {
  return (text.match(/\S+/g) ?? []).length;
}

function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

/** A greeting line that is itself the review question, not the paste. */
function wrapperGreeting(text: string, index: number): boolean {
  const line = lineAt(text, index).trim();
  return GREETING_LINE.test(line) && REVIEW_LINE.test(line);
}

function subjectLines(text: string): Array<{ index: number; value: string; length: number }> {
  return [...text.matchAll(SUBJECT_RE)].map((match) => ({
    index: match.index ?? 0,
    value: match[1].trim(),
    length: match[0].length,
  }));
}

function greetingIndexes(text: string): number[] {
  const indexes: number[] = [];
  for (const match of text.matchAll(GREETING_RE)) {
    const word = match[1];
    const index = (match.index ?? 0) + match[0].length - word.length;
    if (!wrapperGreeting(text, index)) indexes.push(index);
  }
  return indexes;
}

/**
 * A question after the sign-off is the person's question about the email.
 * A P.S. stays: it is part of the paste, even when it asks for time.
 */
function stripTrailingWrapper(body: string): string {
  const lines = body.split("\n");
  let sign = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SIGN_OFF.test(lines[i])) sign = i;
  }
  if (sign < 0) return body.trim();
  let cut = -1;
  for (let i = lines.length - 1; i > sign; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^p\.?\s?s\.?[\s:.-]/i.test(line)) return body.trim();
    const meta = /\b(?:too (?:much|long|big)|this email|the ask|the length|the subject)\b/i;
    const aboutTheAsk = line.endsWith("?") &&
      (REVIEW_LINE.test(line) || (meta.test(line) && /\b(?:min(?:ute)?s?|meeting|call)\b/i.test(line)));
    if (aboutTheAsk) {
      cut = i;
      continue;
    }
    break;
  }
  if (cut < 0) return body.trim();
  return lines.slice(0, cut).join("\n").trim();
}

function ready(subject: string, body: string): PastedEmail {
  const cleaned = stripTrailingWrapper(body);
  if (!cleaned) {
    return {
      status: "missing",
      reason: "The message names an email and does not include a body to audit.",
    };
  }
  return { status: "ready", subject, body: cleaned };
}

export function extractPastedEmail(message: string): PastedEmail {
  const text = String(message ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { status: "missing", reason: "The message is empty." };

  const subjects = subjectLines(text);
  if (subjects.length > 1) {
    return {
      status: "ambiguous",
      reason: "More than one subject line is present, so which email to audit is not determined.",
    };
  }

  const greetings = greetingIndexes(text);
  if (greetings.length > 1) {
    return {
      status: "ambiguous",
      reason: "More than one pasted greeting is present, so which email to audit is not determined.",
    };
  }

  if (subjects.length === 1) {
    const subject = subjects[0];
    const before = text.slice(0, subject.index).trim();
    if (greetings.some((index) => index < subject.index) && looksLikePastedEmail(before)) {
      return {
        status: "ambiguous",
        reason: "A pasted email appears before the subject line as well as after it.",
      };
    }
    return ready(subject.value, text.slice(subject.index + subject.length));
  }

  if (greetings.length === 1) return ready("", text.slice(greetings[0]));

  const parts = text.split(/\n\s*\n/);
  if (parts.length >= 2 && REVIEW_LINE.test(parts[0]) && wordCount(parts[0]) < 40) {
    const rest = parts.slice(1).join("\n\n").trim();
    if (rest && looksLikePastedEmail(rest)) return ready("", rest);
  }

  if (REVIEW_LINE.test(text) || looksLikePastedEmail(text)) {
    return {
      status: "missing",
      reason: "The message asks for a review and does not include a separable subject and body.",
    };
  }
  return {
    status: "ambiguous",
    reason: "The email boundaries in this message are not determined.",
  };
}
