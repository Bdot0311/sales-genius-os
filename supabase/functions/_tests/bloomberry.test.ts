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
