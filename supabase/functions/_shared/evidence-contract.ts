/**
 * Closed draft release.
 *
 * A quoted excerpt is a source assertion with a retrieval receipt. It is not
 * proof the page is true, and it is not permission to paraphrase. The only
 * sentences this module will release are exact spans copied from a snapshot
 * that matches this tenant, this lead, and this company, plus a fixed
 * template. The model does not get to add a bridge, a P.S., or a case study.
 *
 * A clause detector is used only to refuse spans. It is not the release
 * boundary. The release boundary is the line parser below: one sourced
 * observation, one ask, and the sender's name. `closedRender` is not that
 * parser, and its canned question is not a releasable ask.
 */

import { RESEARCH_TTL_DAYS } from "./lead-research.ts";
import { stripInstructionLines, unsupportedClaims } from "./evidence.ts";

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 hex. Pure so the browser repair and the edge function hash the same bytes. */
function sha256Hex(message: string): string {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 4, bitLen, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, "0")).join("");
}

export const POLICY_VERSION = "research-contract-2026-11-07";

export type SnapshotProvider = "site" | "firecrawl" | "parallel" | "context_dev" | "signal";
export type SnapshotRole = "prospect_page" | "external" | "sender_proof";

export interface StoredSnapshot {
  id: string;
  provider: SnapshotProvider;
  role: SnapshotRole;
  requestedUrl: string;
  finalUrl: string;
  pageStatus: number;
  excerpt: string;
  retrievedAt: string;
  publishedAt: string | null;
  providerOk: boolean;
  partial: boolean;
  fromCache: boolean;
}

export interface ApprovedFact {
  id: string;
  snapshotId: string;
  /** Exact substring of the snapshot excerpt. */
  span: string;
  sourceUrl: string;
  retrievedAt: string;
  publishedAt: string | null;
  role: SnapshotRole;
  provider: SnapshotProvider;
}

export type EvidenceStatus =
  | "ready"
  | "absent"
  | "provider_down"
  | "partial"
  | "stale"
  | "wrong_entity"
  | "conflict"
  | "forged"
  | "insufficient";

export interface EvidenceDecision {
  status: EvidenceStatus;
  reason: string;
  evidenceId: string;
  facts: ApprovedFact[];
  /** Facts that were candidates and then dropped because sources disagreed. */
  conflicts: string[];
}

const CAUSAL = /\bmeans\b|\bthe more\b.+\bthe less\b|\byou(?:'ve| have) solved\b|\balready looking\b/i;
export const SENDER_PROOF = /\bqualified conversations\b|\bwe talk to\b|\bwent from\b|\bone agency\b|\bwithout hiring a sales team\b|\bour clients?\b/i;

export function fingerprint(value: unknown): string {
  return sha256Hex(JSON.stringify(value));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function companyPhrase(company: string): string {
  return company.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sealSnapshot(input: Omit<StoredSnapshot, "id"> & { userId: string; leadId: string }): StoredSnapshot {
  const { userId, leadId, ...stored } = input;
  const id = fingerprint({ userId, leadId, ...canonical(stored) });
  return { ...stored, id };
}

function canonical(s: Omit<StoredSnapshot, "id">) {
  return {
    provider: s.provider,
    role: s.role,
    requestedUrl: s.requestedUrl,
    finalUrl: s.finalUrl,
    pageStatus: s.pageStatus,
    excerpt: s.excerpt,
    retrievedAt: s.retrievedAt,
    publishedAt: s.publishedAt,
    providerOk: s.providerOk,
    partial: s.partial,
    fromCache: s.fromCache,
  };
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => dropRepeatedLead(part.trim()))
    .filter((part) => part.length > 20);
}

/**
 * Scraped pages often run a logo straight into a heading ("Acme Acme builds…").
 * Keep the second copy only; the result is still a verbatim substring of the page.
 */
export function dropRepeatedLead(sentence: string): string {
  const words = sentence.split(/\s+/);
  for (let n = 4; n >= 1; n--) {
    if (words.length <= n * 2) continue;
    const a = words.slice(0, n).join(" ");
    const b = words.slice(n, n * 2).join(" ");
    if (a.toLowerCase() === b.toLowerCase()) return words.slice(n).join(" ");
  }
  return sentence;
}

/** A causal or intent sentence is never an approved prospect fact, even if the page said it. */
export function isInferredClaim(text: string): boolean {
  return CAUSAL.test(text);
}

function factualSpan(sentence: string, excerpt: string): string | null {
  if (isInferredClaim(sentence)) {
    const means = sentence.search(/\bmeans\b/i);
    const prefix = (means > 0 ? sentence.slice(0, means) : "").trim().replace(/[—,:;\s]+$/g, "");
    if (prefix.length < 12 || isInferredClaim(prefix)) return null;
    if (!excerpt.toLowerCase().includes(prefix.toLowerCase())) return null;
    return excerpt.slice(excerpt.toLowerCase().indexOf(prefix.toLowerCase()), excerpt.toLowerCase().indexOf(prefix.toLowerCase()) + prefix.length);
  }
  if (!excerpt.toLowerCase().includes(sentence.toLowerCase())) return null;
  const at = excerpt.toLowerCase().indexOf(sentence.toLowerCase());
  return excerpt.slice(at, at + sentence.length);
}

function nounNumber(text: string, noun: string): string | null {
  const match = text.match(new RegExp(`\\b(\\d[\\d,]*)(?:\\s*\\+)?\\s+${noun}\\b`, "i"));
  return match ? match[1].replace(/,/g, "") : null;
}

const CONFLICT_NOUNS = ["campaigns", "conversations", "employees", "customers", "clients", "weeks", "meetings"];

export function evaluateStoredSnapshots(input: {
  userId: string;
  leadId: string;
  company: string;
  websiteHost: string | null;
  now: string;
  stored: unknown;
}): EvidenceDecision {
  const rows = Array.isArray(input.stored) ? input.stored : [];
  if (!rows.length) {
    return { status: "absent", reason: "No retrieved page is stored for this lead, so nothing was drafted.", evidenceId: "", facts: [], conflicts: [] };
  }
  const now = Date.parse(input.now);
  const accepted: { snap: StoredSnapshot; spans: string[] }[] = [];
  let sawProviderDown = false;
  let sawPartial = false;
  let sawStale = false;
  let sawWrong = false;
  let sawForged = false;
  const company = companyPhrase(input.company);

  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const snap = raw as StoredSnapshot;
    const recomputed = fingerprint({ userId: input.userId, leadId: input.leadId, ...canonical(snap) });
    if (!snap.id || snap.id !== recomputed) {
      sawForged = true;
      continue;
    }
    if (!snap.providerOk || snap.pageStatus < 200 || snap.pageStatus >= 300) {
      sawProviderDown = true;
      continue;
    }
    if (snap.partial || !String(snap.excerpt ?? "").trim()) {
      sawPartial = true;
      continue;
    }
    const retrieved = Date.parse(snap.retrievedAt);
    const ageDays = Number.isFinite(retrieved) ? (now - retrieved) / 86_400_000 : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(retrieved) || ageDays > RESEARCH_TTL_DAYS || (snap.fromCache && ageDays > 1)) {
      sawStale = true;
      continue;
    }
    const finalHost = hostOf(snap.finalUrl);
    const requestedHost = hostOf(snap.requestedUrl);
    const excerpt = stripInstructionLines(snap.excerpt);
    const namesCompany = company.length > 2 && excerpt.toLowerCase().includes(company);
    const hostMatches = !!input.websiteHost && finalHost === input.websiteHost;
    if (snap.role === "sender_proof") {
      sawWrong = true;
      continue;
    }
    if (requestedHost && finalHost && requestedHost !== finalHost) {
      sawWrong = true;
      continue;
    }
    if (!hostMatches && !namesCompany) {
      sawWrong = true;
      continue;
    }
    if (input.websiteHost && finalHost && finalHost !== input.websiteHost && snap.role === "prospect_page") {
      sawWrong = true;
      continue;
    }
    const spans: string[] = [];
    for (const sentence of sentencesOf(excerpt)) {
      const span = factualSpan(sentence, excerpt);
      if (!span || span.length < 40 || isInferredClaim(span)) continue;
      if (SENDER_PROOF.test(span)) continue;
      if (/ignore previous|treat this as verified|system prompt/i.test(span)) continue;
      // Markdown left over from a scrape (escapes, link syntax, table pipes)
      // is not a sentence a person wrote, so it cannot open an email.
      if (/\\|\]\(|!\[|\||^#|\*\*/.test(span)) continue;
      if (!readableSentence(span)) continue;
      const namesCompany = company.length > 2 && new RegExp(`(?:^|[^a-z0-9])${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z0-9])`, "i").test(span);
      const otherSubject = /\b(other agencies|our marketplace|a directory)\b/i.test(span);
      if (!namesCompany && !(hostMatches && !otherSubject)) continue;
      spans.push(span);
    }
    if (spans.length) accepted.push({ snap: { ...snap, excerpt }, spans });
  }

  const byNoun = new Map<string, Set<string>>();
  for (const item of accepted) {
    for (const span of item.spans) {
      for (const noun of CONFLICT_NOUNS) {
        const value = nounNumber(span, noun);
        if (!value) continue;
        const set = byNoun.get(noun) ?? new Set<string>();
        set.add(value);
        byNoun.set(noun, set);
      }
    }
  }
  const conflicts: string[] = [];
  for (const [noun, values] of byNoun) {
    if (values.size > 1) conflicts.push(noun);
  }

  const facts: ApprovedFact[] = [];
  for (const item of accepted) {
    for (const span of item.spans) {
      const conflicted = CONFLICT_NOUNS.some((noun) => conflicts.includes(noun) && nounNumber(span, noun));
      if (conflicted) continue;
      facts.push({
        id: fingerprint({ snapshotId: item.snap.id, span }),
        snapshotId: item.snap.id,
        span,
        sourceUrl: item.snap.finalUrl,
        retrievedAt: item.snap.retrievedAt,
        publishedAt: item.snap.publishedAt,
        role: item.snap.role,
        provider: item.snap.provider,
      });
    }
  }

  // Strongest first: a sentence that names the company, from a dated outside
  // source, reads like news about them; a homepage tagline does not.
  facts.sort((a, b) => factRank(b, company) - factRank(a, company));
  const evidenceId = fingerprint(facts.map((fact) => fact.id).sort());
  if (conflicts.length && !facts.length) {
    return { status: "conflict", reason: `Sources disagree about ${conflicts.join(", ")}, so nothing was drafted.`, evidenceId, facts, conflicts };
  }
  if (!facts.length) {
    const status: EvidenceStatus = sawForged ? "forged" : sawWrong ? "wrong_entity" : sawStale ? "stale" : sawProviderDown ? "provider_down" : sawPartial ? "partial" : "insufficient";
    const reason = status === "forged"
      ? "A stored source id did not match its text, so it was not used."
      : status === "wrong_entity"
        ? "The retrieved page was not this company's site, so nothing was drafted."
        : status === "stale"
          ? "The stored research is older than the retrieval window, so nothing was drafted."
          : status === "provider_down"
            ? "Research retrieval did not succeed, so nothing was drafted."
            : status === "partial"
              ? "Research came back partial or empty, so nothing was drafted."
              : "Retrieved pages did not contain an approved fact, so nothing was drafted.";
    return { status, reason, evidenceId, facts, conflicts };
  }
  return { status: "ready", reason: "", evidenceId, facts, conflicts };
}

export const CLOSED_QUESTION = "Is that still how you're set up?";

/**
 * A sentence a person wrote: at least seven words, not page titles glued
 * together ("agents.Test, monitor"), and not the same phrase repeated.
 */
export function readableSentence(span: string): boolean {
  const text = span.trim();
  if (text.split(/\s+/).length < 7) return false;
  // Directory boilerplate and a possessive whose apostrophe was stripped.
  if (/\bofficial (?:website|site)\b|\bsocial (?:media )?profiles?\b|\bcookies?\b|\bprivacy policy\b|\ball rights reserved\b|\bcontact (?:information|details)\b/i.test(text)) return false;
  if (/[A-Za-z] s\b/.test(text)) return false;
  if (/[→←»›•]|\bfollow [\w.]+ on (?:linkedin|x|twitter)\b|[a-z][A-Z][a-z]+[A-Z]/i.test(text) && /[→←»›•]|follow/i.test(text)) return false;
  // Bylines and legal terms are not observations about the business.
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d/i.test(text)) return false;
  if (/\b(?:terms of|licen[cs]e|liabilit|warrant|separately scoped|bulk delivery|subscribe|sign up|log in)\b/i.test(text)) return false;
  if (/[a-z0-9)][.!?][A-Z]/.test(text)) return false;
  const lower = text.toLowerCase();
  for (let i = 0; i + 20 <= lower.length; i += 5) {
    if (lower.indexOf(lower.slice(i, i + 20), i + 20) >= 0) return false;
  }
  return true;
}

function factRank(fact: ApprovedFact, company: string): number {
  let score = 0;
  if (company.length > 2 && fact.span.toLowerCase().includes(company)) score += 3;
  const words = fact.span.split(/\s+/).length;
  if (words >= 10 && words <= 35) score += 1;
  // The site talking to its visitors ("We talk with you...") reads oddly
  // when quoted back to the company.
  if (/^(?:we|our|you|your)\b/i.test(fact.span.trim()) || /\b(?:you|your)\b/i.test(fact.span)) score -= 1;
  return score;
}

export function closedRender(input: {
  facts: ApprovedFact[];
  firstName: string;
  senderName: string;
}): { subject: string; body: string; factIds: string[] } | null {
  const chosen = input.facts
    .filter((fact) => fact.role !== "sender_proof")
    .filter((fact) => !/https?:\/\//i.test(fact.span))
    .filter((fact) => !/\bwe(?:'ve| have)?\s+(?:work with|worked with|help|helped|built|build|serve)\b/i.test(fact.span))
    .slice(0, 2);
  if (!chosen.length || !input.senderName.trim()) return null;
  const lines = [
    `Hi ${input.firstName || "there"},`,
    "",
    ...chosen.map((fact) => fact.span.trim()),
    "",
    CLOSED_QUESTION,
    "",
    input.senderName.trim(),
  ];
  const subject = chosen[0].span.split(/\s+/).slice(0, 6).join(" ").replace(/[.!?]+$/g, "");
  return { subject, body: lines.join("\n"), factIds: chosen.map((fact) => fact.id) };
}

/**
 * Claims a draft adds beyond the approved sentences.
 *
 * Prose that does not state a new quantity, a sender result, or a
 * consequence can stay. A digit shared with a different claim cannot.
 * There is no trusted source for the sender's own case studies, so those
 * sentences are refused.
 */
function sameLine(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

const EXACT_CTA = new Set(["worth a look?", "open to a look?"]);

/**
 * Strip the source attribution the drafter puts in front of a verbatim quote
 * ("On Acme's site: \"...\""), so the quote still counts as the observation.
 */
export function unattributed(line: string, company: string): string {
  const c = company.trim();
  if (!c) return line;
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = line.match(new RegExp(`^(?:on|from) (?:the )?${esc}(?:'s)? (?:site|website|homepage)[:,]\\s*["“](.+)["”]$`, "i"));
  return m ? m[1].trim() : line;
}

function norm(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "").toLowerCase();
}

export interface BoundClaim {
  sentence: string;
  actor: string;
  verb: string;
  complement: string;
}

/**
 * One source sentence, split once into who did what.
 * Two sentences are never merged. The complement stays in order.
 */
export function bindClaim(sentence: string): BoundClaim | null {
  const text = sentence.trim();
  const voice = text.match(/^(we|our team)\s+([A-Za-z]+)\s+(.+)$/i);
  const match = voice ?? text.match(/^((?:[A-Z][\p{L}0-9&'.-]*(?:\s+[A-Z][\p{L}0-9&'.-]*)*))\s+([A-Za-z]+)\s+(.+)$/u);
  if (!match) return null;
  return {
    sentence: text,
    actor: match[1],
    verb: match[2],
    complement: match[3].replace(/[.?!]+$/g, "").trim(),
  };
}

/**
 * Explicit agreement only. A verb that is not listed is not rewritten.
 * "does" is "do". A final s is not stripped from an unlisted verb.
 */
const YOU_VERB: Record<string, string> = {
  has: "have",
  is: "are",
  does: "do",
  goes: "go",
  hires: "hire",
  builds: "build",
  runs: "run",
  ships: "ship",
  hire: "hire",
  build: "build",
  run: "run",
  ship: "ship",
  go: "go",
};
const NO_QUESTION_VERB = new Set(["has", "is", "are", "does", "have"]);

export function youForm(verb: string): string | null {
  return YOU_VERB[verb.toLowerCase()] ?? null;
}

function prospectVoice(actor: string, company: string): boolean {
  const who = actor.trim().toLowerCase();
  if (who === "we" || who === "our team") return true;
  return company.trim().length > 2 && who === company.trim().toLowerCase();
}

/**
 * Verbatim, or one shift of the prospect's own actor to "you".
 * The complement is copied whole. "our" / "we" / "us" in that complement
 * blocks the shift. Another capitalized actor is not the prospect.
 */
export function matchesClaim(line: string, claim: BoundClaim, company = ""): boolean {
  const got = norm(line);
  if (got === norm(claim.sentence)) return true;
  if (!prospectVoice(claim.actor, company)) return false;
  if (/\b(?:we|our|us)\b/i.test(claim.complement)) return false;
  if (/^(?:been|being)\b/i.test(claim.complement)) return false;
  const verb = youForm(claim.verb);
  if (!verb) return false;
  if (got === norm(`You ${verb} ${claim.complement}`)) return true;
  if (NO_QUESTION_VERB.has(claim.verb.toLowerCase())) return false;
  if (/^(?:not|never)\b/i.test(claim.complement)) return false;
  return got === norm(`Do you still ${verb} ${claim.complement}`);
}

/** Subject, body, evidence id, and policy. Send paths hash this string. */
export function releaseBinding(subject: string, body: string, evidenceId: string): string {
  return `${subject}\n${body}\n${evidenceId}\n${POLICY_VERSION}`;
}

function quantityPhrases(text: string): string[] {
  return [...text.matchAll(/\b\d[\d,]*(?:\s*(?:to|-)\s*\d[\d,]*)?\b/g)].map((match) => match[0]);
}

/** A subject may repeat a contiguous piece of one sentence. It may not keep half of a quantity. */
export function subjectAllowed(subject: string, sentences: string[]): boolean {
  const got = norm(subject);
  if (!got) return true;
  for (const sentence of sentences) {
    if (!norm(sentence).includes(got)) continue;
    const dropsQuantity = quantityPhrases(sentence).some((phrase) => {
      const piece = phrase.split(/\s+/).some((part) => /\d/.test(part) && got.includes(norm(part)));
      return piece && !got.includes(norm(phrase));
    });
    if (!dropsQuantity) return true;
  }
  return false;
}

/**
 * A line is the greeting, the sender's name, an exact CTA, one approved
 * sentence, or that sentence with the actor changed to "you".
 * Shared words are not enough: the actor, verb, and complement stay together.
 */
function isAsk(line: string): boolean {
  const compact = line.toLowerCase().replace(/\s+/g, " ");
  return EXACT_CTA.has(compact) || /\?\s*$/.test(line);
}

export type DraftShape = "first_touch" | "continuation";

/**
 * First touch: greeting, one sourced observation, one ask, sender name.
 * Continuation keeps that claim allow-list and may omit the ask. It is not
 * rewritten into a first-touch snippet. A second ask is refused in both.
 */
const STOP = new Set(("that this with from your they their have will what when about into just more than them then were been also only very much some such like here there which would could should these those our we you are and for the its it's".split(" ")));

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'&-]*/g) ?? [])
    .map((w) => w.replace(/'s$/, ""))
    .filter((w) => w.length > 3 && !STOP.has(w));
}

const RESULT_CLAIM = /\b(?:helped|increased|grew|saved|boosted|doubled|tripled|reduced|cut|generated|percent|clients like|customers like|case study)\b|%/i;
const PROPOSAL = /\b(?:could|might|one idea|an idea|imagine|what if|would it|curious|happy to|can help|we can|i can|worth)\b/i;

export type LineGrounding = "offer" | "idea" | null;

/**
 * A line that is not the researched observation. It may describe the
 * sender's offer (only words from the sender's own description) or suggest
 * an idea (could / might / one idea) that connects that offer to the
 * researched topic. It may not state anything as known about the prospect:
 * no new number, no name, no result, no "saw/noticed". The researched fact
 * itself is only ever quoted or shifted to "you" by the closed rule.
 */
export function lineGrounding(line: string, facts: string[], senderCorpus = "", company = ""): LineGrounding {
  const factText = facts.join(" \n ").toLowerCase();
  const senderText = senderCorpus.toLowerCase();
  const known = `${factText} ${senderText} ${company.toLowerCase()}`;
  // Numbers only from the sender's own description; a researched number is
  // used only inside the quoted fact, where its relation is intact.
  for (const digits of line.match(/\d[\d,.]*/g) ?? []) {
    if (!senderText.includes(digits.toLowerCase())) return null;
  }
  const words = line.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^\p{L}0-9.&-]/gu, "").replace(/'s$/, "");
    if (!w || w === "I" || !/^\p{Lu}/u.test(w)) continue;
    if (/[.!?:]$/.test(words[i - 1])) continue;
    if (!senderText.includes(w.toLowerCase()) && !(company && company.toLowerCase().includes(w.toLowerCase()))) return null;
  }
  const result = line.match(RESULT_CLAIM);
  if (result && !senderText.includes(result[0].toLowerCase())) return null;
  if (/\b(?:saw|noticed|congrats|congratulations|read that|heard|i see|looks like you|you(?:'re| are) (?:struggling|losing|missing))\b/i.test(line)) return null;
  if (/\b(?:not|never|no longer|don't|doesn't|didn't|isn't|aren't)\b/i.test(line)) return null;
  const mine = contentWords(line);
  const share = (corpus: string) => mine.filter((w) => corpus.includes(w)).length;
  if (senderText && /\b(?:we|our|i)\b/i.test(line) && !PROPOSAL.test(line)) {
    if (mine.length && share(senderText) / mine.length >= 0.5) return "offer";
    return null;
  }
  if (PROPOSAL.test(line)) {
    if (!mine.length || share(known) / mine.length >= 0.5) return "idea";
  }
  // A question asks; it states nothing as known. Its topic must still come
  // from the research or the sender's description.
  if (/\?\s*$/.test(line) && mine.length && share(known) / mine.length >= 0.5) return "idea";
  return null;
}

function subjectGrounded(subject: string, facts: string[], senderCorpus: string, company: string): boolean {
  const known = `${facts.join(" ")} ${senderCorpus} ${company}`.toLowerCase();
  if (/\d/.test(subject) && !(subject.match(/\d[\d,.]*/g) ?? []).every((d) => known.includes(d))) return false;
  return contentWords(subject).every((w) => known.includes(w));
}

export function bodyViolations(
  body: string,
  decision: EvidenceDecision,
  senderName = "",
  subject = "",
  company = "",
  shape: DraftShape = "first_touch",
  senderCorpus = "",
): string[] {
  const facts = decision.facts.filter((fact) => fact.role !== "sender_proof");
  if (!facts.length) return ["No approved research is stored for this company."];
  const spans = facts.map((fact) => fact.span);
  const violations: string[] = [];
  if (subject.trim() && !subjectAllowed(subject, spans) && !subjectGrounded(subject, spans, senderCorpus, company)) {
    violations.push(subject.trim());
  }
  const lines = body.split("\n").map((part) => part.trim()).filter(Boolean);
  let observations = 0;
  let words = 0;
  for (const line of lines) {
    if (/^Hi [^,\n]{1,60},$/i.test(line)) continue;
    // The sign-off may be the sender's full name or just their first name.
    if (senderName && (sameLine(line, senderName) || sameLine(line, senderName.trim().split(/\s+/)[0]))) continue;
    words += line.split(/\s+/).length;
    if (EXACT_CTA.has(line.toLowerCase().replace(/\s+/g, " "))) continue;
    if (/https?:\/\//i.test(line)) {
      violations.push(line);
      continue;
    }
    const bare = unattributed(line, company);
    const exact = facts.some((fact) => {
      if (norm(line) === norm(fact.span)) return true;
      if (bare !== line && fact.role === "prospect_page" && norm(bare) === norm(fact.span)) return true;
      const claim = bindClaim(fact.span);
      return !!claim && fact.role === "prospect_page" && matchesClaim(line, claim, company);
    });
    if (exact) { observations += 1; continue; }
    // Not the observation: each sentence must be a grounded offer or idea.
    const parts = line.split(/(?<=[.!?])\s+/).filter(Boolean);
    const lineOk = parts.every((part) =>
      lineGrounding(part, spans, senderCorpus, company) !== null
      // A short question carries no claim ("Worth a quick chat?").
      || (isAsk(part) && !/\d/.test(part) && contentWords(part).length <= 3 && !/\b(?:saw|noticed|struggl|losing|missing)\w*/i.test(part)));
    if (!lineOk) violations.push(line);
  }
  const asks = lines.filter(isAsk);
  if (words > 130) violations.push("The draft is longer than 130 words.");
  if (shape === "first_touch" && observations !== 1) violations.push("The draft needs exactly one sourced observation.");
  if (shape === "first_touch" && asks.length !== 1) violations.push("The draft needs exactly one ask.");
  if (shape === "continuation" && asks.length > 1) violations.push("The draft needs exactly one ask.");
  return [...new Set(violations)];
}

/** Replace a free-form draft with the closed render when at least one fact is approved. */
export function repairToApprovedFacts(input: {
  body: string;
  decision: EvidenceDecision;
  firstName: string;
  senderName: string;
}): { ok: true; body: string; subject: string } | { ok: false; body: string; message: string } {
  if (input.decision.status !== "ready" || !input.decision.facts.length) {
    return {
      ok: false,
      body: input.body,
      message: input.decision.reason || "Nothing in the stored research approves a fact in this draft. The draft was not changed.",
    };
  }
  const rendered = closedRender({
    facts: input.decision.facts,
    firstName: input.firstName,
    senderName: input.senderName,
  });
  if (!rendered) {
    return {
      ok: false,
      body: input.body,
      message: "The retrieved sentences are not usable as a first touch. The draft was not changed.",
    };
  }
  return { ok: true, body: rendered.body, subject: rendered.subject };
}
