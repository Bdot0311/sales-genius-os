// Unit tests for the Bloomberry technographic parsing helpers.
// Run: deno test supabase/functions/_tests/bloomberry.test.ts
//
// The provider's reference docs are unreachable from our network, so the parser
// is deliberately written against field-name aliases. These tests pin that
// tolerance: each realistic envelope and field-naming convention must produce
// the same normalized records, and an unrecognized shape must degrade to empty
// rather than throw inside the edge function.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  competitorMatcher,
  looseNameMatcher,
  normalizeCompanySignals,
  normalizeTech,
  recentChanges,
  toDomain,
  toStringArray,
} from "../_shared/bloomberry.ts";

const NOW = Date.parse("2026-08-08T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const never = () => false;

Deno.test("reads a results[] envelope with snake_case date fields", () => {
  const out = normalizeTech({
    results: [{ product: "Salesforce", category: "CRM", start_date: "2025-01-15", end_date: null }],
  }, NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, "Salesforce");
  assertEquals(out[0].category, "CRM");
  assert(out[0].start?.startsWith("2025-01-15"));
  assertEquals(out[0].end, null);
});

Deno.test("reads a data[] envelope with vendor/first_seen naming", () => {
  const out = normalizeTech({
    data: [{ vendor_name: "HubSpot", category_name: "Marketing", first_seen: "2024-06-01", last_seen: "2026-07-01" }],
  }, NOW);
  assertEquals(out[0].name, "HubSpot");
  assertEquals(out[0].category, "Marketing");
  assert(out[0].start?.startsWith("2024-06-01"));
  assert(out[0].end?.startsWith("2026-07-01"));
});

Deno.test("reads a bare top-level array", () => {
  const out = normalizeTech([{ name: "Okta", category: "Identity" }], NOW);
  assertEquals(out[0].name, "Okta");
});

Deno.test("reads a nested company.technologies envelope", () => {
  const out = normalizeTech({ company: { domain: "acme.com", technologies: [{ technology: "Snowflake" }] } }, NOW);
  assertEquals(out[0].name, "Snowflake");
});

Deno.test("category may arrive as an array or an object", () => {
  assertEquals(normalizeTech([{ name: "A", categories: ["Data"] }], NOW)[0].category, "Data");
  assertEquals(normalizeTech([{ name: "B", category: { name: "Security" } }], NOW)[0].category, "Security");
});

Deno.test("unrecognized payloads degrade to empty instead of throwing", () => {
  for (const bad of [null, undefined, 42, "text", {}, { foo: "bar" }, { results: "nope" }]) {
    assertEquals(normalizeTech(bad, NOW).length, 0);
  }
});

Deno.test("records without a usable name are skipped, and names dedupe case-insensitively", () => {
  const out = normalizeTech({ results: [
    { category: "CRM" },
    { product: "Salesforce" },
    { product: "salesforce" },
  ] }, NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, "Salesforce");
});

Deno.test("unparseable and future dates are rejected, not passed through", () => {
  const out = normalizeTech({ results: [
    { product: "A", start_date: "not-a-date" },
    { product: "B", start_date: "2099-01-01" },
  ] }, NOW);
  assertEquals(out[0].start, null);
  assertEquals(out[1].start, null);
});

Deno.test("only changes inside the lookback window count", () => {
  const tech = normalizeTech({ results: [
    { product: "Recent", start_date: daysAgo(10) },
    { product: "Ancient", start_date: daysAgo(400) },
  ] }, NOW);
  const changes = recentChanges(tech, 90, never, NOW);
  assertEquals(changes.length, 1);
  assertEquals(changes[0].item.name, "Recent");
  assertEquals(changes[0].change, "added");
});

Deno.test("a removal is reported as removed, not as an adoption", () => {
  const tech = normalizeTech({ results: [
    { product: "Dropped", start_date: daysAgo(300), end_date: daysAgo(5) },
  ] }, NOW);
  const changes = recentChanges(tech, 90, never, NOW);
  assertEquals(changes[0].change, "removed");
});

Deno.test("a competitor move outranks a more recent generic one", () => {
  const tech = normalizeTech({ results: [
    { product: "Slack", start_date: daysAgo(1) },
    { product: "HubSpot", start_date: daysAgo(30) },
  ] }, NOW);
  const changes = recentChanges(tech, 90, competitorMatcher(["HubSpot"]), NOW);
  assertEquals(changes[0].item.name, "HubSpot");
});

Deno.test("among equals, the most recent change wins", () => {
  const tech = normalizeTech({ results: [
    { product: "Older", start_date: daysAgo(40) },
    { product: "Newer", start_date: daysAgo(2) },
  ] }, NOW);
  assertEquals(recentChanges(tech, 90, never, NOW)[0].item.name, "Newer");
});

Deno.test("competitor matching is loose in both directions and safe when unset", () => {
  const match = competitorMatcher(["HubSpot"]);
  assert(match("HubSpot CRM"));
  assert(match("hubspot"));
  assert(!match("Salesforce"));
  assert(!competitorMatcher([])("HubSpot"));
});

Deno.test("toDomain normalizes stored website values and rejects junk", () => {
  assertEquals(toDomain("https://www.Acme.com/careers?x=1"), "acme.com");
  assertEquals(toDomain("acme.co.uk"), "acme.co.uk");
  for (const bad of [null, "", "not a domain", "localhost"]) assertEquals(toDomain(bad), null);
});

Deno.test("toStringArray handles jsonb arrays, JSON strings and object entries", () => {
  assertEquals(toStringArray(["A", "B"]), ["A", "B"]);
  assertEquals(toStringArray('["A","B"]'), ["A", "B"]);
  assertEquals(toStringArray([{ name: "A" }, { name: "" }, 7]), ["A"]);
  for (const empty of [null, undefined, {}, 5]) assertEquals(toStringArray(empty), []);
});

// --- /signals/tech.json — company-level change records ---------------------

Deno.test("reads company signals with an explicit change field", () => {
  const out = normalizeCompanySignals({ results: [
    { company: "Acme Inc", domain: "acme.com", vendor: "HubSpot", category: "CRM", change: "removed", date: daysAgo(3) },
  ] }, NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].company, "Acme Inc");
  assertEquals(out[0].domain, "acme.com");
  assertEquals(out[0].product, "HubSpot");
  assertEquals(out[0].category, "CRM");
  assertEquals(out[0].change, "removed");
});

Deno.test("maps churn and adoption synonyms to a direction", () => {
  const cases: [string, string][] = [
    ["churned", "removed"], ["dropped", "removed"], ["cancelled", "removed"], ["lost", "removed"],
    ["adopted", "added"], ["new", "added"], ["installed", "added"], ["won", "added"],
  ];
  for (const [word, expected] of cases) {
    const out = normalizeCompanySignals({ results: [{ company: "A", vendor: "X", event: word, date: daysAgo(1) }] }, NOW);
    assertEquals(out[0]?.change, expected, `"${word}" should be ${expected}`);
  }
});

Deno.test("falls back to date shape when no change field is present", () => {
  const removed = normalizeCompanySignals({ results: [{ company: "A", vendor: "X", end_date: daysAgo(2) }] }, NOW);
  assertEquals(removed[0].change, "removed");
  const added = normalizeCompanySignals({ results: [{ company: "B", vendor: "X", start_date: daysAgo(2) }] }, NOW);
  assertEquals(added[0].change, "added");
});

Deno.test("a boolean change flag is honoured", () => {
  assertEquals(normalizeCompanySignals({ results: [{ company: "A", vendor: "X", added: true }] }, NOW).length, 0,
    "'added' is not a direction field, so this record has no determinable direction");
  assertEquals(normalizeCompanySignals({ results: [{ company: "A", vendor: "X", change: true, date: daysAgo(1) }] }, NOW)[0].change, "added");
  assertEquals(normalizeCompanySignals({ results: [{ company: "A", vendor: "X", change: false, date: daysAgo(1) }] }, NOW)[0].change, "removed");
});

Deno.test("records with no determinable direction are dropped, not guessed", () => {
  const out = normalizeCompanySignals({ results: [{ company: "A", vendor: "X" }] }, NOW);
  assertEquals(out.length, 0);
});

Deno.test("a record with neither company nor domain is skipped", () => {
  assertEquals(normalizeCompanySignals({ results: [{ vendor: "X", change: "added", date: daysAgo(1) }] }, NOW).length, 0);
});

Deno.test("company falls back to the domain when the name is missing", () => {
  const out = normalizeCompanySignals({ results: [{ website: "https://www.Acme.com/", vendor: "X", change: "added", date: daysAgo(1) }] }, NOW);
  assertEquals(out[0].company, "acme.com");
  assertEquals(out[0].domain, "acme.com");
});

Deno.test("the company name is never mistaken for the product", () => {
  // "name" carries the company on this endpoint, so product must stay null
  // rather than echoing the company back as the technology it moved on.
  const out = normalizeCompanySignals({ results: [{ name: "Acme Inc", change: "removed", date: daysAgo(1) }] }, NOW);
  assertEquals(out[0].company, "Acme Inc");
  assertEquals(out[0].product, null);
});

Deno.test("duplicate company+product+direction records collapse", () => {
  const out = normalizeCompanySignals({ results: [
    { company: "Acme", vendor: "HubSpot", change: "removed", date: daysAgo(2) },
    { company: "acme", vendor: "hubspot", change: "removed", date: daysAgo(9) },
  ] }, NOW);
  assertEquals(out.length, 1);
});

Deno.test("an add and a remove for the same product are kept apart", () => {
  const out = normalizeCompanySignals({ results: [
    { company: "Acme", vendor: "HubSpot", change: "removed", date: daysAgo(2) },
    { company: "Acme", vendor: "HubSpot", change: "added", date: daysAgo(40) },
  ] }, NOW);
  assertEquals(out.length, 2);
});

Deno.test("company signals come back newest first", () => {
  const out = normalizeCompanySignals({ results: [
    { company: "Old", vendor: "X", change: "added", date: daysAgo(30) },
    { company: "New", vendor: "X", change: "added", date: daysAgo(1) },
    { company: "Mid", vendor: "X", change: "added", date: daysAgo(10) },
  ] }, NOW);
  assertEquals(out.map((c) => c.company), ["New", "Mid", "Old"]);
});

Deno.test("unrecognized signal payloads degrade to empty", () => {
  for (const bad of [null, undefined, {}, "text", { results: "nope" }]) {
    assertEquals(normalizeCompanySignals(bad, NOW).length, 0);
  }
});

// --- the confirmed /enrichments/tech.json shape ----------------------------
// Verbatim records from a real response. These are the regression guard: the
// alias lists were originally guesses, and three of them were wrong
// (vendor_category, usage_started_at, and the epoch-seconds encoding), which
// silently produced null categories and a stack that could never fire a signal.

const REAL_ENRICHMENT = {
  vendors: [
    {
      vendor_url: "360learning.com",
      vendor_name: "360Learning",
      vendor_category: "learning management",
      usage_started_at: 1760500800,
      vendor_upper_level_category: "HR & People Operations",
    },
    {
      vendor_url: "cloud.google.com",
      vendor_name: "Google Cloud",
      vendor_category: "devops",
      usage_started_at: null,
      vendor_upper_level_category: "Development & Engineering",
    },
  ],
};

Deno.test("parses the real vendors[] enrichment payload", () => {
  const out = normalizeTech(REAL_ENRICHMENT, NOW);
  assertEquals(out.length, 2);
  assertEquals(out[0].name, "360Learning");
  assertEquals(out[0].category, "learning management");
  assertEquals(out[0].end, null);
  // 1760500800s -> 2025-10-15
  assert(out[0].start?.startsWith("2025-10-15"), `got ${out[0].start}`);
});

Deno.test("a vendor with a null usage_started_at is still part of the stack", () => {
  const out = normalizeTech(REAL_ENRICHMENT, NOW);
  assertEquals(out[1].name, "Google Cloud");
  assertEquals(out[1].start, null);
  // No date means no signal, but it must not drop out of the current stack.
  assertEquals(out.filter((t) => !t.end).length, 2);
});

Deno.test("falls back to the upper level category when the specific one is absent", () => {
  const out = normalizeTech({ vendors: [
    { vendor_name: "X", vendor_upper_level_category: "Security & Compliance" },
  ] }, NOW);
  assertEquals(out[0].category, "Security & Compliance");
});

Deno.test("epoch seconds and milliseconds both decode, in either field", () => {
  const secs = normalizeTech({ vendors: [{ vendor_name: "A", usage_started_at: 1760500800 }] }, NOW);
  const ms = normalizeTech({ vendors: [{ vendor_name: "B", usage_started_at: 1760500800000 }] }, NOW);
  assertEquals(secs[0].start, ms[0].start);
  assert(secs[0].start?.startsWith("2025-10-15"));
});

Deno.test("a numeric epoch delivered as a string decodes too", () => {
  const out = normalizeTech({ vendors: [{ vendor_name: "A", usage_started_at: "1760500800" }] }, NOW);
  assert(out[0].start?.startsWith("2025-10-15"), `got ${out[0].start}`);
});

Deno.test("a bare year is read as a year, not as an epoch", () => {
  // 2025 seconds after the epoch is 1970. Reading it that way would report a
  // 55-year-old adoption as fact.
  const out = normalizeTech({ vendors: [{ vendor_name: "A", usage_started_at: "2025" }] }, NOW);
  assert(out[0].start?.startsWith("2025-01-01"), `got ${out[0].start}`);
});

Deno.test("implausible and future epochs are rejected", () => {
  const tooOld = normalizeTech({ vendors: [{ vendor_name: "A", usage_started_at: 100_000_000 }] }, NOW); // 1973
  assertEquals(tooOld[0].start, null);
  const future = normalizeTech({ vendors: [{ vendor_name: "B", usage_started_at: 4_000_000_000 }] }, NOW); // 2096
  assertEquals(future[0].start, null);
});

Deno.test("a real recent adoption fires as an added change", () => {
  const recentEpoch = Math.floor((NOW - 10 * 86_400_000) / 1000);
  const tech = normalizeTech({ vendors: [{ vendor_name: "HubSpot", usage_started_at: recentEpoch }] }, NOW);
  const changes = recentChanges(tech, 90, competitorMatcher(["HubSpot"]), NOW);
  assertEquals(changes.length, 1);
  assertEquals(changes[0].change, "added");
  assertEquals(changes[0].item.name, "HubSpot");
});

Deno.test("Talka.ai's actual stack produces no change inside 90 days", () => {
  // The live end-to-end run: 16 vendors written, no signal. Confirming that
  // stays true once the dates actually parse, rather than by accident.
  const tech = normalizeTech(REAL_ENRICHMENT, NOW);
  assertEquals(recentChanges(tech, 90, never, NOW).length, 0);
});

// --- the confirmed /signals/tech.json shape --------------------------------
// A verbatim record from a real response. The envelope key and the churn
// wording were both wrong in the original guess, and the churn wording was the
// dangerous one: "unsubscribed" contains "subscribed", so substring matching
// reported every churn as an adoption.

const REAL_SIGNAL = {
  signals: [{
    id: "11432176",
    domain: "inatba.org",
    region: "Europe",
    country: "BE",
    industry: "Industry Associations",
    vendor_url: "incident.io",
    change_date: "2026-08-07T14:23:53-04:00",
    change_type: "unsubscribed",
    context_url: "https://app.incident.io/inatba",
    vendor_name: "Incident.io",
    company_name: "INATBA - International Association for Trusted Blockchain Applications",
    vendor_category: "incident management",
    change_description: "unsubscribed from Incident.io",
    company_size_range: "2–10",
  }],
};

Deno.test("parses the real signals[] discovery payload", () => {
  const out = normalizeCompanySignals(REAL_SIGNAL, NOW);
  assertEquals(out.length, 1);
  const s = out[0];
  assertEquals(s.company, "INATBA - International Association for Trusted Blockchain Applications");
  assertEquals(s.domain, "inatba.org");
  assertEquals(s.product, "Incident.io");
  assertEquals(s.category, "incident management");
  assertEquals(s.id, "11432176");
  assertEquals(s.evidenceUrl, "https://app.incident.io/inatba");
  assertEquals(s.industry, "Industry Associations");
  assertEquals(s.country, "BE");
  assertEquals(s.sizeRange, "2–10");
  assertEquals(s.description, "unsubscribed from Incident.io");
  assert(s.at?.startsWith("2026-08-07"), `got ${s.at}`);
});

Deno.test("unsubscribed is a churn, never an adoption", () => {
  // The inversion guard. "unsubscribed" contains "subscribed"; if additions were
  // tested first, or the negated form were missing, every churn would surface as
  // a new customer and the displacement motion would run exactly backwards.
  assertEquals(normalizeCompanySignals(REAL_SIGNAL, NOW)[0].change, "removed");
  for (const word of ["unsubscribed", "unsubscribe", "UNSUBSCRIBED"]) {
    const out = normalizeCompanySignals({ signals: [{ company_name: "A", vendor_name: "X", change_type: word, change_date: daysAgo(1) }] }, NOW);
    assertEquals(out[0]?.change, "removed", `"${word}" must be a churn`);
  }
  const added = normalizeCompanySignals({ signals: [{ company_name: "A", vendor_name: "X", change_type: "subscribed", change_date: daysAgo(1) }] }, NOW);
  assertEquals(added[0].change, "added");
});

Deno.test("the vendor's own url is never taken as the company domain", () => {
  // vendor_url is "incident.io" — the tool's site. Reading it as the account's
  // domain would send every signal to the vendor instead of the prospect.
  assertEquals(normalizeCompanySignals(REAL_SIGNAL, NOW)[0].domain, "inatba.org");
});

Deno.test("the provider's signal id dedupes repeats of the same change", () => {
  const dup = { signals: [REAL_SIGNAL.signals[0], { ...REAL_SIGNAL.signals[0], company_name: "Renamed" }] };
  assertEquals(normalizeCompanySignals(dup, NOW).length, 1);
});

Deno.test("a loose vendor match filters a mixed response down to the target", () => {
  // The live call ignored the vendor query parameter and returned everything,
  // so the filter has to hold client-side.
  const mixed = normalizeCompanySignals({ signals: [
    { company_name: "A", vendor_name: "Incident.io", change_type: "unsubscribed", change_date: daysAgo(1) },
    { company_name: "B", vendor_name: "HubSpot CRM", change_type: "unsubscribed", change_date: daysAgo(2) },
  ] }, NOW);
  const match = looseNameMatcher(["HubSpot"]);
  const filtered = mixed.filter((s) => !!s.product && match(s.product));
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].company, "B");
});
