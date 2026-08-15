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
