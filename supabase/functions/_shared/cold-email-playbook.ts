import { composeSkillContext } from "./email-skills.ts";
import { bannedPhrasesLine } from "./email-rules.ts";
import type { StepType, TriggerCondition } from "./sequence-steps.ts";

// Cold Email Engine playbook — shared by the AI SDR agent.
// Produces the same 4-touch sequence rules used by generate-sequence.

export const PLAYBOOK_SYSTEM_RULES = `COLD EMAIL ENGINE RULES (non-negotiable, apply to every email):
- Aim for 60-90 words in the body. The audit enforces 50-90, absolute ceiling 140. Never tell a user an email breaches a ceiling the audit does not enforce. Under 10 seconds to read.
- 3-4 sentences. 8th-grade reading level. No em-dashes, no emojis, no bullets, no markdown.
- Exactly ONE low-friction CTA in question form. Never ask for a meeting on touch 1. Never propose times.
- Interest-based CTA ladder, lowest friction first: interest ("worth a look?"), permission ("would you be opposed to a 2-minute example?"), or resource ("want the teardown?"). Never a calendar link or a proposed time on touch 1.
- Named proof requires company + metric + timeframe. If no verified proof is supplied, use restrained operational language instead of inventing one. Never fabricate metrics, logos, or case studies.
- Reference ONE specific detail about the prospect per email. When the RESEARCH block below says none is available, that detail must come from their role or industry. Never state anything about this specific company that was not supplied to you.
- Touch 1 earns a reply, it does not sell. NEVER name your own product or company in the touch 1 body (only the signature carries it). Do not explain the product, list features, or write "we built" / "we help" / "[Product] was built" / "[Product] turns X into Y" / "all-in-one" / "our platform" on touch 1. Imply a better path exists and withhold the how. Naming the product and saying what it does is the pitch we forbid. The pitch and the proof belong on touch 2, once you have their attention.
- Their world, not yours: across the body, "you"/"your" must outnumber "we"/"our"/"I".
- Sign-off: sender first name only. Never "Best," / "Thanks,".
- No exclamation points. No links. No placeholders like [Company].

${bannedPhrasesLine()}
BANNED SPAM TRIGGERS: "free", "guarantee", "limited time", "act now", "100%", "$$$", ALL CAPS words.

FOUR-TOUCH STRUCTURE (attention first, sell later):
Touch 1 (day 0) — attention, NO pitch. What it must achieve: ground the email in something true — about this specific account when research supplies it, and about their role or industry when it does not, make clear you understand how they operate today, open a curiosity gap about a better path without explaining the product or how it works, and ask one low-friction question. If a line explains what the product does, it is a pitch, rewrite it as a hint.
  The ORDER and shape of those beats is not fixed here — choose it from the frameworks in the reference material at the end of this prompt, based on what this lead's evidence supports. Writing every touch 1 as "observation, then inferred pain, then implied better path, then soft question" is what makes an entire campaign read as one email sent repeatedly, and it is the failure this instruction exists to prevent. Vary the shape across leads.
Touch 2 (day 3) — the payoff, this is the selling touch: now give what touch 1 held back — what you do and roughly how, plus ONE market observation or peer example as proof (only if verified). Do not repeat touch 1's pain. Different soft CTA.
Touch 3 (day 7) — timing/clarification. Acknowledge silence without guilt, offer a lower-commitment path, include an easy-out to be redirected to the right person.
Touch 4 (day 14) — polite breakup. 2-3 sentences, no guilt, no "final email" theatrics, door left open.

SUBJECT RULES: 2-5 words, under 40 characters, lowercase, colleague tone. No "re:"/"fwd:" fakery, no numbers or percentages, no "quick question".

FORMATTING: inside each body, break the sentences into 2 or 3 short paragraphs separated by a blank line (\\n\\n), with the greeting on its own line and the sign-off on its own line. One unbroken block of sentences reads as machine-written before the reader has read a word of it.

OUTPUT: strict JSON only, no prose, no code fences:
{"touches":[{"day":0,"purpose":"signal opener","subject":"...","body":"Hi <first>,\\n\\n<opening beat>\\n\\n<remaining beats, ending in one CTA question>\\n\\n<sender first name>"},{"day":3,"purpose":"context","subject":"...","body":"..."},{"day":7,"purpose":"timing","subject":"...","body":"..."},{"day":14,"purpose":"breakup","subject":"...","body":"..."}]}`;

/**
 * The playbook rules plus the GTM frameworks that decide each touch's shape.
 *
 * The rules above are constraints — length, banned language, no pitching on
 * touch 1, claim handling, output format. They deliberately stop short of
 * fixing the body's shape, because a campaign whose every touch 1 has the same
 * four beats reads as one email sent over and over. The frameworks supply the
 * shape, chosen per lead.
 *
 * PLAYBOOK_SYSTEM_RULES stays exported on its own for callers that only need
 * the constraints (reply and objection handling, where there is no cold-email
 * framework to pick).
 */
export function playbookSystemRules(): string {
  return `${PLAYBOOK_SYSTEM_RULES}${composeSkillContext({ goal: "sequence" })}`;
}

/**
 * The rules for a caller that reviews and routes email but never writes it.
 *
 * agent-chat is forbidden from composing copy — every email it shows the user
 * comes back from draft_outreach, which carries the full bundle. So the ~20k
 * tokens of writing skills in its system prompt were teaching it to do the one
 * thing it must not do, on every one of up to eight model calls per turn.
 *
 * What it does need is the constraints it has to enforce and repeat: the banned
 * phrases, the proof rules, the placeholder ban. Those are the playbook rules
 * themselves, and they are about a tenth of the size.
 */
export function playbookEnforcementRules(): string {
  return PLAYBOOK_SYSTEM_RULES;
}

export type Touch = { day: number; purpose: string; subject: string; body: string };

export function parseTouches(raw: string): Touch[] {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = JSON.parse(m[0]);
    const touches = Array.isArray(parsed?.touches) ? parsed.touches : [];
    return touches
      .map((t: any, i: number) => ({
        day: Number(t?.day ?? [0, 3, 7, 14][i] ?? 0),
        purpose: String(t?.purpose ?? "").slice(0, 60),
        subject: String(t?.subject ?? "").trim(),
        body: String(t?.body ?? "").trim(),
      }))
      .filter((t: Touch) => t.subject && t.body);
  } catch {
    return [];
  }
}

/**
 * `research` is an input rather than something the caller concatenates on,
 * because the empty case needs saying out loud.
 *
 * The rules above require one specific detail about the prospect and tell
 * touch 1 to be grounded in something true about the account. Research is
 * where those details come from, and it returns nothing whenever a provider
 * is unset, out of credits, or silently failing — which this product's own
 * ENVIRONMENT.md documents for Parallel, Context.dev, Bloomberry and
 * PredictLeads alike.
 *
 * Appending an empty string left the model under a non-negotiable instruction
 * to state a specific truth about a company it had been told nothing about.
 * There is only one way to satisfy that, and it is to make something up. The
 * model was doing as it was told.
 *
 * The `signals` field has carried "none supplied — do not invent one" since it
 * was written. Whoever wrote that had this exact problem in mind and solved it
 * for one field. This gives research the same treatment.
 */
export function buildTouchPrompt(input: {
  firstName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  signals?: string[] | null;
  senderFirstName: string;
  companyContext?: string | null;
  valueProps?: string | null;
  /** The research brief block, or empty when research produced nothing. */
  research?: string | null;
}): string {
  const research = (input.research ?? "").trim();
  return `Write the full 4-touch sequence for this prospect. Return JSON only.

PROSPECT:
first_name: ${input.firstName}
job_title: ${input.jobTitle ?? "decision maker"}
company: ${input.companyName ?? "their company"}
industry: ${input.industry ?? ""}
signals: ${(input.signals ?? []).join(", ") || "none supplied — do not invent one, use role/industry context instead"}

RESEARCH:
${research || "none available — you have NO verified facts about this company. Do not state, imply or guess anything specific about them: not what they do, not what they shipped, not who they hired, not what is on their site. Ground the email in the role and industry above instead. An invented company detail is worse than a generic email."}

SENDER:
first_name: ${input.senderFirstName}
company_context: ${input.companyContext ?? ""}
value_propositions: ${input.valueProps ?? ""}`;
}

/**
 * Persists touches 2-4 as a per-lead follow-up sequence and enrolls the lead,
 * so process-sequence-step / the scheduler sends them on days 3, 7 and 14.
 */
export async function scheduleFollowUps(
  admin: any,
  userId: string,
  leadId: string,
  leadLabel: string,
  touches: Touch[],
): Promise<boolean> {
  const followUps = touches.slice(1, 4);
  if (followUps.length === 0) return false;

  const { data: sequence, error: seqErr } = await admin
    .from("email_sequences")
    .insert({
      user_id: userId,
      name: `AI SDR follow-ups — ${leadLabel}`.slice(0, 120),
      description: "Touches 2-4 of the Cold Email Engine playbook, generated by the AI SDR.",
      status: "active",
    })
    .select("id")
    .single();
  if (seqErr || !sequence) return false;

  // delay_days on a step = wait before the NEXT step (see process-sequence-step).
  const gaps = [4, 7, 0];
  const steps = followUps.map((t, i) => ({
    sequence_id: sequence.id,
    user_id: userId,
    step_number: i + 1,
    delay_days: gaps[i] ?? 0,
    delay_hours: 0,
    subject_template: t.subject,
    body_template: t.body,
    // Every step here is a follow-up by construction: touch 1 was already sent
    // directly and `followUps` starts at touches[1]. Not stepTypeFor(i + 1) —
    // that answers "first in this sequence", which is not the same question.
    //
    // It used to say "email", which named the channel rather than the role and
    // failed sequence_steps_step_type_check on every insert, so this function
    // has never persisted a single step.
    step_type: "follow_up" satisfies StepType,
    trigger_condition: "on_no_response" satisfies TriggerCondition,
    is_active: true,
  }));
  const { error: stepErr } = await admin.from("sequence_steps").insert(steps);
  if (stepErr) {
    // The sequence row is already written. Leaving it there is how a user
    // ended up with a list of empty "AI SDR follow-ups — ..." sequences that
    // enrol nobody and send nothing — one for every attempt, for as long as
    // the step insert was failing. It is this function's own row, created a
    // moment ago and provably empty, so removing it is cleanup rather than
    // touching anything the user made.
    console.error("[cold-email-playbook] step insert failed:", stepErr.message ?? stepErr);
    await admin.from("email_sequences").delete().eq("id", sequence.id);
    return false;
  }

  const firstFollowUp = new Date();
  firstFollowUp.setDate(firstFollowUp.getDate() + 3);

  const { error: enrollErr } = await admin.from("sequence_enrollments").insert({
    sequence_id: sequence.id,
    lead_id: leadId,
    user_id: userId,
    current_step: 0,
    engagement_state: "contacted",
    status: "active",
    next_action_at: firstFollowUp.toISOString(),
  });
  return !enrollErr;
}
