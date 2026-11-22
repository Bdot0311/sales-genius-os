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
 * Whoever wrote the sentence gets the credit for it.
 *
 * A fact is copied into the email word for word under the sender's name, so
 * an unattributed quote is the sender speaking. On the lead's own site that is
 * fine once it says so ("Saw this on their site: ..."), because the subject is
 * describing itself and the attribution names the source. Anywhere else the
 * words belong to a third party, and quoting them bare hands them to the
 * sender.
 *
 * This used to attribute an outside sentence only when it matched VOICE_THEFT
 * -- an "I"/"we" next to "was invited" or "spoke". That caught one shape of
 * the problem and left every other one bare: a magazine's editorial voice, a
 * founder's own post about anything else, a write-up in the first person
 * plural. The rule is not which outside sentences sound stolen. It is that an
 * outside sentence is not the sender's to say.
 *
 * The attribution names the place the sentence came from, because the fact
 * carries the URL it was read from and a reader recognises a masthead. It also
 * costs nothing in grounding: unattributed() strips exactly these prefixes, so
 * the quote still matches the approved fact and still counts as the one
 * sourced observation, and "saw this on/in" is exempt from the rule that wants
 * a mechanism after a noticed line.
 */

/** The host a quote came from, as a reader would recognise it. */
function sourceHost(url: unknown): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  const host = (raw.match(/^https?:\/\/([^/:?#]+)/i)?.[1] ?? "").toLowerCase().replace(/^www\./, "");
  // A bare hostname only: a path or a port in the attribution would be a
  // place the sentence does not come from.
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

export function voiceSafeObservation(
  fact: { span: string; role?: string; provider?: string; sourceUrl?: string | null },
  company: string,
): string {
  const text = fact.span.trim().replace(/\s+/g, " ").replace(/^["“]|["”]$/g, "");
  // Their own site: attributed to the site when it can be named, and left as
  // the sentence when it cannot, because "their site" must not be invented.
  if (isLeadSite(fact)) {
    return observationLine({ span: fact.span, role: "prospect_page", provider: fact.provider }, company);
  }
  const sentence = /[.!?]["”']?$/.test(text) ? text : `${text}.`;
  const host = sourceHost(fact.sourceUrl);
  if (host) return `Saw this on ${host}: "${sentence}"`;
  // No URL to name. Not "a recent write-up": nothing here knows when it was
  // published, and the date would be the invented part.
  return `Saw this in a write-up: "${sentence}"`;
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
  facts: Array<{ span: string; role?: string; provider?: string; sourceUrl?: string | null }>,
  company: string,
  leadFirst: string,
  senderName: string,
): string {
  const subjectMatch = email.match(/^(Subject:\s*.+\n+)/i);
  const head = subjectMatch?.[1] ?? "";
  let body = alignGreeting(subjectMatch ? email.slice(head.length) : email, leadFirst, senderName);
  for (const fact of facts) {
    const span = fact.span.replace(/\s+/g, " ").trim();
    if (!span) continue;
    /*
     * Any outside sentence the writer dropped in bare, not only one that
     * matched the voice-theft pattern. The pattern caught an "I ... was
     * invited"; a third-person line from a news story reads just as much like
     * the sender's own words, because nothing says whose it is.
     *
     * Their own site still needs a company name to attribute to, so skip it
     * when there is none rather than invent "their site".
     */
    const own = isLeadSite(fact);
    if (own && !company.trim()) continue;
    const at = body.indexOf(span);
    if (at < 0) continue;
    // Already quoted and attributed: replacing would nest one attribution
    // inside another.
    if (/(?:[:,]\s*["“]\s*)$/.test(body.slice(Math.max(0, at - 60), at))) continue;
    body = body.replace(span, voiceSafeObservation(
      { span, role: fact.role, provider: fact.provider, sourceUrl: fact.sourceUrl },
      company,
    ));
  }
  return head + body;
}
