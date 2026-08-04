// Cold Email Engine playbook — shared by the AI SDR agent.
// Produces the same 4-touch sequence rules used by generate-sequence.

export const PLAYBOOK_SYSTEM_RULES = `COLD EMAIL ENGINE RULES (non-negotiable, apply to every email):
- 50-75 words body only. Absolute ceiling 90 words. Under 10 seconds to read.
- 3-4 sentences. 8th-grade reading level. No em-dashes, no emojis, no bullets, no markdown.
- Exactly ONE low-friction CTA in question form. Never ask for a meeting on touch 1. Never propose times.
- Interest-based CTA ladder, lowest friction first: interest ("worth a look?"), permission ("would you be opposed to a 2-minute example?"), or resource ("want the teardown?"). Never a calendar link or a proposed time on touch 1.
- Named proof requires company + metric + timeframe. If no verified proof is supplied, use restrained operational language instead of inventing one. Never fabricate metrics, logos, or case studies.
- Reference ONE specific detail about the prospect per email.
- Touch 1 earns a reply, it does not sell. NEVER name your own product or company in the touch 1 body (only the signature carries it). Do not explain the product, list features, or write "we built" / "we help" / "[Product] was built" / "[Product] turns X into Y" / "all-in-one" / "our platform" on touch 1. Imply a better path exists and withhold the how. Naming the product and saying what it does is the pitch we forbid. The pitch and the proof belong on touch 2, once you have their attention.
- Their world, not yours: across the body, "you"/"your" must outnumber "we"/"our"/"I".
- Sign-off: sender first name only. Never "Best," / "Thanks,".
- No exclamation points. No links. No placeholders like [Company].

BANNED PHRASES: "hope this finds you well", "just checking in", "just reaching out", "touching base", "circling back", "bumping this", "wanted to check in", "quick question" (in body), "I noticed", "I came across", "I was impressed", "love what you're doing", "big fan", "in today's fast-paced world", "leverage", "optimize", "streamline", "synergy", "seamless", "supercharge", "unlock", "empower", "cutting-edge", "industry-leading", "best-in-class", "revolutionary", "next-gen", "game-changing", "innovative solution".
BANNED SPAM TRIGGERS: "free", "guarantee", "limited time", "act now", "100%", "$$$", ALL CAPS words.

FOUR-TOUCH STRUCTURE (attention first, sell later):
Touch 1 (day 0) — attention, NO pitch: a signal reference, one line of inferred operational pain, then one line that implies a better path exists without explaining the product or how it works (withhold the mechanism so a curiosity gap opens), and a soft interest CTA. If a line explains what the product does, it is a pitch, rewrite it as a hint.
Touch 2 (day 3) — the payoff, this is the selling touch: now give what touch 1 held back — what you do and roughly how, plus ONE market observation or peer example as proof (only if verified). Do not repeat touch 1's pain. Different soft CTA.
Touch 3 (day 7) — timing/clarification. Acknowledge silence without guilt, offer a lower-commitment path, include an easy-out to be redirected to the right person.
Touch 4 (day 14) — polite breakup. 2-3 sentences, no guilt, no "final email" theatrics, door left open.

SUBJECT RULES: 2-5 words, under 40 characters, lowercase, colleague tone. No "re:"/"fwd:" fakery, no numbers or percentages, no "quick question".

OUTPUT: strict JSON only, no prose, no code fences:
{"touches":[{"day":0,"purpose":"signal opener","subject":"...","body":"Hi <first>,\\n\\n<3-4 sentences ending in one CTA question>\\n\\n<sender first name>"},{"day":3,"purpose":"context","subject":"...","body":"..."},{"day":7,"purpose":"timing","subject":"...","body":"..."},{"day":14,"purpose":"breakup","subject":"...","body":"..."}]}`;

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

export function buildTouchPrompt(input: {
  firstName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  signals?: string[] | null;
  senderFirstName: string;
  companyContext?: string | null;
  valueProps?: string | null;
}): string {
  return `Write the full 4-touch sequence for this prospect. Return JSON only.

PROSPECT:
first_name: ${input.firstName}
job_title: ${input.jobTitle ?? "decision maker"}
company: ${input.companyName ?? "their company"}
industry: ${input.industry ?? ""}
signals: ${(input.signals ?? []).join(", ") || "none supplied — do not invent one, use role/industry context instead"}

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
    step_type: "email",
    trigger_condition: "on_no_response",
    is_active: true,
  }));
  const { error: stepErr } = await admin.from("sequence_steps").insert(steps);
  if (stepErr) return false;

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
