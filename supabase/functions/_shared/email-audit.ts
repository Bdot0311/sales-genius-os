/**
 * Auditing a cold email against every rule this product knows, on demand.
 *
 * The checks already existed and could not be run. BANNED_PHRASES,
 * findUnverifiedClaims, findPlaceholders, findSenderStandIns and
 * findMirrorAnalogies all live in email-rules.ts, and every one of them only
 * ever fired *inside* generate-email, on copy the model had just written.
 * Paste in an email you wrote yourself, or one a client sent over, and nothing
 * in the product would look at it.
 *
 * That is also why the skills felt inert. Thirteen thousand tokens of
 * frameworks appended to a system prompt is advice the model may or may not
 * take, and nothing afterwards checks whether it did. A tool call is different
 * in kind: the agent has to ask, the answer comes back as findings it must
 * respond to, and the user can see in the transcript that it happened.
 *
 * Two sources feed the rules here. The deterministic half of what
 * generate-email already enforced, now callable; and the structural rules from
 * the six-email sequence guide — word count, one ask, the signal/mechanism
 * bridge, the anti-patterns in the breakup — which were previously prose in a
 * skill file and therefore unenforceable.
 *
 * Everything is deterministic. A model's opinion belongs in the rubric, which
 * already exists; what belongs here is the set of things that are simply true
 * or false about a piece of text, so the same email always audits the same way.
 */

import {
  BANNED_PHRASES,
  findMirrorAnalogies,
  findClippedOpeners,
  findNameMismatches,
  findTouchOnePitch,
  findPlaceholders,
  findSenderStandIns,
  findUnverifiedClaims,
  signOffStartIndex,
} from "./email-rules.ts";

export type Severity = "blocker" | "warning" | "note";

export interface Finding {
  /** Stable id so a caller can suppress or track one rule. */
  rule: string;
  severity: Severity;
  /** What in the email triggered it, quoted. */
  evidence: string;
  /** Why it costs replies, in one sentence. */
  why: string;
  /** What to do instead. */
  fix: string;
}

export interface AuditInput {
  subject?: string;
  body: string;
  /** Proof the sender can actually back, so a figure inside it is not invented. */
  verifiedProof?: string;
  /**
   * Which touch this is, 1-6. Several rules only apply at a position: a first
   * touch may not ask for thirty minutes, a breakup may not manufacture
   * urgency, and touch four is supposed to ask for nothing at all.
   */
  position?: number;
  /**
   * The lead this was written for, so the copy can be checked against the row
   * rather than only against itself. Without it a misspelled company name is
   * invisible to every rule here — which is how "KOgenie" reached a prospect
   * whose company is Kogenie.
   */
  lead?: { company?: string | null; contactName?: string | null };
}

/** Words per email, from the sequence guide: short enough to reply to in one line. */
export const MIN_WORDS = 50;
export const MAX_WORDS = 100;
/** Hard ceiling before length alone stops the email being read on a phone. */
export const HARD_MAX_WORDS = 140;

/** The body with any signature block and PS removed, as lines. */
export function bodyWithoutSignature(body: string): string {
  const lines = String(body ?? "").split(/\r?\n/);
  const idx = signOffStartIndex(lines);
  const kept = idx >= 0 ? lines.slice(0, idx) : lines;
  return kept.join("\n").trim();
}

export function wordCount(text: string): number {
  return (String(text ?? "").trim().match(/\S+/g) ?? []).length;
}

/**
 * The asks in an email.
 *
 * "One call to action per email. Two asks is zero asks" — the prospect
 * resolves the ambiguity by doing nothing, which is the easiest option they
 * were handed. Counting them needs more than counting question marks: "Rough
 * numbers, using your headcount?" is not an ask, and "Let me know" is one
 * without any punctuation at all.
 *
 * A question that offers rather than requests ("Want the one-page breakdown?")
 * still counts as the ask — it IS the call to action — so this counts asks,
 * not requests for time specifically.
 */
export function findAsks(text: string): string[] {
  const clean = bodyWithoutSignature(text);
  const asks: string[] = [];

  // Sentences ending in a question mark, minus rhetorical setups.
  for (const m of clean.matchAll(/[^.!?\n]*\?/g)) {
    const q = m[0].trim();
    if (!q) continue;
    // "Is that something you have covered, or not on the radar yet?" is an ask.
    // "Sound familiar?" as a mid-paragraph aside is too — err toward counting.
    asks.push(q);
  }

  // Imperative asks that carry no question mark.
  const imperative =
    /\b(?:let me know|reply (?:to this|and|with|here)|send me|book (?:a|some) time|grab (?:a|some) time|hop on a (?:call|quick call)|jump on a call|happy to send|shall i send|worth a (?:look|chat|call)|open to (?:a|it))\b[^.!?\n]*/gi;
  for (const m of clean.matchAll(imperative)) {
    const line = m[0].trim();
    // Don't double-count an imperative that sits inside a question already found.
    if (!asks.some((a) => a.includes(line) || line.includes(a))) asks.push(line);
  }

  return asks;
}

/** True when the ask requests a block of the prospect's time. */
const TIME_ASK = /\b(?:(\d{1,3})\s*(?:-|\s)?\s*(?:min(?:ute)?s?|hour)|call|demo|meeting|chat|zoom|calendar|calendly)\b/i;

/**
 * A signal named and then left hanging.
 *
 * "Mentioning the trigger and stopping" is flattery, not relevance. The
 * mechanism — why the observed thing causes the problem — is the bridge from a
 * public event to a private one, and it is the step that separates a
 * personalized email from an automated one that merely looks personalized.
 */
const NOTICED = /\b(?:noticed|saw|see|came across|spotted|read that|congrats on|congratulations on)\b/i;
const MECHANISM = /\b(?:because|which means|so that|usually|tends to|leads to|the reason|that means|which is why|ends up|by the time)\b/i;

/** Manufactured scarcity, which the breakup email must never carry. */
const FALSE_URGENCY =
  /\b(?:last chance|final (?:notice|call|reminder)|act (?:now|fast)|expires? (?:today|tomorrow|soon)|limited time|only \d+ (?:spots?|seats?|slots?) (?:left|remaining)|closing (?:soon|today)|don'?t miss out)\b/i;

/** Every deterministic finding for one email. */
export function auditEmail(input: AuditInput): Finding[] {
  const findings: Finding[] = [];
  const subject = String(input.subject ?? "").trim();
  const rawBody = String(input.body ?? "");
  const body = bodyWithoutSignature(rawBody);
  const position = input.position;
  const add = (f: Finding) => findings.push(f);

  // ─── Things that must never ship ────────────────────────────────────────
  const placeholders = [...findPlaceholders(subject), ...findPlaceholders(rawBody)];
  if (placeholders.length) {
    add({
      rule: "unfilled_placeholder",
      severity: "blocker",
      evidence: placeholders.join(", "),
      why: "A merge field that never got filled tells the reader exactly how this was made.",
      fix: "Replace each token with the real value, or cut the sentence that needed it.",
    });
  }

  const standIns = findSenderStandIns(rawBody);
  if (standIns.length) {
    add({
      rule: "sender_stand_in",
      severity: "blocker",
      evidence: standIns.join(", "),
      why: "The email is signed by nobody.",
      fix: "Put the real sender name and company in the signature.",
    });
  }

  const claims = findUnverifiedClaims(rawBody, input.verifiedProof ?? "");
  if (claims.length) {
    add({
      rule: "unverified_claim",
      severity: "blocker",
      evidence: claims.join("; "),
      why:
        "A result with no number and no named customer reads as proof and is not one. " +
        "In the cost email especially, a figure the prospect can disprove in ten seconds costs the whole sequence.",
      fix: "Name the customer and the real figure, or cut the claim. Vague magnitude is worse than no claim.",
    });
  }

  // ─── Does it match the lead it was written for? ──────────────────────────
  const mismatches = findNameMismatches(rawBody, {
    company: input.lead?.company ?? "",
    contactName: input.lead?.contactName ?? "",
  });
  if (mismatches.length) {
    add({
      rule: "name_mismatch",
      severity: "blocker",
      evidence: mismatches.join("; "),
      why:
        "A misspelled company or a wrong first name is the one error a reader cannot read past. " +
        "It is also the cheapest to catch, because the correct value is already on the lead row.",
      fix: "Copy the name from the lead record exactly, including its capitalisation.",
    });
  }

  // ─── Language that marks it as bulk ──────────────────────────────────────
  const lower = `${subject}\n${rawBody}`.toLowerCase();
  // The literal list, plus the same openers with the subject pronoun dropped.
  // "I noticed" was caught and "Noticed KOgenie is marking..." was not, so the
  // list waved through the more obviously templated of the two.
  const banned = [
    ...BANNED_PHRASES.filter((p) => lower.includes(p.toLowerCase())),
    ...findClippedOpeners(`${subject}\n${rawBody}`),
  ];
  if (banned.length) {
    add({
      rule: "banned_phrase",
      severity: "warning",
      evidence: banned.join(", "),
      why: "These are the phrases every automated email opens with, so they read as one.",
      fix: "Say the specific thing instead. If the sentence only works with the phrase in it, the sentence has no content.",
    });
  }

  const analogies = findMirrorAnalogies(rawBody);
  if (analogies.length) {
    add({
      rule: "mirror_analogy",
      severity: "warning",
      evidence: analogies.join("; "),
      why: "A borrowed metaphor about the prospect's own business reads as filler.",
      fix: "State the observation plainly.",
    });
  }

  // ─── Shape: length, and the one-ask rule ─────────────────────────────────
  const words = wordCount(body);
  if (words > HARD_MAX_WORDS) {
    add({
      rule: "too_long",
      severity: "blocker",
      evidence: `${words} words`,
      why: "Past about a hundred and forty words nobody reads it on a phone, and a stranger will not scroll.",
      fix: `Cut to ${MIN_WORDS}-${MAX_WORDS}. Remove any sentence the email still works without.`,
    });
  } else if (words > MAX_WORDS) {
    add({
      rule: "over_length",
      severity: "warning",
      evidence: `${words} words`,
      why: "A short email asks for a short answer, which is the only kind a stranger gives.",
      fix: `Cut to ${MAX_WORDS} or under. Apply the sentence test: remove any sentence and see if it still works.`,
    });
  } else if (words > 0 && words < MIN_WORDS) {
    add({
      rule: "under_length",
      severity: "note",
      evidence: `${words} words`,
      why: "Under fifty words there is usually no room for both the observation and the bridge to why it matters.",
      fix: "Check the mechanism is actually stated, not just the signal.",
    });
  }

  const asks = findAsks(rawBody);
  if (asks.length > 1) {
    add({
      rule: "two_asks",
      severity: "blocker",
      evidence: asks.join(" | "),
      why: "Two asks is zero asks — the prospect resolves the ambiguity by doing nothing.",
      fix: "Pick the one thing you want and delete the other.",
    });
  }
  if (asks.length === 0 && position !== 4) {
    add({
      rule: "no_ask",
      severity: "warning",
      evidence: "no call to action found",
      why: "Every touch except the pure-value one needs exactly one ask.",
      fix: "Add one, and make it answerable in a single line.",
    });
  }

  // ─── The bridge from signal to problem ───────────────────────────────────
  if (NOTICED.test(body) && !MECHANISM.test(body)) {
    add({
      rule: "signal_without_mechanism",
      severity: "warning",
      evidence: (body.match(new RegExp(`[^.!?\\n]*${NOTICED.source}[^.!?\\n]*`, "i")) ?? [""])[0].trim(),
      why:
        "Naming the trigger and stopping is flattery, not relevance. The mechanism — why that thing causes the problem — " +
        "is the step automated tools consistently miss, which is exactly why it reads as human when it is there.",
      fix: "Add the bridge: the observation, then the problem it usually produces, then why.",
    });
  }

  // ─── The pitch the playbook forbids on a first touch ─────────────────────
  //
  // Fires when this is touch 1, and when no position was given at all: a cold
  // email pasted on its own is a first touch unless the caller says otherwise,
  // and that is exactly the case where nothing was checking.
  if (position === 1 || position === undefined) {
    const pitch = findTouchOnePitch(body);
    if (pitch.length) {
      add({
        rule: "touch_one_pitch",
        severity: "warning",
        evidence: pitch.join(" | "),
        why:
          "Touch 1 earns a reply, it does not sell. Explaining what you do gives the reader " +
          "something to decline before they have any reason to care, and the playbook forbids it outright.",
        fix:
          "Cut the sentence, or imply a better path exists without naming the how — that belongs on touch 2. " +
          "If this is a later touch, pass its position so this rule does not apply.",
      });
    }
  }

  // ─── Position-specific rules ─────────────────────────────────────────────
  if (position === 1) {
    const timeAsk = asks.find((a) => TIME_ASK.test(a));
    const minutes = timeAsk?.match(/(\d{1,3})\s*(?:-|\s)?\s*min/i)?.[1];
    if (minutes && Number(minutes) > 15) {
      add({
        rule: "first_touch_big_ask",
        severity: "warning",
        evidence: timeAsk!,
        why: "Asking a stranger for half an hour on the first touch converts far worse than the smallest viable ask.",
        fix: "Ask for fifteen minutes, or ask for a reply rather than a slot.",
      });
    }
    if (subject && wordCount(subject) > 6) {
      add({
        rule: "long_subject",
        severity: "note",
        evidence: `${wordCount(subject)} words: "${subject}"`,
        why: "A long subject truncates on mobile and reads as marketing.",
        fix: "Six words or fewer. The signal itself is the strongest subject a first touch can carry.",
      });
    }
  }

  if (position === 4 && asks.length > 0) {
    add({
      rule: "value_touch_has_ask",
      severity: "blocker",
      evidence: asks.join(" | "),
      why:
        "The pure-value touch works precisely because it asks for nothing. A sequence that only ever asks becomes " +
        "something the prospect wants to end; the one touch that does not is what buys the next one a hearing.",
      fix: "Remove the ask. Close with 'no reply needed'.",
    });
  }

  if (position === 6 && FALSE_URGENCY.test(rawBody)) {
    add({
      rule: "manufactured_urgency",
      severity: "blocker",
      evidence: (rawBody.match(FALSE_URGENCY) ?? [""])[0],
      why: "Manufactured scarcity in a breakup is the most transparent move in outbound, and it costs the door you were leaving open.",
      fix: "Say you are stopping, and that they can reply to this thread whenever it moves up the list.",
    });
  }

  return findings;
}

/** Highest severity present, or null when the email is clean. */
export function worstSeverity(findings: Finding[]): Severity | null {
  if (findings.some((f) => f.severity === "blocker")) return "blocker";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  if (findings.some((f) => f.severity === "note")) return "note";
  return null;
}

/** One line the agent has to repeat, so a clean audit and a failed one read differently. */
export function auditSummary(findings: Finding[]): string {
  const worst = worstSeverity(findings);
  if (!worst) return "No rule violations found. This one is clear to send on the mechanical checks.";
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return (
    `${blockers} blocker(s) and ${warnings} warning(s). ` +
    (blockers > 0
      ? "Do NOT send this until the blockers are fixed. Report each one to the user in plain language."
      : "Report these to the user before sending.")
  );
}
