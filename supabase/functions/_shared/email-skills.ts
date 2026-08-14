/**
 * Choosing which GTM skills to put in front of the model for one email.
 *
 * The frameworks used to be retyped into generate-email's prompts, so the skill
 * and the prompt drifted apart the moment either was edited. The skills are now
 * compiled into skills.generated.ts and injected at request time, which makes
 * the skill the single source of the framework it defines.
 *
 * Everything is routed rather than concatenated. The model has room for all of
 * them — Gemini 2.5 Flash has a very large window — but a prompt carrying six
 * overlapping frameworks writes a worse email than one carrying the framework
 * actually asked for. This picks the few that apply.
 *
 * House rules (brevity, banned phrases, sign-off, claim handling) stay in
 * generate-email. They are product policy rather than skill content, they are
 * enforced by the quality checker, and a skill must not be able to relax them.
 */

import { EMAIL_SKILLS, type EmailSkillName } from "./skills.generated.ts";

/** Read by every request: principles, CTA shape, banned language, QA checklist. */
const CORE: EmailSkillName = "b2b-cold-email-copywriting";

/**
 * Goal to the skills that describe it, beyond the core.
 *
 * Keys are the goal values generate-email already switches on, so adding a
 * framework to a skill makes it available here without touching this table.
 */
const BY_GOAL: Record<string, EmailSkillName[]> = {
  // Trigger-led first touches. email-writing-frameworks holds Short-Trigger,
  // Neutral Insight, Leader Responsibilities, Do the Maths and Challenge of
  // Similar Companies — the shapes these goals draw from.
  "4ts": ["email-writing-frameworks"],
  elusive: ["email-writing-frameworks"],
  proximity: ["email-writing-frameworks"],
  introduction: ["email-writing-frameworks", "outreach-messaging"],

  // Anything later in a sequence needs the position, not just the shape:
  // what email 3 does that email 1 did not, and how a break-up is written.
  "follow-up": ["cold-email-4-sequence"],
  "4ps_followup": ["cold-email-4-sequence"],
  "4ps_elusive_followup": ["cold-email-4-sequence"],

  // Conversation-advancing goals. R.E.P.L.Y. and the value-first framing in
  // outreach-messaging are about earning the next step.
  meeting: ["outreach-messaging"],
  demo: ["outreach-messaging"],
  proposal: ["outreach-messaging"],

  // The autonomous agent's multi-touch sequences. It needs both the position
  // logic (what touch 3 does that touch 1 did not) and the shapes to draw each
  // individual touch from.
  sequence: ["cold-email-4-sequence", "email-writing-frameworks"],
};

/** Rough token estimate — enough to keep a prompt from silently ballooning. */
const approxTokens = (text: string): number => Math.ceil(text.length / 4);

export interface SkillContextOptions {
  /** The goal generate-email is writing for. */
  goal?: string;
  /** True when the request names a template, which pulls the template library. */
  usesTemplate?: boolean;
  /** Ceiling on injected skill text. Generous by default; exists to be visible. */
  maxTokens?: number;
}

/**
 * The skills to inject, most specific first.
 *
 * The core skill is last so that when the budget truncates, the framework the
 * user actually asked for survives and the general principles are what get cut.
 */
export function skillsForGoal(options: SkillContextOptions = {}): EmailSkillName[] {
  const { goal, usesTemplate } = options;
  const picked: EmailSkillName[] = [];

  for (const name of BY_GOAL[String(goal ?? "").toLowerCase()] ?? []) {
    if (!picked.includes(name)) picked.push(name);
  }
  if (usesTemplate && !picked.includes("cold-email-templates-34")) {
    picked.push("cold-email-templates-34");
  }
  // No recognised goal: hand over the orchestrator so the model can pick a
  // shape deliberately instead of defaulting to whatever it reaches for.
  if (!picked.length) picked.push("cold-email-strategist");

  picked.push(CORE);
  return picked;
}

/**
 * The routed skills as prompt text.
 *
 * Each is labelled with its source so the model treats it as reference material
 * rather than instructions from the user, and so a bad output can be traced back
 * to the skill that shaped it.
 */
export function composeSkillContext(options: SkillContextOptions = {}): string {
  const { maxTokens = 12000 } = options;
  const names = skillsForGoal(options);

  const sections: string[] = [];
  let used = 0;
  for (const name of names) {
    const body = EMAIL_SKILLS[name];
    if (!body) continue;
    const section = `--- SKILL: ${name} ---\n${body}`;
    const cost = approxTokens(section);
    if (used + cost > maxTokens) continue;
    sections.push(section);
    used += cost;
  }
  if (!sections.length) return "";

  return [
    "",
    "FRAMEWORKS — these decide the SHAPE of this email.",
    "",
    "Read them, then pick the ONE framework best fitting this specific lead's",
    "evidence, and write to it. Say nothing about which you picked; just write",
    "that shape. Different leads must get different frameworks — a fresh trigger",
    "and a thin segment-level record do not call for the same email. Picking the",
    "same shape for every prospect is the failure mode these exist to prevent.",
    "",
    "Division of authority, so this is unambiguous:",
    "- The frameworks below own SHAPE: which beats the body has, in what order,",
    "  what each one does. They outrank any structure suggested above.",
    "- The rules above own CONSTRAINTS: word count, banned phrases, no pitching on",
    "  a first touch, never naming the product in the body, claim handling,",
    "  signature and output format. A framework can never relax those.",
    "",
    "Any sample sentence in this material is an illustration of a shape, never",
    "wording to reuse. Reproducing an example line verbatim is the single most",
    "common way these emails come out identical to each other. Write the actual",
    "sentence yourself, from this lead's own facts.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

/** Names only — for logging which skills shaped a generation. */
export function skillNamesUsed(options: SkillContextOptions = {}): string[] {
  return skillsForGoal(options);
}
