// @ts-nocheck
// Lead email verification.
//
// Two layers, deliberately ordered cheapest-first:
//
//   1. Free gate (always runs): syntax, disposable domain, role address, MX.
//      Catches typo'd and dead domains for nothing. Domain-level results are
//      cached, so a 100-lead search over ~15 distinct companies costs ~15 DNS
//      lookups, not 100.
//   2. Paid mailbox check (only if a provider key is set): an SMTP handshake
//      against the mailbox itself. This is the layer that actually stops
//      bounces — DNS proves the *domain* accepts mail, never the *mailbox*.
//      Edge functions cannot do this themselves: outbound port 25 is blocked
//      on Supabase, Railway, AWS and effectively every cloud host, so the
//      handshake has to be rented.
//
// Layer 1 runs first so layer 2 is never billed for an address layer 1 already
// disqualified. Both layers cache per-address, so re-searching the same people
// is free.
//
// Provider is swappable via EMAIL_VERIFIER_PROVIDER. Adding one means adding a
// case to callProvider() — nothing else in the codebase knows the vendor.

import { dohQuery, validateDomain } from "./dns.ts";
import { coldiqAuthHeaders, coldiqSpendCap, coldiqVerifyUrl } from "./coldiq.ts";

export type VerificationStatus = "valid" | "catch_all" | "unknown" | "invalid" | "role";

export interface VerificationResult {
  status: VerificationStatus;
  /** true only for `valid`, false only for `invalid`, null when unproven. */
  verified: boolean | null;
  /** Human-readable why, safe to surface in the UI. */
  reason: string;
  /** Which layer decided: "syntax" | "disposable" | "role" | "mx" | "cache" | provider name. */
  source: string;
}

const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days — mailboxes go stale slowly
const MX_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROVIDER_TIMEOUT_MS = 12_000;

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

// Shared mailboxes. Deliverable, but they route to whoever is on rota, convert
// badly, and carry the highest complaint rate of any address class — which is a
// sender-reputation problem, not just a conversion one. Flagged, never dropped:
// for some ICPs (small agencies, local services) info@ is the only address there is.
const ROLE_PREFIXES = new Set([
  "info", "sales", "support", "admin", "contact", "hello", "help", "team",
  "office", "billing", "accounts", "accounting", "hr", "jobs", "careers",
  "marketing", "press", "media", "legal", "privacy", "security", "abuse",
  "postmaster", "webmaster", "noreply", "no-reply", "donotreply", "mail",
  "enquiries", "inquiries", "general", "service", "customerservice",
]);

// Kept in sync with validate-email/index.ts, which gates signup. Same threat,
// different door: there it stops fake accounts, here it stops leads that will
// bounce. Duplicated rather than shared because validate-email is a public
// unauthenticated endpoint and importing across that boundary widens its surface.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "trashmail.com", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz",
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "yopmail.com", "yopmail.fr",
  "fakeinbox.com", "throwawaymail.com", "getnada.com", "nada.email", "getairmail.com",
  "maildrop.cc", "mailnesia.com", "mintemail.com", "spambox.us", "sharklasers.com",
  "grr.la", "dispostable.com", "mailcatch.com", "incognitomail.org", "mvrht.net",
  "tempinbox.com", "mytemp.email", "emailondeck.com", "throwawaymail.io", "spam4.me",
  "trashmail.net", "trashmail.de", "mailtothis.com", "mailforspam.com", "mohmal.com",
  "burnermail.io", "tutanota-temp.com", "mailpoof.com", "tempr.email", "discardmail.com",
  "fakemail.net", "mailbox.in.ua", "mailnull.com", "sneakemail.com", "spambog.com",
  "emltmp.com", "throwam.com", "tmail.ws", "tmpmail.org", "temporary-mail.net",
  "tempmailo.com", "minutemail.com", "minutemail.net", "wegwerfemail.de", "mailtemp.net",
  "moakt.com", "mailto.plus", "fexpost.com", "fexbox.org", "emlhub.com",
  "tempmail.email", "tempmail.us.com", "tempmailfree.com", "tempemail.net",
  "0-mail.com", "0wnd.net", "0wnd.org", "20email.eu", "2prong.com", "30wave.com",
  "33mail.com", "4warding.com", "6paq.com", "7tags.com", "9ox.net", "trbvm.com",
]);

/** Minimal shape we need from the Supabase client, so this module stays
 *  usable from functions that hold an untyped service-role client. */
interface CacheClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): PromiseLike<{ data: { cache_value: unknown; expires_at: string } | null }>;
      };
    };
    upsert(row: Record<string, unknown>, opts: { onConflict: string }): PromiseLike<unknown>;
  };
}

/**
 * Which paid verifier is active, or null for DNS-only.
 *
 * ColdIQ is a special case: it fronts the verification vendors behind the same
 * marketplace key used for lead search, so setting COLDIQ_API_KEY is enough —
 * there is no second key to configure. An explicit EMAIL_VERIFIER_API_KEY still
 * wins, so a direct vendor account can be used for verification even while
 * ColdIQ handles lead search (the cheaper split, since verification is the
 * high-volume call).
 */
function providerName(): string | null {
  const explicitKey = Deno.env.get("EMAIL_VERIFIER_API_KEY");
  if (explicitKey) {
    return (Deno.env.get("EMAIL_VERIFIER_PROVIDER") || "reoon").toLowerCase();
  }
  if (Deno.env.get("COLDIQ_API_KEY")) return "coldiq";
  return null;
}

/** The key for whichever provider providerName() resolved to. */
function providerKey(): string | null {
  return Deno.env.get("EMAIL_VERIFIER_API_KEY") || Deno.env.get("COLDIQ_API_KEY") || null;
}

/** True when a paid mailbox check is available. Callers use this to tell
 *  "inconclusive" apart from "no verifier was ever configured". */
export function hasPaidVerifier(): boolean {
  return providerName() !== null;
}

async function cacheGet(supabase: CacheClient, key: string): Promise<unknown | null> {
  try {
    const { data } = await supabase.from("api_cache")
      .select("cache_value, expires_at").eq("cache_key", key).maybeSingle();
    if (!data?.expires_at) return null;
    return new Date(data.expires_at).getTime() > Date.now() ? data.cache_value : null;
  } catch {
    return null;
  }
}

async function cacheSet(supabase: CacheClient, key: string, value: unknown, ttl: number): Promise<void> {
  try {
    await supabase.from("api_cache").upsert({
      cache_key: key,
      cache_value: value as Record<string, unknown>,
      ttl_seconds: ttl,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    }, { onConflict: "cache_key" });
  } catch (e) {
    // A failed cache write costs money on the next lookup but must never fail
    // the verification itself.
    console.error("[email-verify] cache write failed:", (e as Error).message);
  }
}

/** MX lookup, cached per domain. Falls back to A records — a handful of small
 *  domains still accept mail on an implicit MX. */
async function domainAcceptsMail(supabase: CacheClient, domain: string): Promise<boolean> {
  const key = `email_mx:${domain}`;
  const cached = await cacheGet(supabase, key);
  if (cached && typeof cached === "object" && "mx" in (cached as Record<string, unknown>)) {
    return Boolean((cached as { mx: boolean }).mx);
  }

  const mx = await dohQuery(domain, "MX");
  if (mx.status === -1) {
    // DNS itself failed. Fail open — a resolver blip must not mark a real
    // company undeliverable, and the paid layer will catch it anyway.
    return true;
  }

  let accepts: boolean;
  if (mx.answers.length > 0) {
    accepts = true;
  } else {
    const a = await dohQuery(domain, "A");
    accepts = a.status !== -1 && a.answers.length > 0;
  }

  await cacheSet(supabase, key, { mx: accepts }, MX_CACHE_TTL_SECONDS);
  return accepts;
}

/** Layer 1. Local checks plus DNS — never costs a credit. Returns null when
 *  the address survives, meaning it is worth paying to check properly. */
async function freeGate(supabase: CacheClient, email: string): Promise<VerificationResult | null> {
  if (email.length > 320 || !EMAIL_RE.test(email)) {
    return { status: "invalid", verified: false, reason: "Not a valid email address", source: "syntax" };
  }

  const [local, domain] = email.split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "invalid", verified: false, reason: "Disposable email domain", source: "disposable" };
  }

  // Reject internal/reserved names before they reach a resolver or a vendor.
  if (!validateDomain(domain)) {
    return { status: "invalid", verified: false, reason: "Domain is not publicly routable", source: "syntax" };
  }

  if (!(await domainAcceptsMail(supabase, domain))) {
    return { status: "invalid", verified: false, reason: `${domain} has no mail server`, source: "mx" };
  }

  // Role check runs last: it is a warning, not a rejection, and only worth
  // reporting once the address has cleared the hard failures above.
  if (ROLE_PREFIXES.has(local.toLowerCase())) {
    return { status: "role", verified: null, reason: "Shared mailbox — higher complaint risk", source: "role" };
  }

  return null;
}

/**
 * Find the object actually holding the verdict.
 *
 * A direct vendor answers at the top level. A marketplace like ColdIQ proxies
 * that vendor and usually wraps it — `{ data: {...} }`, `{ result: {...} }` —
 * and which wrapper appears can depend on which vendor the waterfall picked.
 * Without this, `String(obj.result)` on a wrapper object stringifies to
 * "[object Object]", every verdict falls through to `unknown`, and paid checks
 * silently buy nothing.
 */
/**
 * Log the shape of the first successful provider response — keys only, at
 * every level of nesting, never values.
 *
 * A marketplace contract that could not be read up front is pinned from one
 * live call instead, the same way the Bloomberry and PredictLeads schemas
 * were. Once per function instance rather than per address: a 100-lead search
 * would otherwise emit 100 identical lines.
 *
 * Values are excluded deliberately. The payload carries the prospect's email
 * and whatever else the vendor attached to it, and none of that belongs in a
 * log line — the key names alone are what pin the schema.
 */
let shapeLogged = false;
function logVerdictShape(provider: string, body: unknown, resolved: Record<string, unknown>): void {
  if (shapeLogged) return;
  shapeLogged = true;

  const keysOf = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length ? [keysOf(v[0])] : [];
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = val && typeof val === "object" ? keysOf(val) : typeof val;
      }
      return out;
    }
    return typeof v;
  };

  console.log(
    `[email-verify] ${provider} response shape (keys only):`,
    JSON.stringify(keysOf(body)).slice(0, 800),
    "| verdict read from:", JSON.stringify(Object.keys(resolved)).slice(0, 300),
  );
}

function unwrapVerdict(body: unknown): Record<string, unknown> {
  let node = (body ?? {}) as Record<string, unknown>;

  for (let depth = 0; depth < 3; depth++) {
    // A usable verdict is a string field, not another object.
    const direct = node.status ?? node.result ?? node.state ?? node.email_status;
    if (typeof direct === "string") return node;

    const next = [node.data, node.result, node.verification, node.response]
      .find((v) => v && typeof v === "object" && !Array.isArray(v));
    if (!next) return node;
    node = next as Record<string, unknown>;
  }
  return node;
}

/** Map a provider's own vocabulary onto ours. Written defensively — both
 *  vendors have renamed fields before, and an unrecognised verdict must
 *  degrade to `unknown` rather than be guessed at in either direction. */
function interpret(provider: string, body: unknown): VerificationResult {
  const obj = unwrapVerdict(body);
  logVerdictShape(provider, body, obj);
  const raw = String(obj.status ?? obj.result ?? obj.state ?? obj.email_status ?? "")
    .toLowerCase().replace(/[\s-]+/g, "_");

  const isSafe = obj.is_safe_to_send === true || obj.safe_to_send === true;
  const isCatchAll = obj.is_catch_all === true || obj.catch_all === true;
  const isRole = obj.is_role_account === true || obj.role === true;

  if (obj.is_disposable === true) {
    return { status: "invalid", verified: false, reason: "Disposable email domain", source: provider };
  }

  switch (raw) {
    case "valid":
    case "deliverable":
    case "ok":
    case "safe":
      // A catch-all domain can still report "valid" — the handshake succeeds
      // for every address, real or not. Only trust the verdict when the vendor
      // has not also flagged the domain as accept-all.
      if (isCatchAll) {
        return { status: "catch_all", verified: null, reason: "Domain accepts all mail — mailbox unconfirmed", source: provider };
      }
      if (isRole) {
        return { status: "role", verified: null, reason: "Shared mailbox — higher complaint risk", source: provider };
      }
      return { status: "valid", verified: true, reason: "Mailbox confirmed", source: provider };

    case "invalid":
    case "undeliverable":
    case "bad":
    case "disposable":
      return { status: "invalid", verified: false, reason: "Mailbox does not exist", source: provider };

    case "catch_all":
    case "accept_all":
    case "unknown_catch_all":
      return { status: "catch_all", verified: null, reason: "Domain accepts all mail — mailbox unconfirmed", source: provider };

    case "role_account":
    case "role":
      return { status: "role", verified: null, reason: "Shared mailbox — higher complaint risk", source: provider };

    case "risky":
    case "unknown":
    case "spamtrap":
    case "spam_trap":
    case "abuse":
      // "risky" spans spam traps and known complainers. Not provably dead, but
      // never safe to send blind, so it must not be reported as verified.
      return { status: "unknown", verified: null, reason: "Risky address — send at your own discretion", source: provider };

    default:
      if (isSafe && !isCatchAll) {
        return { status: "valid", verified: true, reason: "Mailbox confirmed", source: provider };
      }
      // The unknown vocabulary word is the whole diagnostic here, so the
      // verdict value is logged — but not the rest of the object, which
      // carries the prospect's address alongside it.
      console.warn(
        `[email-verify] unrecognised ${provider} verdict:`, JSON.stringify(raw),
        "| fields present:", JSON.stringify(Object.keys(obj)).slice(0, 300),
      );
      return { status: "unknown", verified: null, reason: "Verification inconclusive", source: provider };
  }
}

/** Layer 2. Rents an SMTP handshake. Returns `unknown` on any provider failure
 *  so an outage degrades to "unproven" rather than to false rejections. */
async function callProvider(email: string): Promise<VerificationResult> {
  const provider = providerName()!;
  const key = providerKey()!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);

  try {
    let res: Response;

    if (provider === "coldiq") {
      // Shape confirmed against the ColdIQ OpenAPI spec: the address goes in a
      // nested `input` object, not at the top level. A flat {email} is rejected.
      res = await fetch(coldiqVerifyUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...coldiqAuthHeaders() },
        body: JSON.stringify({ input: { email }, ...coldiqSpendCap() }),
        signal: ctrl.signal,
      });
    } else {
      const url = provider === "millionverifier"
        ? `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&timeout=10`
        // Reoon. `power` mode performs the SMTP handshake and resolves catch-all
        // domains; `quick` mode would only redo the DNS work layer 1 already did.
        : `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}&mode=power`;
      res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    }

    if (!res.ok) {
      // The body names the actionable cause — wrong path, exhausted credits,
      // rejected address — which the status code alone does not.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[email-verify] ${provider} returned ${res.status}:`, detail);
      return { status: "unknown", verified: null, reason: "Verification unavailable", source: provider };
    }
    return interpret(provider, await res.json());
  } catch (e) {
    console.error(`[email-verify] ${provider} request failed:`, (e as Error).message);
    return { status: "unknown", verified: null, reason: "Verification unavailable", source: provider };
  } finally {
    clearTimeout(timer);
  }
}

/** Verify one address. Cached across searches and across users. */
export async function verifyEmail(supabase: CacheClient, rawEmail: string): Promise<VerificationResult> {
  const email = (rawEmail ?? "").trim().toLowerCase();
  if (!email) {
    return { status: "invalid", verified: false, reason: "No email address", source: "syntax" };
  }

  const cacheKey = `email_verify:${email}`;
  const cached = await cacheGet(supabase, cacheKey);
  if (cached && typeof cached === "object" && "status" in (cached as Record<string, unknown>)) {
    return { ...(cached as VerificationResult), source: "cache" };
  }

  const free = await freeGate(supabase, email);
  // A hard `invalid` is final and worth caching. `role` is not: the paid layer
  // may yet prove the mailbox dead, and we would rather learn that.
  if (free && free.status === "invalid") {
    await cacheSet(supabase, cacheKey, free, CACHE_TTL_SECONDS);
    return free;
  }

  if (!hasPaidVerifier()) {
    // DNS-only. Deliberately never returns `valid` — nothing here has proven a
    // mailbox exists, and claiming otherwise is how bounces get shipped.
    return free ?? {
      status: "unknown",
      verified: null,
      reason: "Domain accepts mail — mailbox not verified",
      source: "mx",
    };
  }

  const paid = await callProvider(email);

  // A provider confirming the mailbox does not cancel the fact that it is a
  // shared one. Vendors disagree about which prefixes count as role accounts,
  // so where ours says role and theirs only says "deliverable", keep ours —
  // they answered a different question (does it exist) than the one that
  // matters here (is it safe to cold-email).
  const resolved: VerificationResult = (free?.status === "role" && paid.status === "valid")
    ? { ...free, source: `${free.source}+${paid.source}` }
    : paid;

  // Provider outages return `unknown`; caching that would poison the address
  // for 30 days over a transient failure.
  if (resolved.status !== "unknown") {
    await cacheSet(supabase, cacheKey, resolved, CACHE_TTL_SECONDS);
  }
  return resolved;
}

/** ColdIQ's synchronous verb takes up to 50 addresses per call, run in
 *  parallel server-side. The cap is theirs, not ours. */
const COLDIQ_BATCH_SIZE = 50;

/**
 * Verify many addresses through ColdIQ in as few requests as possible.
 *
 * The per-address path would send one request each — a hundred round trips for
 * a hundred-lead search, every one of them a chance to hit the deadline. The
 * marketplace accepts `inputs[]` and fans out on its own side, so the same work
 * is two requests.
 *
 * Only addresses that survived the cache and the free gate get here: an address
 * the DNS layer already disqualified is never sent, and the spec bills per
 * conclusively-verified address, so not sending it is not paying for it.
 *
 * Returns only what the provider answered for. Anything missing from the
 * response is left for the caller to treat as unresolved rather than being
 * invented as clean.
 */
async function verifyBatchViaColdIq(emails: string[]): Promise<Map<string, VerificationResult>> {
  const out = new Map<string, VerificationResult>();

  for (let i = 0; i < emails.length; i += COLDIQ_BATCH_SIZE) {
    const chunk = emails.slice(i, i + COLDIQ_BATCH_SIZE);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS * 3);

    try {
      const res = await fetch(coldiqVerifyUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...coldiqAuthHeaders() },
        body: JSON.stringify({
          inputs: chunk.map((email) => ({ email })),
          ...coldiqSpendCap(),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        console.error(`[email-verify] coldiq bulk returned ${res.status}:`, detail);
        continue; // leave this chunk unresolved rather than condemning it
      }

      const payload = await res.json();
      logVerdictShape("coldiq-bulk", payload, unwrapVerdict(payload));

      // Bulk answers arrive under `results`, positionally aligned with inputs.
      const rows = Array.isArray(payload?.results) ? payload.results : [];
      chunk.forEach((email, idx) => {
        const row = rows[idx];
        // A short or gappy array means the provider did not answer for this
        // address. Skipping it leaves it unresolved; filling it in would be
        // inventing a verdict.
        if (row === undefined || row === null) return;
        out.set(email, interpret("coldiq", row));
      });
    } catch (e) {
      console.error("[email-verify] coldiq bulk request failed:", (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  return out;
}

/**
 * Verify a batch, bounded by both concurrency and a wall-clock deadline.
 *
 * A power-mode SMTP check takes seconds, so 100 addresses run serially would
 * blow the function's execution budget. Anything still outstanding when the
 * deadline passes resolves to `unknown` — the caller shows those as unproven
 * rather than letting the whole search time out.
 */
export async function verifyEmails(
  supabase: CacheClient,
  emails: string[],
  opts: { concurrency?: number; deadlineMs?: number } = {},
): Promise<Map<string, VerificationResult>> {
  const concurrency = opts.concurrency ?? 8;
  const deadline = Date.now() + (opts.deadlineMs ?? 25_000);
  const results = new Map<string, VerificationResult>();

  const queue = [...new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean))];

  // ColdIQ verifies up to 50 addresses per request, so resolve everything that
  // needs no request at all first, then send what is left in one or two calls
  // rather than one call per address.
  if (providerName() === "coldiq" && queue.length > 1) {
    const needsProvider: string[] = [];
    const freeVerdicts = new Map<string, VerificationResult>();

    for (const email of queue) {
      if (Date.now() > deadline) break;

      const cacheKey = `email_verify:${email}`;
      const cached = await cacheGet(supabase, cacheKey);
      if (cached && typeof cached === "object" && "status" in (cached as Record<string, unknown>)) {
        results.set(email, { ...(cached as VerificationResult), source: "cache" });
        continue;
      }

      const free = await freeGate(supabase, email);
      if (free?.status === "invalid") {
        await cacheSet(supabase, cacheKey, free, CACHE_TTL_SECONDS);
        results.set(email, free);
        continue; // never sent, never billed
      }
      if (free) freeVerdicts.set(email, free);
      needsProvider.push(email);
    }

    const verdicts = await verifyBatchViaColdIq(needsProvider);

    for (const email of needsProvider) {
      const paid = verdicts.get(email);
      const free = freeVerdicts.get(email);

      if (!paid) {
        // The provider did not answer for this address. Fall back to whatever
        // the free gate concluded rather than reporting it as checked.
        results.set(email, free ?? {
          status: "unknown",
          verified: null,
          reason: "Verification did not complete",
          source: "coldiq",
        });
        continue;
      }

      // Same rule as the single path: a vendor confirming info@ exists answers
      // a different question than whether it is safe to cold-email.
      const resolved = (free?.status === "role" && paid.status === "valid")
        ? { ...free, source: `${free.source}+${paid.source}` }
        : paid;

      if (resolved.status !== "unknown") {
        await cacheSet(supabase, `email_verify:${email}`, resolved, CACHE_TTL_SECONDS);
      }
      results.set(email, resolved);
    }

    // Anything the deadline cut short above never got a verdict.
    for (const email of queue) {
      if (!results.has(email)) {
        results.set(email, {
          status: "unknown",
          verified: null,
          reason: "Verification still pending",
          source: "deadline",
        });
      }
    }
    return results;
  }

  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const email = queue[cursor++];
      if (Date.now() > deadline) {
        results.set(email, {
          status: "unknown",
          verified: null,
          reason: "Verification still pending",
          source: "deadline",
        });
        continue;
      }
      results.set(email, await verifyEmail(supabase, email));
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}
