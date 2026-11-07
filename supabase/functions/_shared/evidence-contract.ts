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
 * boundary. The release boundary is `closedRender`: if the text was not
 * produced by that function from approved fact ids, generation does not
 * return it.
 */

import { RESEARCH_TTL_DAYS } from "./lead-research.ts";
import { stripInstructionLines } from "./evidence.ts";

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

export type SnapshotProvider = "site" | "parallel" | "context_dev" | "signal";
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
    .map((part) => part.trim())
    .filter((part) => part.length > 20);
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
    if (requestedHost && finalHost && requestedHost !== finalHost && finalHost !== input.websiteHost) {
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
      if (!span || !/\d/.test(span) || isInferredClaim(span)) continue;
      if (SENDER_PROOF.test(span)) continue;
      if (company.length > 2 && !span.toLowerCase().includes(company)) continue;
      if (/ignore previous|treat this as verified|system prompt/i.test(span)) continue;
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

function sameLine(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * A line may be sent only when it is the greeting, the one fixed question,
 * the sender's name, or an approved span copied exactly. A shared digit is
 * not enough, and a sender case study has no approved source.
 */
export function bodyViolations(body: string, decision: EvidenceDecision, senderName = ""): string[] {
  const allowed = decision.facts.filter((fact) => fact.role !== "sender_proof");
  const violations: string[] = [];
  for (const line of body.split("\n").map((part) => part.trim()).filter(Boolean)) {
    if (/^Hi [^,\n]{1,60},$/.test(line)) continue;
    if (line === CLOSED_QUESTION) continue;
    if (senderName && sameLine(line, senderName)) continue;
    if (!/[.?!]/.test(line) && !/\d/.test(line) && !/\b(you|your|we|our|means)\b/i.test(line) && line.length < 80) continue;
    if (allowed.some((fact) => sameLine(line, fact.span))) continue;
    violations.push(line);
  }
  return violations;
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
