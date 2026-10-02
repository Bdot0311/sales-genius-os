// The writing rules, in one place.
//
// These existed in three copies: generate-email's prompt constants, the banned
// list inside cold-email-playbook, and an IMMUTABLE_RULES block built in the
// browser by handleQualityFix and posted back to generate-email — a client
// telling the server rules the server already had.
//
// Three copies drift, and the drift is invisible: a phrase banned in one prompt
// and absent from another produces email that violates a rule the codebase
// appears to enforce, which is exactly the kind of ghost that costs a day to
// chase. One list, imported everywhere, cannot disagree with itself.

/**
 * Phrases that never appear in outbound, in any path.
 *
 * The union of what the three copies each banned separately — no entry was
 * dropped in merging them, so every path gets strictly more protection than it
 * had, and none gets less.
 */
export const BANNED_PHRASES: string[] = [
  // Openers that announce themselves as cold outreach
  "I noticed", "I noticed that", "I came across", "I came across your profile",
  "I was impressed", "I was impressed by", "I wanted to reach out", "just reaching out",
  "I saw on LinkedIn", "I was doing some research", "I've been looking at your",
  "I've been analyzing", "as a leader in",
  // Pleasantries
  "I hope this finds you", "I hope this finds you well", "hope this email finds you",
  "I hope this message finds you", "hope this finds you well", "I'll keep this brief",
  "love what you're doing", "big fan",
  // Follow-up filler
  "touching base", "circling back", "bumping this", "bumping this to the top",
  "just following up", "wanted to follow up", "just checking in", "wanted to check in",
  "any update", "per my last email", "did you see my last email",
  // Closers that ask for nothing
  "I'd love to connect", "let me know if you have any questions",
  "looking forward to hearing from you",
  // Marketing and AI tells
  "quick question", "in today's fast-paced world", "innovative solution",
  "cutting-edge", "industry-leading", "best-in-class", "revolutionary",
  "next-gen", "game-changing", "all-in-one",
  "synergy", "leverage", "optimize", "streamline", "seamless", "supercharge",
  "unlock", "empower",
  // Benefit nouns with no mechanism behind them. The list above catches email
  // that announces itself as cold outreach; this catches email that reads as
  // mass mail while breaking none of those rules — a draft can satisfy every
  // constraint on length, CTA shape and sign-off and still say nothing, because
  // those constrain form and this is a failure of substance.
  "drive efficiency", "drives efficiency", "driving efficiency",
  "clear ROI", "strong ROI", "proven ROI",
  "predictable pipeline", "consistent pipeline",
  "teams like yours", "companies like yours", "helping teams like",
  "without manual work", "without manual sales work", "without adding headcount",
  "worth comparing", "worth exploring", "drive results", "drive growth",
  "boost revenue", "maximize", "scale faster", "operational efficiency",
  "value prop", "solutions that", "tailored solution", "bespoke solution",
];

const quoted = (list: string[]) => list.map((p) => `"${p}"`).join(", ");

/** The banned list as a prompt block, for prompts written in prose. */
export function bannedPhrasesBlock(): string {
  return `
BANNED PHRASES — never use any of these, ever (2026 outbound KB dead phrases):
${BANNED_PHRASES.map((p) => `- "${p}"`).join("\n")}
- Any phrase that sounds like you scraped their LinkedIn profile`;
}

/** The banned list as a single line, for prompts that are already dense. */
export function bannedPhrasesLine(): string {
  return `BANNED PHRASES: ${quoted(BANNED_PHRASES)}. Also never any phrase that sounds like you scraped their LinkedIn profile.`;
}

/**
 * Constraints that hold through a targeted edit.
 *
 * A precision edit rewrites one part of an existing draft, so it needs the
 * rules restated: the model is being asked to change something, and without
 * this it can "fix" a readability complaint by reintroducing a banned phrase
 * the original draft correctly avoided. generate-email applies this itself now
 * — it already knows an edit from a generation — rather than trusting a caller
 * to send it.
 */
export const IMMUTABLE_EDIT_RULES = `
IMMUTABLE RULES — these apply regardless of the fix task:
- Keep the body inside the enforced 50-90 words. Do not lengthen an email that is already inside the band.
- Greeting stays as "Hi [FirstName]," — do not change it
- Sign-off stays as just the sender's first name on its own line — do not add "Best," or "Thanks,"
- Do NOT introduce new percentage claims, statistics, or unverified benchmarks
- Do NOT add new links or URLs
- Do NOT add new placeholder tokens like [Name] or {company}
- Do NOT introduce any banned phrase while fixing something else
${bannedPhrasesLine()}
- Return ONLY the email body — no subject line, no headers, no explanation`;

/**
 * An unfilled merge token anywhere in a draft.
 *
 * generate-email's scrubber matched an allowlist of four words — name, company,
 * first name, full name — so "[client name]" and "[Sender Name]" both shipped
 * to real prospects. Anything the model invents outside that vocabulary passed
 * straight through.
 *
 * This matches the bracket shapes generally instead. In a plain-text cold email
 * under 90 words a bracketed or braced fragment is a placeholder essentially
 * every time. Angle brackets are deliberately excluded: some send paths carry
 * HTML bodies, and eating a real tag would be a worse bug than the one being
 * fixed.
 */
const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,40}\]|\{\{[^}\n]{1,40}\}\}|\{[^}\n]{1,40}\}/;

export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text ?? "");
}

/** The offending tokens, for logs and for telling the model what to fix. */
export function findPlaceholders(text: string): string[] {
  return [...(text ?? "").matchAll(new RegExp(PLACEHOLDER_PATTERN, "g"))].map((m) => m[0]);
}

/**
 * Stand-in values that mean "we don't know", which must never be read back as
 * a fact about the prospect.
 *
 * They exist for a legitimate reason: leads.company_name is NOT NULL, so a lead
 * whose provider returned no company still needs something in the column. What
 * goes wrong is downstream, where the stand-in gets used as though it were
 * data — as an email subject ("Quick question — Unknown"), as a dedupe key, or
 * worst, as a provider search filter. Production sent Wiza a reveal for a real
 * person scoped to `company: "Unknown"`, which could only ever miss.
 *
 * Anchored on purpose: "NA Consulting" and "None The Wiser Ltd" are real
 * companies, and a substring test would erase them.
 */
const NOT_A_REAL_VALUE =
  /^\s*(unknown|n\/?a|not\s*available|not\s*provided|none|null|nil|undefined|-{1,3}|\?+|tbd|placeholder|no\s*company|company)\s*$/i;

/** The trimmed value if it says something, otherwise null. */
export function realValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text && !NOT_A_REAL_VALUE.test(text) ? text : null;
}

/** True when the value is a stand-in rather than something a provider found. */
export function isPlaceholderValue(value: unknown): boolean {
  return realValue(value) === null;
}

/**
 * Why a draft carrying one is regenerated rather than scrubbed: deleting the
 * token leaves the sentence broken around the hole it came out of — "recent
 * work with  on ai outbound" — which reads worse than the placeholder did.
 */
export const NO_PLACEHOLDER_RETRY = `
The previous draft contained an unfilled placeholder, which can never be sent.
Write the email again using only facts you were actually given. If you do not
know a detail, leave it out and write around it — never write a bracketed
stand-in like [client name], [Sender Name] or {company} for a human to fill in.`;

/**
 * Fabricated numbers are the complaint that keeps coming back: the model writes
 * "cutting lead research time by 80% for similar software teams" when nobody
 * gave it an 80% anything. Prompt text alone never stopped it, so the draft is
 * checked after generation and regenerated when it invents a figure.
 *
 * A number is allowed only when the same number appears in the verified proof
 * the sender supplied. Everything else — percentages, multipliers, dollar
 * amounts, "500+ teams", "3 out of 4" — is treated as invented.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b\d{1,3}(?:\.\d+)?\s?%/g,          // 80%, 12.5 %
  /\b\d{1,4}(?:\.\d+)?\s?x\b/gi,       // 3x, 2.5x
  /\$\s?\d[\d,.]*\s?(?:k|m|b|bn|million|billion)?/gi,
  /\b\d[\d,]*\+?\s?(?:teams|companies|customers|clients|founders|reps|users|brands|agencies)\b/gi,
  /\b(?:doubl|tripl|quadrupl)(?:e|ed|ing)\b/gi,
];

/**
 * Fabricated proof that carries no number.
 *
 * Every pattern above requires a digit, so a model that has been told not to
 * invent metrics can satisfy the letter of that rule by dropping the figures:
 * "one computer software firm that saw a significant increase in meetings
 * booked" asserts a customer, a result and a direction while matching none of
 * the numeric patterns. It reached a real prospect.
 *
 * These are deliberately narrow — an anonymized customer paired with an
 * outcome verb, a magnitude word with no magnitude, or a peer claim about
 * companies "like yours". Ordinary sentences do not use these shapes; invented
 * case studies almost always do.
 */
const VAGUE_PROOF_PATTERNS: RegExp[] = [
  // "one computer software firm that saw…", "a client who achieved…"
  //
  // The noun list covers PEOPLE as well as organisations. "One Co-Founder saw
  // their reply rate increase after switching to us" reached a real prospect
  // because the original list held only company words — the model had simply
  // attributed the invented result to a person instead of a business.
  /\b(?:one|a|an|another)\s+(?:\w+[\s-]+){0,3}(?:firm|company|client|customer|team|agency|startup|business|brand|founder|co-?founder|ceo|cto|cmo|coo|exec|executive|leader|manager|director|owner|operator|marketer|rep)\b[^.?!]{0,60}?\b(?:saw|achieved|reported|generated|booked|increased|reduced|cut|doubled|grew|switched)\b/gi,
  // Magnitude word with no magnitude, as a noun phrase: "a significant increase".
  //
  // The magnitude word and the outcome noun do not have to be adjacent, and
  // requiring that they were is how "significant audience growth" shipped —
  // one modifier between them was enough to defeat the pattern. The same hole
  // passed "substantial pipeline improvement" and "dramatic reply-rate lift".
  // Up to two intervening words, which is what a real noun phrase carries;
  // punctuation ends the run, so "significant, and growth followed" is not a
  // match.
  /\b(?:significant|substantial|meaningful|noticeable|dramatic|marked|considerable|sizeable)\s+(?:\w+[\s-]+){0,2}(?:increase|lift|improvement|boost|jump|gain|growth|reduction|drop|decrease|results?|roi|uplift|traction|savings)\b/gi,
  // The same claim as a comparative: "significantly more relevant replies",
  // "substantially fewer bounces". No noun follows the magnitude word, so the
  // pattern above missed it — and this phrasing shipped.
  /\b(?:significantly|substantially|meaningfully|noticeably|dramatically|considerably|markedly)\s+(?:more|less|fewer|faster|slower|higher|lower|better|worse)\b/gi,
  // "after switching to us", "since moving to us" — asserts a customer outcome
  // without naming anyone at all.
  /\b(?:after|since)\s+(?:switching|moving|migrating)\s+to\s+(?:us|our|\w+)\b/gi,
  // "teams like yours see…"
  /\b(?:companies|teams|clients|founders|firms)\s+like\s+(?:yours|you)\b[^.?!]{0,60}?\b(?:saw|see|get|got|report|achieve|book)\b/gi,
];

/** Numeric or quantified claims in `text` that the verified proof does not support. */
export function findUnverifiedClaims(text: string, verifiedProof = ""): string[] {
  const body = text ?? "";
  const proof = (verifiedProof ?? "").toLowerCase();
  const hits: string[] = [];
  for (const pattern of [...CLAIM_PATTERNS, ...VAGUE_PROOF_PATTERNS]) {
    for (const m of body.matchAll(new RegExp(pattern))) {
      const claim = m[0].trim();
      const digits = claim.replace(/[^\d.]/g, "");
      // Supported when the proof the sender actually gave contains the figure.
      const supported = digits ? proof.includes(digits) : proof.includes(claim.toLowerCase());
      if (!supported && !hits.includes(claim)) hits.push(claim);
    }
  }
  return hits;
}

/**
 * Derive a human first name from a mailbox address.
 *
 * A cold email has to be signed by a person. When the profile carries no name,
 * the address the mail will be sent FROM is the best remaining evidence of who
 * is sending it — brandon@outreign.io is Brandon. Outreach Studio has always
 * done this; the agent did not, which is why its drafts arrived unsigned or
 * carrying a placeholder.
 *
 * Returns "" for addresses that carry no human name (info@, sales@, noreply@)
 * rather than signing an email "Info" — a wrong name is worse than the caller
 * being told it has none.
 */
export function nameFromEmail(email: string): string {
  const local = String(email ?? "").split("@")[0] ?? "";
  if (!local) return "";

  // Role and system mailboxes name a function, not a person.
  const ROLE_LOCALS = new Set([
    "info", "sales", "support", "admin", "contact", "hello", "help", "team",
    "office", "billing", "accounts", "hr", "jobs", "careers", "marketing",
    "press", "media", "legal", "noreply", "no-reply", "donotreply", "mail",
    "enquiries", "inquiries", "general", "service", "outreach",
  ]);
  if (ROLE_LOCALS.has(local.toLowerCase())) return "";

  // Trailing digits are almost always disambiguators (brandon2, john.smith99),
  // never part of the name.
  const cleaned = local.replace(/\d+$/g, "").replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "";

  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Stand-in sender identities that carry no brackets, so `hasPlaceholder` misses
 * them: a draft signed "Sender Name" went out to a real prospect.
 */
const SENDER_STANDIN_PATTERN =
  /^(?:sender(?:[ _]name)?|your[ _]name|your[ _]company|company[ _]name|sender[ _]company|full[ _]name|founder,\s*(?:your|sender)[ _]?company)$/i;

/** Bare stand-in identity lines ("Sender Name", "Your Company") in a draft. */
export function findSenderStandIns(text: string): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/[.,]$/, ""))
    .filter((l) => l && SENDER_STANDIN_PATTERN.test(l));
}

/** Replace stand-in identity lines with the real sender details. */
export function fillSenderStandIns(text: string, senderName: string, senderCompany = ""): string {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim().replace(/[.,]$/, "");
      if (!SENDER_STANDIN_PATTERN.test(t)) return line;
      if (/company/i.test(t)) return senderCompany ? `Founder, ${senderCompany}` : "";
      return senderName || "";
    })
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/** Corrective instruction for a draft that invented a figure. */
export function noFabricationRetry(claims: string[]): string {
  return `
The previous draft invented these claims: ${claims.map((c) => `"${c}"`).join(", ")}.
Nobody gave you those figures. Write the email again with ZERO numbers, percentages,
multipliers, dollar amounts, customer counts or "doubled/tripled" language unless the
exact figure appears in verified_proof. If you have no verified number, make the point
in plain operational language with no quantity at all. Do not swap in a different
number, and do not hedge with "up to" or "as much as" — remove the quantity entirely.`;
}

/** The no-invented-numbers rule, for injection into any generation prompt. */
export const NO_FABRICATED_METRICS_RULE = `
NUMBERS — ZERO TOLERANCE:
- Never write a percentage, multiplier (3x), dollar amount, customer/team count, or
  "doubled/tripled" claim unless that exact figure was supplied in verified_proof.
- No hedged versions either ("up to 80%", "as much as half", "most teams see").
- With no verified figure, describe the outcome with no quantity attached. A claim you
  cannot back is worse than no claim: it ends the conversation the email is trying to start.
- Never invent customers, logos, case studies, benchmarks, funding rounds or hires.
- Never sign off with a stand-in identity ("Sender Name", "Your Name", "Your Company").
  Use the sender_name and sender_company values exactly as given.`;

// ─── Grounding ───────────────────────────────────────────────────────────────
//
// A cold email earns a reply by proving it was written for one person. The
// research step already finds real facts — a live job posting, a named product,
// a stated market — and hands them to the generator. The failure this catches is
// the model receiving strong research and writing around it:
//
//   research: 5 findings, 98/100, high confidence
//   draft:    "Your team's focus on verified outcomes suggests you value ROI"
//
// That sentence would be true of any company. Nothing in it could only be true
// of this one, so it reads as a mail merge and gets no reply — which is exactly
// what a 50% open rate with no replies looks like.

/** Words too generic to prove an email was written for a specific prospect.
 *  Every one of these appears in B2B copy regardless of who it is aimed at. */
const GENERIC_TERMS = new Set([
  "sales", "team", "teams", "company", "companies", "business", "businesses",
  "customer", "customers", "client", "clients", "product", "products",
  "platform", "software", "solution", "solutions", "service", "services",
  "market", "markets", "growth", "revenue", "pipeline", "outreach", "outbound",
  "marketing", "process", "processes", "data", "tool", "tools", "technology",
  "founder", "founders", "leader", "leaders", "manager", "managers",
  "people", "users", "work", "working", "help", "helps", "helping",
  "focus", "value", "values", "results", "outcomes", "quality", "scale",
  "scaling", "based", "using", "their", "there", "which", "where", "while",
  "with", "from", "that", "this", "they", "them", "your", "yours", "have",
  "into", "more", "most", "than", "then", "when", "what", "who", "why",
  "recently", "currently", "across", "through", "about", "after", "before",
  // Generic verbs. A fact stated with one of these as its only distinctive
  // word ("they help teams improve pipeline") is not a fact about anyone.
  "improve", "improving", "increase", "increasing", "reduce", "reducing",
  "build", "builds", "building", "built", "make", "makes", "making",
  "provide", "provides", "offer", "offers", "enable", "enables", "deliver",
  "delivers", "support", "supports", "manage", "manages", "drive", "drives",
  "automate", "automates", "automating", "streamline", "optimize", "optimise",
  "personalized", "personalised", "faster", "better", "easier", "efficient",
]);

/**
 * Distinctive terms drawn from what the research actually found.
 *
 * `exclude` should carry the company and contact name: those appear in every
 * draft by construction, so counting them as grounding would pass an email that
 * did nothing but say the company's name back.
 */
export function groundingTerms(facts: string[], exclude: string[] = []): string[] {
  const skip = new Set(
    exclude.flatMap((e) => String(e ?? "").toLowerCase().split(/\W+/)).filter(Boolean),
  );

  const terms = new Set<string>();
  for (const fact of facts) {
    for (const raw of String(fact ?? "").split(/[^A-Za-z0-9.+#-]+/)) {
      const token = raw.replace(/^[.\-]+|[.\-]+$/g, "");
      const lower = token.toLowerCase();
      // Short tokens carry no evidence; generic and excluded ones prove nothing.
      if (token.length < 4) continue;
      if (GENERIC_TERMS.has(lower) || skip.has(lower)) continue;
      terms.add(lower);
    }
  }
  return [...terms];
}

/** Whether the draft references anything the research actually found. */
export function isGroundedIn(text: string, terms: string[]): boolean {
  if (terms.length === 0) return true; // nothing was found, so nothing to use
  const body = String(text ?? "").toLowerCase();
  return terms.some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(body));
}

/**
 * The mirror: telling a prospect what they do, as an analogy for what you do.
 *
 *   "scaling your sales outreach like Raisi scales investor outreach"
 *   "similar to how Raisi automates personalized investor outreach"
 *
 * This passes a grounding check — it does use a fact from the research — while
 * carrying no insight. The reader learns nothing they did not already know
 * about their own company, and the sentence exists to flatter the sender's
 * product. Grounding is a floor; this is a distinct failure above it.
 */
const MIRROR_PATTERNS: RegExp[] = [
  /\b(?:just |much )?like\s+(?:how\s+)?\w[\w'-]*\s+\w+s\b/gi,
  /\bsimilar(?:ly)?\s+to\s+how\b/gi,
  /\bthe\s+way\s+(?:that\s+)?\w[\w'-]*\s+\w+s\s+\w+/gi,
  /\bin\s+the\s+same\s+way\s+(?:that\s+)?\w/gi,
]

/** Mirror-analogy phrasings present in `text`. */
export function findMirrorAnalogies(text: string): string[] {
  const body = String(text ?? "");
  const hits: string[] = [];
  for (const pattern of MIRROR_PATTERNS) {
    for (const m of body.matchAll(new RegExp(pattern))) {
      const hit = m[0].trim();
      if (!hits.includes(hit)) hits.push(hit);
    }
  }
  return hits;
}

/** Retry instruction naming the facts the draft ignored. */
export function groundingRetry(facts: string[]): string {
  const named = facts.slice(0, 4).map((f) => `- ${f}`).join("\n");
  return `
REWRITE REQUIRED — the draft was not specific to this prospect.

Nothing in it could only be true of this company. Research found these facts:
${named}

Open on ONE of them, stated plainly as something you saw. Do not describe what
the company "focuses on" or "values" — that is a guess dressed as research.
Do not restate what they do back to them as an analogy. Reference the actual
detail, then connect it to one consequence they would recognise.`;
}

/**
 * ── Platform brand containment ────────────────────────────────────────────────
 *
 * Every account writes emails for its OWN business. The platform's own brand
 * must never appear in a user's generated draft: a user reported drafts signed
 * "Founder, OutReign" because the generator fell back to the platform name when
 * their profile carried no company. That is a data-bleed class bug, so it is
 * blocked in three places — no platform-name fallback, no platform name inside
 * the prompt text, and this final scrub on the finished draft.
 */
export const PLATFORM_BRAND_NAMES = ["outreign", "salesos", "outreach studio"];

/** Platform-brand mentions found in a draft (empty when the sender IS us). */
export function findPlatformBrandLeaks(text: string, senderCompany = ""): string[] {
  const sender = senderCompany.toLowerCase();
  const hits: string[] = [];
  const body = (text ?? "").toLowerCase();
  for (const brand of PLATFORM_BRAND_NAMES) {
    // The sender may genuinely work here — then the mention is theirs, not a leak.
    if (sender.includes(brand)) continue;
    if (new RegExp(`\\b${brand.replace(/ /g, "\\s+")}\\b`, "i").test(body)) hits.push(brand);
  }
  return hits;
}

/**
 * Remove platform-brand mentions from a draft. Signature lines that name the
 * platform are dropped (or rewritten to the sender's real company); inline
 * mentions are replaced with the sender's company, or "we" when none is known.
 */
export function stripPlatformBrand(text: string, senderCompany = ""): string {
  if (!findPlatformBrandLeaks(text, senderCompany).length) return text ?? "";
  const pattern = new RegExp(
    `\\b(?:${PLATFORM_BRAND_NAMES.map((b) => b.replace(/ /g, "\\s+")).join("|")})\\b`,
    "gi",
  );
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => {
      if (!pattern.test(line)) return line;
      if (/^\s*founder,/i.test(line.trim())) {
        return senderCompany ? `Founder, ${senderCompany}` : "";
      }
      return line.replace(pattern, senderCompany || "we");
    })
    .filter((line, i, arr) => !(line.trim() === "" && (arr[i - 1] ?? "").trim() === ""))
    .join("\n")
    .trim();
}

/** Prompt rule forbidding the platform's own brand in user drafts. */
export const NO_PLATFORM_BRAND_RULE = `
SENDER IDENTITY — ZERO TOLERANCE:
- The only company you may name in the signature is sender_company, exactly as supplied.
- Never name the software you are running inside, and never invent a company for the
  sender. If sender_company is empty, sign with sender_name alone and output no
  "Founder, ..." line at all.`;

// ─── Sign-off block detection ────────────────────────────────────────────────

/**
 * Where the sign-off starts, so it can be rendered tight instead of as a stack
 * of paragraphs.
 *
 * The HTML formatter looked for "Best," / "Regards," / "Thanks," — the exact
 * sign-offs the writing rules forbid. The rule here is sender-first-name-only,
 * so the detector never matched, and "Brandon" / "Founder, BDØT Industries LLC"
 * each became their own paragraph with a full 16px gap. In Gmail that reads as
 * three floating fragments rather than a signature.
 *
 * Returns the index of the first sign-off line, or -1 when the body has no
 * recognisable one. A PS is deliberately NOT part of the block: it belongs
 * after the signature, separated, which is how people actually write one.
 */
export function signOffStartIndex(lines: string[]): number {
  const isPs = (l: string) => /^p\.?\s?s\.?[\s:.-]/i.test(l.trim());

  // A signature line is short, carries no sentence punctuation, and is not a
  // question — "Worth a look?" is the CTA, not the sign-off.
  const isSignatureLine = (l: string) => {
    const t = l.trim();
    if (!t || t.length > 60) return false;
    // A greeting is short and punctuation-light too, and sits at the top. It
    // must never anchor a sign-off block.
    if (/^(hi|hello|hey|dear)\b/i.test(t)) return false;
    if (/[.!?]$/.test(t) && !/^[A-Z][a-z]+,?$/.test(t)) return false;
    return t.split(/\s+/).length <= 6;
  };

  // Walk back from the end over PS lines and blanks to find the real tail.
  let end = lines.length - 1;
  while (end >= 0 && (!lines[end].trim() || isPs(lines[end]))) end--;
  if (end < 0) return -1;

  // If the last real line is a sentence or a question, the email simply has no
  // sign-off — "Worth a quick look at how you do this today?" is the ask.
  if (!isSignatureLine(lines[end])) return -1;

  // Then walk back over the contiguous run of signature-shaped lines.
  let start = end;
  while (start - 1 >= 0) {
    const prev = lines[start - 1];
    if (!prev.trim()) {
      // One blank line inside a signature is normal; two ends it.
      let k = start - 1;
      while (k >= 0 && !lines[k].trim()) k--;
      if (k < 0 || !isSignatureLine(lines[k])) break;
      start = k;
      continue;
    }
    if (!isSignatureLine(prev)) break;
    start--;
  }

  // A single trailing line that is also the whole tail is a sign-off only if it
  // looks like a name — otherwise it is the last sentence of the body.
  if (!isSignatureLine(lines[start])) return -1;
  return start;
}

// ─── Lead field sanity ───────────────────────────────────────────────────────

/**
 * Whether a LinkedIn URL identifies a PERSON rather than an organisation.
 *
 * Providers disagree about what a bare `linkedin` field means, and several use
 * it for the company page. The mapper took the first non-empty value it found,
 * so a company URL was routinely stored as the contact's profile — which is why
 * opening it "doesn't find the person". Personal profiles live under /in/ (or
 * /pub/ on older records); companies under /company/ or /school/.
 */
export function isPersonLinkedIn(url: string): boolean {
  const u = String(url ?? "").toLowerCase();
  if (!u.includes("linkedin.com")) return false;
  if (/linkedin\.com\/(company|school|showcase)\//.test(u)) return false;
  return /linkedin\.com\/(in|pub)\//.test(u);
}

/** Whether a LinkedIn URL identifies an organisation. */
export function isCompanyLinkedIn(url: string): boolean {
  return /linkedin\.com\/(company|school|showcase)\//i.test(String(url ?? ""));
}

/**
 * Reduce whatever the provider called a "website" to a bare hostname.
 *
 * Values arrive as bare domains, full URLs with paths, and occasionally with
 * tracking query strings. Storing them verbatim is why a lead's website
 * sometimes points at a subpage, or at something that is not a site at all.
 * Returns "" when the value cannot be read as a hostname rather than passing
 * junk through.
 */
export function normalizeDomain(value: string): string {
  let v = String(value ?? "").trim().toLowerCase();
  if (!v) return "";
  v = v.replace(/^https?:\/\//, "").replace(/^www\./, "");
  v = v.split(/[/?#]/)[0];              // drop path, query, fragment
  v = v.replace(/:\d+$/, "");           // drop port
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return "";
  if (!/\.[a-z]{2,}$/.test(v)) return "";
  return v;
}

// Mailbox providers: a lead's email being @gmail.com says nothing about whether
// the company domain is right, so those never count as a mismatch.
const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "mail.com", "yandex.com", "zoho.com",
]);

/**
 * True when the email and the company domain disagree in a way worth showing.
 *
 * Not a hard error — acquisitions, rebrands and holding companies all produce
 * legitimate mismatches, and plenty of people use a personal address. It is a
 * signal that one of the two fields was stitched on from a different record,
 * which is the shape of the "website doesn't match" complaint.
 */
export function emailDomainMismatch(email: string, companyDomain: string): boolean {
  const e = String(email ?? "").toLowerCase().split("@")[1] ?? "";
  const c = normalizeDomain(companyDomain);
  if (!e || !c) return false;
  if (PUBLIC_MAIL_DOMAINS.has(e)) return false;
  // Subdomains and country variants of the same brand are not a mismatch:
  // mail.acme.com vs acme.com, acme.co.uk vs acme.com.
  const root = (d: string) => d.split(".").slice(-3).join(".");
  const brand = (d: string) => d.split(".")[0];
  if (e === c || root(e).includes(root(c)) || root(c).includes(root(e))) return false;
  return brand(e) !== brand(c);
}

// ─── Banned-phrase enforcement ───────────────────────────────────────────────

/**
 * Which banned phrases a finished draft still contains.
 *
 * BANNED_PHRASES was only ever injected into the prompt as instruction text.
 * Instructions are advisory: across a real batch of twenty follow-ups, six
 * carried "predictable pipeline", four "without adding headcount", and nothing
 * downstream looked. The list is the house style, so it has to be checked
 * against the output rather than hoped for in the input.
 *
 * Matching is substring-on-lowercase, the same test the prompt block describes,
 * so a phrase cannot be smuggled past by capitalisation.
 */
export function findBannedPhrases(text: string): string[] {
  const haystack = String(text ?? "").toLowerCase();
  return BANNED_PHRASES.filter((p) => haystack.includes(p.toLowerCase()));
}

/**
 * The same openers with the subject pronoun dropped.
 *
 * BANNED_PHRASES is matched as a literal substring, so "I noticed" is caught
 * and "Noticed KOgenie is marking multi-platform launch as coming soon" is not.
 * The clipped form is the *more* obviously templated of the two — it is the
 * register every sequencing tool writes in — so the list was catching the
 * politer variant and waving the worse one through.
 *
 * Anchored to the start of a sentence, because the tell is opening on it. "We
 * noticed a spike in your usage" mid-paragraph is ordinary writing and must not
 * fire.
 */
export const CLIPPED_OPENERS: RegExp[] = [
  /(?:^|[.!?]\s+|\n\s*)(noticed\s+(?:that\s+)?[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(came across\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(saw\s+(?:that\s+|on\s+linkedin|your\s+)[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(was\s+(?:just\s+)?looking\s+at\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(been\s+following\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(was\s+impressed\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(hope\s+(?:this|you)\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(wanted\s+to\s+(?:reach|check|follow)\s+[^.!?\n]*)/i,
  /(?:^|[.!?]\s+|\n\s*)(quick\s+question[^.!?\n]*)/i,
];

/**
 * Clipped openers present in the text, as the matched fragment.
 *
 * Returns what was actually written rather than the pattern, so a finding can
 * quote the sentence back instead of naming a rule the reader cannot see.
 */
export function findClippedOpeners(text: string): string[] {
  const t = String(text ?? "");
  const out: string[] = [];
  for (const re of CLIPPED_OPENERS) {
    const m = t.match(re);
    if (m?.[1]) out.push(m[1].trim().replace(/\s+/g, " "));
  }
  return [...new Set(out)];
}

/**
 * Names in the copy that do not match the lead they were written for.
 *
 * A draft went out reading "Noticed KOgenie is marking..." for a lead whose
 * company is Kogenie. One character, in the first proper noun, and it reads as
 * unchecked automation more loudly than anything else in the email — but no
 * check compared the copy against the row it was drafted from, so nothing saw
 * it.
 *
 * Deliberately narrow, because a false positive here is expensive: it only
 * fires when the body contains the name case-insensitively but never spells it
 * exactly, which is a typo rather than a stylistic choice. A body that does not
 * mention the company at all is fine and says nothing.
 */
export function findNameMismatches(
  body: string,
  lead: { company?: string | null; contactName?: string | null } = {},
): string[] {
  const text = String(body ?? "");
  const out: string[] = [];

  const company = String(lead.company ?? "").trim();
  if (company) {
    const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const loose = text.match(new RegExp(escaped, "gi")) ?? [];
    if (loose.length && !loose.some((hit) => hit === company)) {
      out.push(`"${loose[0]}" should be "${company}"`);
    }
  }

  // The greeting is the one place a wrong name is unrecoverable.
  const contact = String(lead.contactName ?? "").trim();
  const expected = contact.split(/\s+/)[0] ?? "";
  const greeted = text.match(/^\s*(?:hi|hello|hey|dear)\s+([A-Za-z][\w'-]*)/i)?.[1];
  if (expected && greeted && greeted.toLowerCase() !== expected.toLowerCase()) {
    out.push(`greets "${greeted}" but the lead is "${contact}"`);
  }

  return out;
}

/**
 * Pitch language the playbook forbids on a first touch.
 *
 * PLAYBOOK_SYSTEM_RULES calls this non-negotiable: "Touch 1 earns a reply, it
 * does not sell... Do not explain the product, list features, or write 'we
 * built' / 'we help' / 'our platform' on touch 1." Nothing checked it. An
 * email went out reading "Most founders we work with solve it by automating
 * the repetitive parts", the agent flagged it as its own opinion, and the
 * audit said nothing — so a rule the product declares in capitals depended on
 * the model choosing to remember it.
 *
 * Matched against the body with the signature already stripped, because the
 * playbook allows the signature to carry the company and only forbids the
 * pitch in the body.
 *
 * Kept to the constructions the playbook actually enumerates. "We" is not
 * banned outright — the separate you-outnumbers-we rule covers tone; this is
 * specifically the sentence shape that explains what the sender sells.
 */
const TOUCH_ONE_PITCH: RegExp[] = [
  /\bwe(?:'ve| have)?\s+(?:work with|worked with|help|helped|built|build|serve)\b/i,
  /\bour\s+(?:platform|product|software|tool|system|solution)\b/i,
  /\bclients\s+we\s+work\s+with\b/i,
];

export function findTouchOnePitch(text: string): string[] {
  const t = String(text ?? "");
  const out: string[] = [];
  for (const re of TOUCH_ONE_PITCH) {
    // Quote the clause, not the pattern, so a finding can show the sentence.
    const m = t.match(new RegExp(`[^.!?\\n]*${re.source}[^.!?\\n]*`, "i"));
    if (m?.[0]) out.push(m[0].trim().replace(/\s+/g, " "));
  }
  return [...new Set(out)];
}

/**
 * Correct a company name the draft spelled with the wrong capitalisation.
 *
 * The checker was catching these and stopping there: "import2" should be
 * "Import2", "profile sketch" should be "Profile Sketch", "spekit" should be
 * "Spekit" — three drafts in one batch, each waiting on a human to retype a
 * value already sitting on the lead row. A finding that a machine can resolve
 * from data it already holds is a repair, not a question.
 *
 * Two deliberate limits.
 *
 * It only fires when NO occurrence is spelled correctly, the same condition
 * detection uses, so repair and the warning can never disagree. A draft that
 * gets it right once and wrong once is a different problem and is left alone.
 *
 * And it is casing only. The letters must already match; this rewrites how a
 * name is capitalised, never which name is there. Silently swapping one proper
 * noun for another would hide a draft written about the wrong company
 * altogether, which is the failure worth surfacing rather than papering over.
 *
 * URLs and email addresses are skipped — "import2.com" is not a capitalisation
 * error and rewriting inside a link can break it.
 */
export function repairCompanyCasing(
  text: string,
  company: string,
): { text: string; repaired: string[] } {
  const src = String(text ?? "");
  const name = String(company ?? "").trim();
  if (!name) return { text: src, repaired: [] };

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const all = src.match(new RegExp(escaped, "gi")) ?? [];
  if (!all.length || all.some((hit) => hit === name)) return { text: src, repaired: [] };

  const repaired: string[] = [];
  // Not preceded by a word character, @, / or . and not followed by a dot-TLD:
  // enough to leave links and addresses alone without trying to parse them.
  const safe = new RegExp(`(^|[^\\w@/.])(${escaped})(?!\\.[a-z]{2,})(?![\\w@-])`, "gi");
  const out = src.replace(safe, (_m, pre: string, hit: string) => {
    if (hit !== name) repaired.push(`"${hit}" → "${name}"`);
    return `${pre}${name}`;
  });

  return { text: out, repaired: [...new Set(repaired)] };
}

/**
 * Retry instruction naming the phrases to remove.
 *
 * Names them explicitly rather than re-sending the whole banned list: a model
 * told "avoid these 70 phrases" reliably reproduces the one it just used, and a
 * model told "you wrote X, replace it" reliably does not.
 */
export function bannedPhraseRetry(hits: string[]): string {
  return `\nThe draft you just wrote uses filler this sender never ships: ${hits
    .map((h) => `"${h}"`)
    .join(", ")}. Rewrite it without those phrases and without synonyms of them. Say the concrete thing they were standing in for — what actually happens, in the sender's own plain words — or cut the sentence entirely.`;
}

// ─── Sign-off identity ───────────────────────────────────────────────────────

/**
 * The sign-off that is not the sender, or null when the signature is correct.
 *
 * `fillSenderStandIns` only ever caught stand-ins that announce themselves —
 * "[Your Name]", "Sender Name". It cannot see a signature that looks like a
 * real person, and models supply one whenever the sender name reaches them
 * thin. In one batch of twenty, drafts went out signed with the *recipient's*
 * first name, with two invented names, with the company's legal entity, and
 * with nothing at all. Every one of those reads as a mail-merge fault to the
 * person receiving it.
 *
 * Returns "(missing)" when the draft has no sign-off block, the offending line
 * when it has the wrong one, and null when it is right. Returns null when the
 * caller has no sender name to check against — that failure is already handled
 * upstream, and guessing here would be worse than leaving it.
 */
export function signOffMismatch(body: string, senderName: string): string | null {
  const name = String(senderName ?? "").trim();
  if (!name) return null;

  const lines = String(body ?? "").split("\n");
  const idx = signOffStartIndex(lines);
  if (idx < 0) return "(missing)";

  const signed = lines[idx].trim().replace(/[,.]+$/, "");
  const lower = signed.toLowerCase();
  const first = name.split(/\s+/)[0].toLowerCase();
  if (lower === name.toLowerCase() || lower === first) return null;
  return signed;
}

/**
 * Force the signature to name the sender.
 *
 * Deterministic rather than another model round-trip: the correct value is
 * already known, so asking a model to reproduce it is a way of being wrong
 * again. Any trailing company line ("Founder, Acme") is left in place — only
 * the name line is rewritten.
 */
export function enforceSignOff(body: string, senderName: string): string {
  const name = String(senderName ?? "").trim();
  const mismatch = signOffMismatch(body, name);
  if (!mismatch) return body;

  const first = name.split(/\s+/)[0];
  const lines = String(body ?? "").split("\n");
  if (mismatch === "(missing)") return `${String(body ?? "").trimEnd()}\n\n${first}`;

  const idx = signOffStartIndex(lines);
  lines[idx] = first;
  return lines.join("\n");
}

// ─── Circular peer references ────────────────────────────────────────────────

const PEER_NOUNS =
  "companies|teams|founders|firms|brands|businesses|leaders|agencies|startups|orgs|organisations|organizations";

/**
 * Peer references that name the recipient's own company.
 *
 * "We help companies like Purple Horizons build a predictable outbound engine"
 * went to Purple Horizons. Phrased that way it asserts they are already a
 * customer, to the one reader who knows for certain they are not — so it lands
 * as either a mail-merge bug or a lie, and it is often both. "companies like
 * yours" is the correct form and is untouched by this.
 */
/**
 * The peer-reference patterns for one company, or [] when the name is too thin
 * to match on. Detection and repair share this so they cannot drift apart.
 *
 * The company name is rebuilt as a punctuation-tolerant pattern so the record's
 * "Talka AI" still matches the draft's "Talka.ai". Capturing the phrase and
 * comparing it afterwards does not work: the capture has to stop somewhere, and
 * wherever it stops splits names that contain that delimiter.
 */
function selfReferentialPeerPatterns(companyName: string): RegExp[] {
  const company = String(companyName ?? "").trim();
  if (company.length < 3) return [];
  const chunks = company.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (!chunks.length || chunks.join("").length < 3) return [];
  const namePattern = chunks.join("[^a-z0-9]*");

  const leadIns = [`(?:${PEER_NOUNS})\\s+like`, `similar\\s+to`, `such\\s+as`];
  return leadIns.map(
    (leadIn) => new RegExp(`(${leadIn})\\s+(?:the\\s+)?${namePattern}(?![a-z0-9])`, "gi"),
  );
}

export function findSelfReferentialPeers(text: string, companyName: string): string[] {
  const hits: string[] = [];
  for (const pattern of selfReferentialPeerPatterns(companyName)) {
    for (const m of String(text ?? "").matchAll(pattern)) {
      const hit = m[0].trim();
      if (!hits.includes(hit)) hits.push(hit);
    }
  }
  return hits;
}

/**
 * Rewrite the recipient out of their own peer reference.
 *
 * Deterministic rather than a model round-trip, and a repair rather than a
 * refusal: "companies like yours" is what the sentence meant, the rest of the
 * draft is unaffected, and failing an otherwise sound email over one pronoun
 * would cost the user a draft for no gain.
 */
export function repairSelfReferentialPeers(text: string, companyName: string): string {
  let out = String(text ?? "");
  for (const pattern of selfReferentialPeerPatterns(companyName)) {
    out = out.replace(pattern, "$1 yours");
  }
  return out;
}

/** Retry instruction for a draft that used the recipient as its own peer proof. */
export function selfReferentialPeerRetry(hits: string[], companyName: string): string {
  return `\nThe draft presents ${companyName} as an example of who this sender already works with: ${hits
    .map((h) => `"${h}"`)
    .join(", ")}. ${companyName} is the person you are writing TO. Either name a genuinely different company from verified_proof, or write "companies like yours" — never use the recipient as their own reference.`;
}

// ─── Unsupported time claims ─────────────────────────────────────────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const RECENCY_PHRASES = [
  "recently", "just announced", "just launched", "just raised", "just closed",
  "just saw", "last week", "this week", "last month", "this month",
  "a few weeks ago", "the other day", "in the last few weeks", "lately",
  "just now", "days ago", "hot off",
];

/**
 * Time claims the research cannot back.
 *
 * A draft opened "Saw the WeAre acquisition in November" nine months after the
 * fact. Nothing caught it, because the two paths that supply "why now" material
 * were guarded asymmetrically: signal_events is filtered to a freshness window
 * and its date phrasing is deliberately vague, while website observations
 * carried no date at all — so the path that COULD name a month was the path
 * with no check on it.
 *
 * `freshDates` is the normalized dates ("YYYY", "YYYY-MM", "YYYY-MM-DD") of the
 * facts that are actually recent. A month name is unsupported unless some fresh
 * fact falls in that month; a vague recency phrase is unsupported only when
 * nothing recent exists at all, which keeps a legitimate "recently" attached to
 * a genuine fresh signal from being flagged.
 */
export function findUnsupportedRecency(text: string, freshDates: string[] = []): string[] {
  const body = String(text ?? "");
  const lower = body.toLowerCase();
  const hits: string[] = [];

  const freshMonths = new Set(
    freshDates
      .map((d) => {
        const m = String(d ?? "").match(/^\d{4}-(\d{2})/);
        return m ? MONTH_NAMES[Number(m[1]) - 1] : "";
      })
      .filter(Boolean),
  );

  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const month = MONTH_NAMES[i];
    // "May" is also an ordinary verb, so it only counts after a time preposition.
    const pattern = month === "may"
      ? new RegExp(`\\b(?:in|since|back in|during)\\s+may\\b`, "i")
      : new RegExp(`\\b${month}\\b`, "i");
    if (!pattern.test(body)) continue;
    if (freshMonths.has(month)) continue;
    const label = month.charAt(0).toUpperCase() + month.slice(1);
    if (!hits.includes(label)) hits.push(label);
  }

  if (!freshDates.length) {
    for (const phrase of RECENCY_PHRASES) {
      if (lower.includes(phrase) && !hits.includes(phrase)) hits.push(phrase);
    }
  }

  return hits;
}

/** Retry instruction for a draft that dated something the research cannot date. */
export function unsupportedRecencyRetry(hits: string[]): string {
  return `\nThe draft claims timing the research does not support: ${hits
    .map((h) => `"${h}"`)
    .join(", ")}. Nothing in the brief is dated recently enough to say when this happened. Reference the fact without dating it — no month, no "recently", no "just", no "last week". A prospect knows exactly how old their own news is, and getting it wrong reads worse than not mentioning it.`;
}

/* ------------------------------------------------------------------------ *
 * Scaffolding that leaked into the email.
 *
 * A real draft went out of the composer looking like this:
 *
 *   **PROBLEM:** Your platform automates hiring workflows, but ...
 *   **PROMISE:** We provide a unified outbound platform that ...
 *   **PROOF:** (No specific proof provided in the input, so skipping this
 *   section as per instructions.)
 *   **PROPOSAL:** Is this a challenge you are actively addressing?
 *
 * Three separate failures in one message. The 4P's prompt lists the framework
 * as a numbered outline -- "1. PROBLEM -- One clear revenue or operational
 * gap" -- and never says those names are planning labels rather than text, so
 * the model printed them as headings. It wrapped them in markdown, in a mail
 * that is sent as plain text. And where the prompt said "skip entirely if not
 * provided", it narrated its own compliance back to the prompt's author
 * instead of silently skipping.
 *
 * None of the existing guards saw it: the body-only rules covered greetings,
 * sign-offs and placeholder tokens, and the quality score passed it at 83/100.
 * The prospect would have received a filled-in form with a note to the author
 * in the middle of it.
 * ------------------------------------------------------------------------ */

/**
 * Framework beat names, as emitted at the start of a line.
 *
 * Upper-case and followed by a colon, optionally wrapped in markdown. The
 * case matters: "Problem:" could begin a real sentence, "PROBLEM:" is the
 * outline showing through.
 */
const SCAFFOLD_LABEL_REGEX =
  /^[ \t]*(?:\*{1,3}|#{1,6}[ \t]*|_{1,3})?(PROBLEM|PROMISE|PROOF|PROPOSAL|TRIGGER|TEACH|TRUST|THESIS|TENSION|OBSERVATION|PAIN|OPENER|HOOK|BODY|CTA|CLOSE|STEP\s*\d+)(?:\*{1,3}|_{1,3})?[ \t]*:/gm;

/** Markdown emphasis. These are plain-text emails; there is no renderer. */
const MARKDOWN_EMPHASIS_REGEX = /\*\*[^*\n]+\*\*|^#{1,6}[ \t]+\S/gm;

/**
 * The model talking to whoever wrote the prompt, inside the email.
 *
 * Deliberately narrow. Prospects' emails contain parentheticals all the time,
 * so this only fires on the vocabulary of a model reporting back on its own
 * instructions.
 */
const META_COMMENTARY_REGEX =
  /\((?=[^)]*(?:as per (?:the )?instruction|per instructions|no specific [a-z ]{0,30}provided|not provided in the (?:input|context|brief)|skipping this (?:section|part)|omitting this (?:section|part)|as instructed))[^)]{0,300}\)/gi;

/** Everything in the draft that belongs to the prompt rather than the reader. */
export function findScaffolding(email: string): string[] {
  const text = String(email ?? "");
  const found = [
    ...(text.match(SCAFFOLD_LABEL_REGEX) ?? []),
    ...(text.match(MARKDOWN_EMPHASIS_REGEX) ?? []),
    ...(text.match(META_COMMENTARY_REGEX) ?? []),
  ].map((m) => m.trim());
  return [...new Set(found)];
}

export function hasScaffolding(email: string): boolean {
  return findScaffolding(email).length > 0;
}

/**
 * The correction, named precisely.
 *
 * "Do not include scaffolding" would not tell the model what it did. The
 * placeholder retry works because it quotes the token back; this quotes the
 * beat names back and says what they were for.
 */
export const NO_SCAFFOLDING_RETRY = `
YOUR LAST ATTEMPT PRINTED THE OUTLINE INSTEAD OF THE EMAIL.

The framework beats above (PROBLEM, PROMISE, PROOF, PROPOSAL, TRIGGER, and any
others) are how you PLAN the email. They are not headings and they are not text.
The reader must never see those words.

Write the beats as ordinary consecutive paragraphs with nothing labelling them.
No markdown of any kind -- no **bold**, no ## headings, no bullets. This is sent
as plain text and there is no renderer, so the asterisks arrive as asterisks.

If a beat has nothing to say -- no proof was provided, for instance -- leave it
out silently. Do not write a note explaining that you left it out. Nothing in
the email may address the person who wrote these instructions.`;
