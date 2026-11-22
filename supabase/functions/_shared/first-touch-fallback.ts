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

/**
 * A sentence a person could read aloud: no markdown, links, headings or
 * brackets, sensible length -- and one the sender can say in his own voice.
 *
 * This path quotes the sentence bare, with no attribution, so an "I" in it
 * becomes the sender. "But not to ring the opening bell for Proxywise AI's
 * IPO :) In fact I was invited to speak on the 'AI in Proxy Voting' panel"
 * passed every check here and went out under the sender's name, claiming an
 * invitation that was the recipient's own. It also opened on "But", because
 * the sentence it continued stayed behind on the page.
 */
export function usableFallbackFact(span: string): boolean {
  const text = span.trim();
  if (text.length < 25 || text.length > 240) return false;
  if (/[\[\]{}<>#*|]|https?:\/\/|\(\s*https?/i.test(text)) return false;
  // Somebody else's first person, or a publication describing its own piece.
  // "I" with case, the rest without: a sentence may open on "My".
  if (/\bI\b|\bI'(?:m|ll|ve|d)\b/.test(text)) return false;
  if (/\b(?:me|my|mine)\b/i.test(text)) return false;
  if (/\b(?:in this (?:article|interview|episode|post|piece|story|guide)|we (?:sit down|caught up|spoke|talk(?:ed)?) with|in conversation with)\b/i.test(text)) return false;
  // Lifted out of a thread of argument it no longer carries.
  if (/^(?:but|and|so|or|yet|also|plus|however|though|although|instead|besides|still|then|meanwhile|otherwise)\b/i.test(text)) return false;
  // A wink about their IPO is the social post's tone, not a first touch.
  if (/[:;]-?[)D(]|\p{Extended_Pictographic}/u.test(text)) return false;
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
export function observationLine(fact: { span: string; role?: string; provider?: string }, company: string): string {
  const text = fact.span.trim().replace(/\s+/g, " ");
  if (fact.role === "prospect_page" && isLeadSite(fact) && company.trim()) {
    return `Saw this on ${company.trim()}'s site: "${text.replace(/^["“]|["”]$/g, "")}"`;
  }
  return /[.!?]["”']?$/.test(text) ? text : `${text}.`;
}

/** Firecrawl and a direct read of the lead's own site. Parallel and Context are not. */
function isLeadSite(fact: { role?: string; provider?: string }): boolean {
  if (fact.provider === "parallel" || fact.provider === "context_dev") return false;
  if (fact.provider === "firecrawl" || fact.provider === "site") return true;
  return fact.role === "prospect_page";
}

/** Their site speaking as "I". Quoting it raw makes the sender the one who was invited. */
const VOICE_THEFT = /\b(?:i|we)\b[^.?\n]{0,80}\b(?:was invited|were invited|spoke|am speaking|are speaking|will speak)\b/i;

/**
 * A prospect sentence the sender must not speak as their own is attributed.
 * Everything else stays the sentence itself, or the site attribution the
 * observation line already uses for a homepage quote.
 */
export function voiceSafeObservation(fact: { span: string; role?: string; provider?: string }, company: string): string {
  const text = fact.span.trim().replace(/\s+/g, " ").replace(/^["“]|["”]$/g, "");
  if (VOICE_THEFT.test(fact.span)) {
    // Their own site, said in their voice. Anywhere else, "their site" invents the source.
    if (isLeadSite(fact) && company.trim()) {
      return observationLine({ span: fact.span, role: "prospect_page", provider: fact.provider }, company);
    }
    const sentence = /[.!?]["”']?$/.test(text) ? text : `${text}.`;
    return `A published account said: "${sentence}"`;
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
  facts: Array<{ span: string; role?: string; provider?: string }>,
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
      body = body.replace(span, voiceSafeObservation({ span, role: fact.role, provider: fact.provider }, company));
    }
  }
  return head + body;
}
