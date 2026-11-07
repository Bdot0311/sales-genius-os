/**
 * Claims a draft makes about a prospect, checked against text that was
 * actually supplied.
 *
 * Word overlap is not this check. A sentence can reuse a page's nouns and
 * still be false, and a paraphrase of the sender's own offer can share none
 * of those nouns and still be fair to send. What is checked is a specific
 * kind of claim: an event, a quantity, a "this just happened" time, or a pain
 * stated as something already known about this company.
 *
 * A role-and-industry question does not make that kind of claim. It is
 * allowed when research is empty. That is the email the product can still
 * write without pretending it studied the account.
 */

export interface ClaimHit {
  rule: "ungrounded_prospect_claim";
  evidence: string;
  why: string;
}

const EVENT_STEMS = [
  "raised",
  "raising",
  "hired",
  "hiring",
  "launched",
  "launching",
  "shipped",
  "announced",
  "expanded",
  "acquired",
  "acquisition",
] as const;

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  dozen: "12",
};

const NEGATION =
  /\b(?:not|no|never|without|didn'?t|did not|don'?t|do not|hasn'?t|has not|haven'?t|have not|isn'?t|is not|aren'?t|are not)\b/i;

const PAIN_AS_KNOWN =
  /\b(?:you(?:'re| are) (?:struggling|dealing|fighting|drowning|losing|stuck)|your (?:team|reps|sdrs) (?:are|is) (?:struggling|drowning|losing|stuck|spending)|your pipeline is (?:stuck|broken|leaking)|i know (?:you|your))\b/i;

const FAMILIAR =
  /\b(?:congrats(?:ulations)?|i noticed|i saw|i read|came across|your recent|your latest)\b/i;

const FUNDING = /\b(?:funding|series\s+[a-e]|new round)\b/i;

const IMMEDIATE_TIME =
  /\b(?:yesterday|this morning|last night|earlier today|just now)\b/i;

/**
 * A rate or a habit stated as known, with no source in the corpus.
 * "Usually" and "most teams" are claims. A question that does not use them
 * is not. A sentence that labels itself a hypothesis is not stated as fact.
 */
export const PREVALENCE_SOURCE =
  "\\b(?:usually|typically|tend(?:s)? to|most (?:teams|companies|founders|reps|brokers|operators)|the majority)\\b";
const PREVALENCE = new RegExp(PREVALENCE_SOURCE, "i");

/** An outcome stated as the mechanism, rather than asked about. */
export const CAUSAL_SOURCE =
  "\\b(?:is where it dies|dies here|kills (?:your|the|their)|causes (?:your|the|their))\\b";
const CAUSAL_OUTCOME = new RegExp(CAUSAL_SOURCE, "i");

const INSTRUCTION_LINE =
  /ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:the |all )?(?:above|previous)|you are now|system prompt|do not follow the rules/i;

function sentences(text: string): string[] {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function stemIn(text: string): string | null {
  const lower = text.toLowerCase();
  return EVENT_STEMS.find((stem) => new RegExp(`\\b${stem}\\b`, "i").test(lower)) ?? null;
}

/** A negation sitting just before the stem. "did not raise" does not support "you raised". */
function stemIsNegated(sentence: string, stem: string): boolean {
  const match = sentence.toLowerCase().match(new RegExp(`\\b${stem}\\b`));
  if (!match || match.index == null) return false;
  const before = sentence.slice(Math.max(0, match.index - 48), match.index);
  return NEGATION.test(before);
}

function quantities(sentence: string): string[] {
  const found = new Set<string>();
  // A two-minute ask is the call to action, not a fact about the company.
  const withoutDuration = sentence.replace(/\b\d+\s*-?\s*(?:min(?:ute)?s?|secs?|seconds?|hours?)\b/gi, " ");
  for (const match of withoutDuration.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)) {
    found.add(match[0].replace(/,/g, ""));
  }
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(withoutDuration)) found.add(digit);
  }
  return [...found];
}

function corpusHasQuantity(corpus: string, quantity: string): boolean {
  const digits = corpus.match(/\b\d[\d,]*(?:\.\d+)?\b/g)?.map((value) => value.replace(/,/g, "")) ?? [];
  if (digits.includes(quantity)) return true;
  return Object.entries(NUMBER_WORDS).some(
    ([word, digit]) => digit === quantity && new RegExp(`\\b${word}\\b`, "i").test(corpus),
  );
}

/**
 * Whether one sentence's event is backed by a non-negated sentence in the corpus.
 * The corpus sentence has to carry the same stem. Sharing other nouns is not enough.
 */
function eventBacked(sentence: string, corpus: string): boolean {
  const stem = stemIn(sentence);
  if (!stem) return true;
  if (stemIsNegated(sentence, stem)) return true;
  return sentences(corpus).some((source) => {
    if (!new RegExp(`\\b${stem}\\b`, "i").test(source)) return false;
    return !stemIsNegated(source, stem);
  });
}

function push(hits: ClaimHit[], evidence: string, why: string) {
  const clean = evidence.trim();
  if (!clean) return;
  if (hits.some((hit) => hit.evidence.toLowerCase() === clean.toLowerCase())) return;
  hits.push({ rule: "ungrounded_prospect_claim", evidence: clean, why });
}

/**
 * Prospect-specific claims in `text` that `corpus` does not back.
 *
 * `corpus` is research, signals, and the lead record. It is not the sender's
 * offer. "We raised a round" in the offer does not make "you raised" true.
 */
export function unsupportedClaims(text: string, corpus: string): ClaimHit[] {
  const hits: ClaimHit[] = [];
  const source = String(corpus ?? "");
  for (const sentence of sentences(text)) {
    const aboutThem = /\b(?:you|your)\b/i.test(sentence) || FAMILIAR.test(sentence);
    const stem = stemIn(sentence);
    const funding = FUNDING.test(sentence);
    const fundingBacked = sentences(source).some((item) => FUNDING.test(item) && !NEGATION.test(item));
    if (aboutThem && stem && !stemIsNegated(sentence, stem) && !eventBacked(sentence, source)) {
      push(
        hits,
        sentence,
        "This states an event about the company, and no supplied research says that event happened.",
      );
    } else if (aboutThem && funding && !stem && !fundingBacked) {
      push(
        hits,
        sentence,
        "This treats a funding event as known, and no supplied research says that.",
      );
    } else if (aboutThem && FAMILIAR.test(sentence) && !stem && !funding) {
      push(
        hits,
        sentence,
        "This says the sender saw something specific, and no supplied research names it.",
      );
    }
    if (aboutThem) {
      for (const quantity of quantities(sentence)) {
        if (!corpusHasQuantity(source, quantity)) {
          push(
            hits,
            sentence,
            "This puts a quantity on the company or the result, and that quantity was not supplied.",
          );
        }
      }
    }
    const pain = sentence.match(PAIN_AS_KNOWN);
    if (pain && !source.toLowerCase().includes(pain[0].toLowerCase())) {
      push(
        hits,
        sentence,
        "This states a pain as something already known about them. Nothing supplied says that.",
      );
    }
    const when = sentence.match(IMMEDIATE_TIME);
    if (when && !source.toLowerCase().includes(when[0].toLowerCase())) {
      push(hits, sentence, "This says something happened at a specific recent time the research does not.");
    }

    // A labeled hypothesis is not stated as fact. Event and quantity checks
    // above still apply: "Hypothesis: you raised" is still a claim.
    if (/\bhypothesis\b/i.test(sentence)) continue;

    const prevalence = sentence.match(PREVALENCE);
    if (prevalence && !source.toLowerCase().includes(prevalence[0].toLowerCase())) {
      push(
        hits,
        sentence,
        "This states a rate or a habit as fact. Nothing supplied says that. Ask, or mark it as a hypothesis.",
      );
    }
    const causal = sentence.match(CAUSAL_OUTCOME);
    if (causal && !source.toLowerCase().includes(causal[0].toLowerCase())) {
      push(
        hits,
        sentence,
        "This states a cause or an outcome as fact. Nothing supplied says that.",
      );
    }
    const meansAt = sentence.search(/\bmeans\b/i);
    if (meansAt > 0 && /\byou|your\b/i.test(sentence.slice(meansAt))) {
      const clause = sentence.slice(meansAt).trim();
      if (!source.toLowerCase().includes(clause.toLowerCase())) {
        push(
          hits,
          clause,
          "This states a consequence as known. A sourced detail before it can stay. This part cannot.",
        );
      }
    }
  }
  return hits;
}

/** Lines that try to give the model new instructions. They are not research. */
export function stripInstructionLines(text: string): string {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => !INSTRUCTION_LINE.test(line))
    .join("\n")
    .trim();
}
