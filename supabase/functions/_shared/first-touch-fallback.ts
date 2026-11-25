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
/** Stable per company, so the same lead always gets the same shape. */
/**
 * A name as the sender should write it, not as it was scraped.
 *
 * A lead card read "Joshua Perk 👻 · Vector 👻" and the draft went out under
 * the subject "Vector 👻". The ghost is the prospect's own decoration on
 * their profile; echoing it back is the sender writing in somebody else's
 * voice, and it reads as a field pasted straight out of a scrape.
 *
 * usableFallbackFact already refuses an emoji inside a research sentence --
 * "a wink about their IPO is the social post's tone, not a first touch". The
 * same position had simply never been applied to the lead's own name fields.
 *
 * Only pictographs and the joiners that carry them. Accents, currency symbols
 * and non-Latin scripts are part of a real name and are left alone.
 *
 * Takes a nullable string because the lead fields it is given are nullable:
 * `company` is `string | null | undefined` on the record, and narrowing at
 * every call site would just push the same `?? ""` outwards.
 */
export function withoutDecoration(text: string | null | undefined): string {
  return String(text ?? "")
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    // A separator left stranded by what was removed: "Acme | 👻" -> "Acme".
    .replace(/^[\s\-\u2013\u2014•|,]+|[\s\-\u2013\u2014•|,]+$/g, "")
    .trim();
}

function shapeIndex(seed: string, count: number): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return count > 0 ? hash % count : 0;
}

/**
 * The email for a lead research came back thin on.
 *
 * It used to read:
 *
 *   Hi Uma,
 *   You're on file at Siftly (YCW22), as Founder & CEO, in Software
 *   Development.
 *   How are you handling outbound for that work?
 *
 * Three things wrong with that, and none of them is grounding -- every word
 * came from the lead's own record, which is why no gate stopped it.
 *
 * "You're on file" tells somebody they are in a database. It is the sentence a
 * debt collector opens with.
 *
 * It recites their employer, title and industry back at them. They know. A
 * line that carries no information for the reader is worse than no line, and
 * it is exactly what makes an email read as a mail merge.
 *
 * And it was one template, so a hundred of these go out identical except for
 * three substituted fields. That is a spam pattern before it is a style
 * problem: near-identical bodies at volume are what bulk filters look for.
 *
 * So the role and industry become the FRAMING for the question rather than a
 * statement about the reader, there are several shapes, and the shape is
 * chosen by a hash of the company so one lead always gets the same one while a
 * list gets a spread.
 */
export function thinLeadDraft(input: {
  firstName: string;
  senderName: string;
  company?: string | null;
  role?: string | null;
  industry?: string | null;
}): { subject: string; body: string } {
  const first = withoutDecoration(input.firstName) || "there";
  const company = withoutDecoration(input.company);
  const role = String(input.role ?? "").trim().toLowerCase();
  const industry = String(input.industry ?? "").trim().toLowerCase();
  const sender = input.senderName.trim();

  /*
   * Only the question is addressed to them, and it asks rather than asserts.
   * Nothing here claims to know anything the record does not already hold.
   *
   * The subject travels WITH the shape rather than being chosen separately,
   * so a body that opens "Quick question for a founder" never arrives under a
   * subject that already said "Quick question" -- an echo between the two is
   * the other thing that makes a merge look like a merge.
   */
  const shapes: { subject: string; line: string }[] = [];
  if (role) {
    shapes.push({
      subject: company ? `Reaching out, ${company}` : "Reaching out",
      line: `Quick question for a ${role}: how are you finding new customers at the moment?`,
    });
  }
  if (industry) {
    shapes.push({
      subject: company ? `Quick question, ${company}` : "Quick question",
      line: `Reaching out to people in ${industry} this month, so a quick one: how are you handling outbound right now?`,
    });
  }
  if (role && industry) {
    shapes.push({
      subject: company ? `Outbound at ${company}` : "A question about outbound",
      line: `Working through ${industry} this week. For a ${role}, is outbound something you run yourself or hand off?`,
    });
  }
  shapes.push({
    // A bare lowercase company name is not a subject, so the company is never
    // the whole of one.
    subject: company ? `Quick question, ${company}` : "Quick question",
    line: "Keeping this short: how are you handling outbound at the moment?",
  });

  const shape = shapes[shapeIndex(company || first, shapes.length)];
  return {
    subject: shape.subject,
    body: `Hi ${first},\n\n${shape.line}\n\n${sender}`,
  };
}

export function releasableFirstTouch(input: { firstName: string; fact: string; senderName: string }): string {
  const first = withoutDecoration(input.firstName) || "there";
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
  /*
   * The furniture around a social post, scraped as the post. "4 6 2.5K Cosmic
   * Labs @CosmicLabsTech Nov 29, 2025 PSA!" is a timeline read left to right:
   * engagement counts, handle, date, then the first two words. A handle or an
   * address is chrome; so is an opening run of bare numbers. One leading
   * number is ordinary prose, so only a second before the first word counts,
   * which leaves "$2.5M seed round" and "2026 was the year..." usable.
   */
  if (/(?:^|\s)@[A-Za-z0-9_]{2,}/.test(text)) return false;
  if (/\S+@\S+\.[A-Za-z]{2,}/.test(text)) return false;
  if (/^[^A-Za-z]*\d[\d.,]*[KMB]?\s+\d[\d.,]*[KMB]?\s/.test(text)) return false;
  /*
   * A currency figure opens a cold email as well as anything research finds,
   * and "$2.5M in seed funding went to..." was discarded for starting on a
   * symbol this list did not carry. Found by a test written for something
   * else, which is the point of keeping the corpus two-sided.
   */
  return /^[A-Z0-9"'ÀØ$£€]/.test(text);
}

/** Reject sentence fragments and scraped-page chatter, not just excess words. */
export function usableSubject(subject: string): boolean {
  const text = subject.trim();
  // Backstop for a subject assembled somewhere this module does not reach.
  if (/\p{Extended_Pictographic}/u.test(text)) return false;
  return Boolean(text) && text.split(/\s+/).length <= 6 && text.length <= 80
    && !/[\n\r\[\]{}<>]|https?:\/\//i.test(text)
    && !/\b(?:congratulations|congrats|these|those|this|that|natively)\b/i.test(text)
    && !/^(?:subject:|re:|fw:|fwd:)/i.test(text)
    && !/\b(?:a|an|the|and|or|but|for|to|at|in|on|with|from|of|by|as|into|about|that|which|is|are|these|those)\s*[.!?,;:]*$/i.test(text);
}

/*
 * Words that name a category of thing rather than a thing. On their own they
 * carry no information: "software at Unstack" tells the reader strictly less
 * than "Unstack" does, because every company in the inbox builds software.
 *
 * They are fine as the HEAD of a real topic -- "proxy voting infrastructure",
 * "data platform" -- which is why the test below is whether EVERY word of the
 * object comes from these two lists, not whether any does.
 */
const CATEGORY_WORDS = new Set([
  "software", "platform", "platforms", "solution", "solutions", "tool", "tools",
  "product", "products", "service", "services", "technology", "tech", "system",
  "systems", "app", "apps", "application", "applications", "infrastructure",
  "suite", "stack", "saas", "feature", "features", "offering", "offerings",
  "capability", "capabilities", "experience", "experiences", "value", "results",
  "work", "business", "company", "team", "teams", "thing", "things", "stuff",
  // Manner nouns. "a new approach" names no more than "software" does, and
  // MANNER_OPENER below only catches the ones that open the object.
  "way", "ways", "method", "methods", "approach", "approaches",
]);

/* Evaluative filler: it grades a noun without saying what the noun is about. */
const FILLER_WORDS = new Set([
  "the", "a", "an", "these", "those", "our", "their", "your", "all", "its",
  "better", "best", "new", "modern", "simple", "simpler", "powerful", "great",
  "leading", "innovative", "seamless", "smart", "smarter", "easy", "easier",
  "fast", "faster", "advanced", "complete", "comprehensive", "robust",
  "scalable", "flexible", "intuitive", "beautiful", "next-generation",
  "cutting-edge", "end-to-end", "world-class", "truly", "really",
]);

/**
 * "monar builds the way teams close deals" -- what follows is a manner
 * clause, not the thing built, so the object noun phrase comes out a
 * fragment ("way teams close deals at monar"). There is no repair for it:
 * the sentence does not name a topic, so the company name is the better
 * subject.
 */
const MANNER_OPENER = /^(?:way|ways|method|methods|approach|approaches)\b/i;

/** A category word or evaluative filler all the way through names nothing. */
function contentlessTopic(object: string): boolean {
  const words = object.toLowerCase().split(/[\s/]+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((word) => {
    const bare = word.replace(/^[^a-z0-9-]+|[^a-z0-9-]+$/g, "");
    return !bare || CATEGORY_WORDS.has(bare) || FILLER_WORDS.has(bare);
  });
}

/** A complete research topic, never the first six words of a longer sentence. */
export function fallbackSubjectFrom(span: string, companyRaw = ""): string {
  const company = withoutDecoration(companyRaw);
  const text = span.trim().replace(/\s+/g, " ");
  // Keep the full object noun phrase; prepositions introduce the next clause.
  const object = text.match(/\b(?:builds?|automates?|provides?|offers?|develops?|creates?|sells?|delivers?)\s+(.+?)(?=\s+(?:for|to|with|in|at|by|through|that|which)\b|[.!?;]|$)/i)?.[1]
    ?.replace(/^(?:the|a|an|these|those|our|their)\s+/i, "").trim();
  if (
    object && usableSubject(object) && !/\b(?:find|helps?|gets?|natively)\b/i.test(object)
    && !MANNER_OPENER.test(object) && !contentlessTopic(object)
  ) {
    const named = company.trim() ? `${object} at ${company.trim()}` : object;
    return usableSubject(named) ? named : object;
  }
  // The owner-scoped company is a topic, not an invented event or result.
  if (company.trim()) return company.trim();
  if (usableSubject(text)) return text.replace(/[.!?,;:]+$/g, "");
  // No company and nothing short enough to quote. "your work" read as the
  // tail of a sentence somebody forgot to finish.
  return "Quick question";
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
