// Version-controlled generation prompt for Sequence Engine v2 (Phase 4).
// Changes here get their own commit so regressions are traceable. The generator
// composes the user payload from the campaign brief, the selected hook, and the
// payoff bank entries; the model may only use payoffs that are passed in.
//
// The banned list and the GTM frameworks are imported rather than written here.
// This prompt used to name five banned phrases inline while the shared list held
// over seventy, and it carried no frameworks at all — so the sequence builder
// wrote to weaker rules than every other path in the product, and had nothing to
// draw a touch's SHAPE from beyond the four-line architecture below.
import { composeSkillContext } from "../_shared/email-skills.ts";
import { bannedPhrasesLine } from "../_shared/email-rules.ts";

const SEQUENCE_RULES = `You write a four-touch cold email sequence for B2B email-only outbound. Output STRICT JSON only, no prose, no code fences.

Hard rules on truth:
- You may only use a payoff (an insight, a statistic, a benchmark, a resource, an offer) that appears in the PAYOFF BANK provided in the input. Never invent a number, a customer name, a benchmark, or a case study.
- If the payoff bank is empty, use an observation-only payoff drawn from the prospect's own public data provided in the input, and assert no statistic at all.
- Never make any claim listed in FORBIDDEN CLAIMS.
- Use the provided HOOK for touch 1. Do not paper over a missing hook with filler.

Touch architecture (each touch has a distinct job, not an escalating nag):
1. Hook, one payoff, one-line ask.
2. A different angle on the same problem, a different payoff.
3. Proof or an anonymized peer reference, a softer ask.
4. A short close-out that gives permission to stop.
Generate each touch with the earlier touches in view so no opener, payoff, or ask phrasing repeats.

Style contract (a lint pass will reject and you will be asked to fix):
- No em-dashes. No triadic lists. No "not X but Y". No bolded lead-ins.
- No exclamation points. At most one question per email.
- Subject line under six words, sentence case, reads like an internal note not a headline.
- Under ninety words per touch. Plain, lowercase-first sentences. No hype.

Personalization:
- Use only the resolved token values provided. Never output a token placeholder, a blank, or a generic substitute like "your company".

OUTPUT SCHEMA (return exactly this):
{
  "touches": [
    { "day": 1,  "purpose": "hook",     "subject": "...", "body": "...", "hook_used": "...", "payoff_id": "<id or null>" },
    { "day": 3,  "purpose": "angle",    "subject": "...", "body": "...", "hook_used": "...", "payoff_id": "<id or null>" },
    { "day": 7,  "purpose": "proof",    "subject": "...", "body": "...", "hook_used": "...", "payoff_id": "<id or null>" },
    { "day": 14, "purpose": "breakup",  "subject": "...", "body": "...", "hook_used": "...", "payoff_id": "<id or null>" }
  ]
}
Do not output anything outside that JSON object.`;

/**
 * The sequence prompt as the generator sends it: rules, then the shared banned
 * list, then the frameworks that decide each touch's shape.
 *
 * Composed at call time rather than baked into a constant so that editing a
 * skill or adding a banned phrase reaches this path without anyone remembering
 * that this path exists — which is exactly how it fell behind.
 */
export function sequenceSystemPrompt(): string {
  return [
    SEQUENCE_RULES,
    "",
    bannedPhrasesLine(),
    composeSkillContext({ goal: "sequence" }),
  ].join("\n");
}

interface PayoffEntry { id: string; type: string; content: string; source_url?: string | null; asserts_stat?: boolean }

export function buildSequenceUserPayload(input: {
  hook: string;
  hookKind: string;
  prospect: string;         // resolved, human-readable prospect context
  personaPain?: string;
  offer?: string;
  payoffBank: PayoffEntry[];
  forbiddenClaims: string[];
  resolvedTokens: Record<string, string>;
  retryNote?: string;       // populated on a regenerate pass
}): string {
  const bank = input.payoffBank.length
    ? input.payoffBank.map((p) => `- [${p.id}] (${p.type}) ${p.content}${p.source_url ? ` (source: ${p.source_url})` : ""}`).join("\n")
    : "(empty — use an observation-only payoff from the prospect data, assert no statistic)";

  return [
    `HOOK (${input.hookKind}): ${input.hook}`,
    input.offer ? `OFFER: ${input.offer}` : "",
    input.personaPain ? `PERSONA PAIN (in their words): ${input.personaPain}` : "",
    `PROSPECT:\n${input.prospect}`,
    `PAYOFF BANK:\n${bank}`,
    `FORBIDDEN CLAIMS: ${input.forbiddenClaims.length ? input.forbiddenClaims.join("; ") : "(none)"}`,
    `RESOLVED TOKENS: ${JSON.stringify(input.resolvedTokens)}`,
    input.retryNote ? `FIX THESE AND REGENERATE: ${input.retryNote}` : "",
  ].filter(Boolean).join("\n\n");
}
