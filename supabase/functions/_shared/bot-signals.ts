/**
 * Cheap, server-checkable evidence that a form was filled by a script.
 *
 * None of this is a substitute for a CAPTCHA on the auth endpoint — a
 * determined bot posts straight to the API and never sees the form. It stops
 * the common case: a crawler or a scripted filler that completes every input
 * it can see, instantly, with junk.
 *
 * Every check here is decided on the server. A client-side-only honeypot is
 * decoration.
 */

/**
 * The decoy input. Bots fill inputs by name; people never see this one, so any
 * value in it is proof of a machine. Named to look worth filling.
 */
export const HONEYPOT_FIELD = "company_fax";

/** Nobody reads a form, thinks, and types real answers this fast. */
export const MIN_FILL_SECONDS = 3;
/** A form open for this long is a stale tab, not a submission in progress. */
export const MAX_FILL_SECONDS = 6 * 60 * 60;

export type BotSignal =
  | "honeypot_filled"
  | "submitted_too_fast"
  | "form_expired"
  | "answer_not_meaningful";

export interface BotCheckInput {
  /** Value of the honeypot input, as posted. */
  honeypot?: unknown;
  /** Milliseconds since the form was rendered, as posted. */
  elapsedMs?: unknown;
  /** Free-text answers that a person would have written something real in. */
  answers?: string[];
}

/**
 * An answer that carries no information: one repeated character, a keyboard
 * mash with no vowels, a bare URL, or a stock filler word. Deliberately narrow
 * — a terse real answer ("agencies", "more demos") has to pass.
 */
export function isMeaningfulAnswer(raw: string): boolean {
  const value = raw.trim();
  if (value.length < 3) return false;

  const letters = value.replace(/[^a-z]/gi, "").toLowerCase();
  if (letters.length < 3) return false;

  // One character over and over: "aaaa", "....". Two distinct characters is
  // only suspicious once it runs long — "SaaS" is a real answer.
  const distinct = new Set(value.replace(/\s/g, "")).size;
  if (distinct <= 1) return false;
  if (distinct <= 2 && value.length >= 6) return false;

  // A long letter run with no vowel at all is a mash, not a word.
  if (letters.length >= 6 && !/[aeiouy]/.test(letters)) return false;

  // Keyboard walks, repeated or not: "asdf", "asdfasdf", "qwertyqwerty".
  if (/^(asdf|asdfgh|qwerty|zxcv|jkl|hjkl)+$/i.test(letters)) return false;

  if (/^(test|testing|n\/?a|none|nothing|xxx+)$/i.test(value)) return false;

  // Nothing but a link is a spam payload, not an answer.
  if (/^https?:\/\/\S+$/i.test(value)) return false;

  return true;
}

/** Every automation signal the submission tripped, in reporting order. */
export function botSignals(input: BotCheckInput): BotSignal[] {
  const signals: BotSignal[] = [];

  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    signals.push("honeypot_filled");
  }

  const elapsed = Number(input.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed >= 0) {
    if (elapsed < MIN_FILL_SECONDS * 1000) signals.push("submitted_too_fast");
    else if (elapsed > MAX_FILL_SECONDS * 1000) signals.push("form_expired");
  }

  const answers = input.answers ?? [];
  if (answers.length > 0 && !answers.some((a) => isMeaningfulAnswer(a))) {
    signals.push("answer_not_meaningful");
  }

  return signals;
}

/**
 * What to tell the sender. A honeypot hit gets the same wording as everything
 * else on purpose: naming the trap teaches whoever is probing how to pass it.
 */
export function botRejectionMessage(signals: BotSignal[]): string {
  if (signals.includes("form_expired")) {
    return "This form has been open a while. Please reload the page and send it again.";
  }
  return "That submission didn't look complete. Please fill in the form and try again.";
}
