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
- Total email body MUST stay under 75 words. Count carefully.
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
  /\b(?:one|a|an|another)\s+(?:\w+[\s-]+){0,3}(?:firm|company|client|customer|team|agency|startup|business|brand)\b[^.?!]{0,60}?\b(?:saw|achieved|reported|generated|booked|increased|reduced|cut|doubled|grew)\b/gi,
  // magnitude word with no magnitude
  /\b(?:significant|substantial|meaningful|noticeable|dramatic|marked|considerable|sizeable)\s+(?:increase|lift|improvement|boost|jump|gain|growth|reduction|drop|decrease)\b/gi,
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
