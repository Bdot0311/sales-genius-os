import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DOC = readFileSync("docs/ENVIRONMENT.md", "utf8");

/**
 * Why this test exists.
 *
 * ColdIQ was paused for cost and email verification silently stopped proving
 * mailboxes for weeks. Nothing broke, nothing alerted, nothing showed in the
 * UI, and addresses that did not exist shipped. The only reason it went
 * unnoticed that long is that no list of the keys existed -- every one of them
 * was discoverable only by grepping `Deno.env.get`.
 *
 * docs/ENVIRONMENT.md is that list. A list that drifts is worse than none,
 * because it is read as authoritative, so this walks the source and requires
 * the two sets to match: a key the code reads but the doc omits fails here,
 * and so does a key the doc names that nothing reads any more.
 */

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") || path.endsWith(".tsx")) out.push(path);
  }
  return out;
};

const readAll = (dir: string) => walk(dir).map((f) => readFileSync(f, "utf8")).join("\n");

const EDGE = readAll("supabase/functions");
const APP = readAll("src");

const matchAll = (source: string, re: RegExp) =>
  new Set([...source.matchAll(re)].map((m) => m[1]));

const edgeVars = matchAll(EDGE, /Deno\.env\.get\(\s*["']([A-Z0-9_]+)["']/g);
// Vite's own build-time constants, not configuration anybody sets.
const VITE_BUILTINS = new Set(["DEV", "MODE", "SSR", "PROD", "BASE_URL"]);
const appVars = new Set(
  [...matchAll(APP, /import\.meta\.env\.([A-Z0-9_]+)/g)].filter((v) => !VITE_BUILTINS.has(v)),
);

/** A variable counts as documented if the doc names it in backticks, or a
 *  wildcard row covers its family (the Lovable connector keys are managed for
 *  us and arrive as a group). */
const documented = (name: string) =>
  DOC.includes(`\`${name}\``) ||
  (name.startsWith("VITE_LOVABLE_CONNECTOR_") && DOC.includes("`VITE_LOVABLE_CONNECTOR_*`"));

/**
 * SCREAMING_CASE values the code exports, which are not environment variables.
 *
 * `AI_FAST` and `AI_SMART` are the two model tiers; the page names them where
 * it explains which model a call runs on. They are collected from the source
 * so the doc cannot keep naming one after it is deleted.
 */
const exportedConstants = new Set([
  ...matchAll(EDGE, /export const ([A-Z][A-Z0-9_]{3,})\s*[:=]/g),
  ...matchAll(APP, /export const ([A-Z][A-Z0-9_]{3,})\s*[:=]/g),
]);

describe("every key the code reads is written down", () => {
  it("documents every edge function secret", () => {
    const missing = [...edgeVars].filter((v) => !documented(v)).sort();
    expect(missing).toEqual([]);
  });

  it("documents every frontend variable", () => {
    const missing = [...appVars].filter((v) => !documented(v)).sort();
    expect(missing).toEqual([]);
  });

  it("found the keys at all, so an empty walk cannot pass this file", () => {
    // Without this, a glob that silently matched nothing would make both
    // assertions above trivially true.
    expect(edgeVars.size).toBeGreaterThan(50);
    expect(appVars.size).toBeGreaterThan(5);
  });
});

describe("every key the doc names is still read somewhere", () => {
  it("names no variable the code has stopped reading", () => {
    const named = new Set(
      [...DOC.matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)].map((m) => m[1]),
    );
    // Prose tokens that look like a name but are not one: the bare prefix the
    // page uses when explaining which variables are public, and a DNS record
    // type quoted in the deliverability section.
    const notVariables = new Set(["VITE_", "VITE_LOVABLE_CONNECTOR_", "TXT"]);
    const orphans = [...named]
      .filter((v) => !notVariables.has(v))
      .filter((v) => !edgeVars.has(v) && !appVars.has(v))
      .filter((v) => !v.startsWith("VITE_LOVABLE_CONNECTOR_"))
      /*
       * A SCREAMING_CASE name the page explains which is an exported constant
       * rather than a variable anybody sets. The page documents which model
       * each call runs on, and the two tiers are named in code — so they
       * belong on the page, in backticks, without being environment.
       *
       * Checked against the source rather than exempted by name: delete the
       * export and this still fails, which is the point. Anything the doc
       * names that is neither read from the environment nor exported from the
       * code is the stale reference this test is for.
       */
      .filter((v) => !exportedConstants.has(v))
      .sort();
    expect(orphans).toEqual([]);
  });
});

/**
 * The page's claims about behaviour, pinned to the source that produces it.
 * A default that changes without the doc changing is how a page becomes
 * confidently wrong.
 */
describe("the docs folder is reachable from the README", () => {
  it("indexes every page", () => {
    // Every doc in here was an orphan: written, committed, and linked from
    // nowhere. A page nobody can find is a page nobody updates, which is the
    // same failure as not having written it.
    const readme = readFileSync("README.md", "utf8");
    const pages = readdirSync("docs").filter((f) => f.endsWith(".md"));
    const unlinked = pages.filter((f) => !readme.includes(`docs/${f}`)).sort();
    expect(unlinked).toEqual([]);
    expect(pages.length).toBeGreaterThan(1);
  });

  it("links nothing that is not there", () => {
    const readme = readFileSync("README.md", "utf8");
    const linked = [...readme.matchAll(/\(docs\/([A-Z_]+\.md)\)/g)].map((m) => m[1]);
    const present = new Set(readdirSync("docs"));
    expect(linked.filter((f) => !present.has(f))).toEqual([]);
  });
});

describe("what the page says happens is what happens", () => {
  it("quotes the log lines verbatim", () => {
    for (const line of [
      "[detect-tech-signals] BLOOMBERRY_API_KEY not configured",
      "[search-companies] RAILWAY_LEADS_API_URL not configured",
      "[VERIFY-TURNSTILE] TURNSTILE_SECRET_KEY not set - skipping verification",
    ]) {
      expect(DOC).toContain(line);
      expect(EDGE).toContain(line);
    }
  });

  it("states the defaults the code actually applies", () => {
    for (const [value, snippet] of [
      ["support@bdotindustries.com", 'NOTIFICATION_EMAIL") || "support@bdotindustries.com"'],
      ["https://outreign.io", 'APP_URL") ?? "https://outreign.io"'],
      ["eu", 'POSTHOG_REGION") || "eu"'],
      ["reoon", 'EMAIL_VERIFIER_PROVIDER") || "reoon"'],
    ] as const) {
      expect(EDGE).toContain(snippet);
      expect(DOC).toContain(value);
    }
  });

  it("is right that Stripe is the loud one", () => {
    expect(EDGE).toContain("throw new Error('STRIPE_SECRET_KEY is not set')");
    expect(DOC).toContain("Throws `STRIPE_SECRET_KEY is not set`");
  });

  it("is right that the captcha fails open", () => {
    expect(EDGE).toContain("Fail OPEN when the key isn't configured");
    expect(DOC).toContain("Fails open by design");
  });

  it("is right that a verifier with nothing configured never says valid", () => {
    const verifier = readFileSync("supabase/functions/_shared/email-verify.ts", "utf8");
    const dnsOnly = verifier.split("if (!hasPaidVerifier())")[1].split("}")[0];
    expect(dnsOnly).toContain('reason: "Domain accepts mail — mailbox not verified"');
    expect(dnsOnly).not.toContain('status: "valid"');
    expect(DOC).toContain("never returns `valid`");
    expect(DOC).toContain("never returns `invalid`");
  });

  it("is right that only a proven-dead mailbox is refused", () => {
    const send = readFileSync("supabase/functions/send-email/index.ts", "utf8");
    expect(send).toContain("email_verification_status === 'invalid'");
    expect(DOC).toContain("`send-email` refuses only `invalid`");
  });
});
