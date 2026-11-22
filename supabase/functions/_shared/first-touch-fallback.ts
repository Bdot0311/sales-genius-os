/**
 * The releasable first touch the evidence policy defines: greeting, one
 * approved research sentence copied verbatim, one ask, the sender's name.
 * Used only when every model draft added a claim the research does not say.
 */
export const FALLBACK_ASK = "Worth a look?";

/**
 * The email we can write when the pages did not yield a sentence.
 * Role, company, and industry are the lead record. Nothing else is stated.
 */
export function thinLeadDraft(input: {
  firstName: string;
  senderName: string;
  company?: string | null;
  role?: string | null;
  industry?: string | null;
}): { subject: string; body: string } {
  const first = input.firstName.trim() || "there";
  const company = String(input.company ?? "").trim();
  const role = String(input.role ?? "").trim();
  const industry = String(input.industry ?? "").trim();
  const bits = [
    company ? `at ${company}` : "",
    role ? `as ${role}` : "",
    industry ? `in ${industry}` : "",
  ].filter(Boolean);
  const line = bits.length
    ? `You're on file ${bits.join(", ")}.`
    : "I only have the name on this lead, not a page of research.";
  const sender = input.senderName.trim();
  return {
    subject: (company || "Quick question").split(/\s+/).slice(0, 6).join(" "),
    body: `Hi ${first},\n\n${line}\n\nHow are you handling outbound for that work?\n\n${sender}`,
  };
}

export function releasableFirstTouch(input: { firstName: string; fact: string; senderName: string }): string {
  const first = input.firstName.trim() || "there";
  const fact = input.fact.trim().replace(/\s+/g, " ");
  const sentence = /[.!?]["”']?$/.test(fact) ? fact : `${fact}.`;
  return `Hi ${first},\n\n${sentence}\n\n${FALLBACK_ASK}\n\n${input.senderName.trim()}`;
}

/** A sentence a person could read aloud: no markdown, links, headings or brackets, sensible length. */
export function usableFallbackFact(span: string): boolean {
  const text = span.trim();
  if (text.length < 25 || text.length > 240) return false;
  if (/[\[\]{}<>#*|]|https?:\/\/|\(\s*https?/i.test(text)) return false;
  return /^[A-Z0-9"'ÀØ]/.test(text);
}

/** Subject taken from the approved sentence itself, so it is never a new claim. */
export function fallbackSubjectFrom(span: string): string {
  return span.trim().split(/\s+/).slice(0, 6).join(" ").replace(/[.!?,;:]+$/g, "");
}

/**
 * The observation line as a reader should see it: a prospect's own site copy
 * is quoted and attributed, so their marketing line never reads as the
 * sender's pitch ("shipped on the timeline we quoted you").
 */
export function observationLine(fact: { span: string; role?: string }, company: string): string {
  const text = fact.span.trim().replace(/\s+/g, " ");
  if (fact.role === "prospect_page" && company.trim()) {
    return `Saw this on ${company.trim()}'s site: "${text.replace(/^["“]|["”]$/g, "")}"`;
  }
  return /[.!?]["”']?$/.test(text) ? text : `${text}.`;
}

/** Their site speaking as "I". Quoting it raw makes the sender the one who was invited. */
const VOICE_THEFT = /\b(?:i|we)\b[^.?\n]{0,80}\b(?:was invited|were invited|spoke|am speaking|are speaking|will speak)\b/i;

/**
 * A prospect sentence the sender must not speak as their own is attributed.
 * Everything else stays the sentence itself, or the site attribution the
 * observation line already uses for a homepage quote.
 */
export function voiceSafeObservation(fact: { span: string; role?: string }, company: string): string {
  if (VOICE_THEFT.test(fact.span) && company.trim()) {
    return observationLine({ span: fact.span, role: "prospect_page" }, company);
  }
  return observationLine(fact, company);
}

/**
 * Greeting names the lead. A greeting that names the sender is the two
 * people swapped; the sign-off is already forced to the sender separately.
 */
export function alignGreeting(body: string, leadFirst: string, senderName: string): string {
  const lead = leadFirst.trim();
  const senderFirst = senderName.trim().split(/\s+/)[0] ?? "";
  if (!lead || lead.toLowerCase() === "there" || !senderFirst) return body;
  if (lead.toLowerCase() === senderFirst.toLowerCase()) return body;
  return body.replace(/^(\s*(?:Hi|Hello|Hey|Dear)\s+)([A-Za-z][\w'-]*)/i, (full, prefix, name) => {
    if (name.toLowerCase() === senderFirst.toLowerCase()) return `${prefix}${lead}`;
    return full;
  });
}

/**
 * Quote a first-person prospect sentence instead of leaving it as the sender's
 * life, and correct a greeting that used the sender's name.
 * The subject line, when present, is left untouched.
 */
export function repairDraftVoice(
  email: string,
  facts: Array<{ span: string; role?: string }>,
  company: string,
  leadFirst: string,
  senderName: string,
): string {
  const subjectMatch = email.match(/^(Subject:\s*.+\n+)/i);
  const head = subjectMatch?.[1] ?? "";
  let body = alignGreeting(subjectMatch ? email.slice(head.length) : email, leadFirst, senderName);
  if (company.trim()) {
    for (const fact of facts) {
      const span = fact.span.replace(/\s+/g, " ").trim();
      if (!span || !VOICE_THEFT.test(span)) continue;
      const compact = body.replace(/\s+/g, " ");
      if (!compact.includes(span)) continue;
      body = body.replace(span, voiceSafeObservation({ span, role: fact.role }, company));
    }
  }
  return head + body;
}
