// Unit tests for the PredictLeads news-event parser.
// Run: deno test supabase/functions/_tests/predictleads.test.ts
//
// docs.predictleads.com is unreachable from our network, so the parser reads
// fields through alias lists. These pin that tolerance, and pin the two
// judgement calls that matter more than parsing: contraction news is not a
// buying signal, and an unmapped category is kept rather than dropped.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractEvents, normalizeNewsEvents, topSignal } from "../_shared/predictleads.ts";

const NOW = Date.parse("2026-08-16T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

Deno.test("reads a data[] envelope", () => {
  const out = normalizeNewsEvents({ data: [
    { category: "receives_financing", title: "Acme raises $12M Series A", url: "https://x.com/a", found_at: daysAgo(3) },
  ] }, NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].signalType, "funding_raised");
  assertEquals(out[0].weight, 40);
  assertEquals(out[0].url, "https://x.com/a");
});

Deno.test("unwraps JSON:API attributes", () => {
  // Their v3 responses nest the record under `attributes`; without flattening
  // every field would read as null and every event would be dropped.
  const out = normalizeNewsEvents({ data: [
    { id: "1", type: "news_event", attributes: { category: "launches", title: "Ships v2", found_at: daysAgo(2) } },
  ] }, NOW);
  assertEquals(out.length, 1);
  assertEquals(out[0].category, "launches");
  assertEquals(out[0].signalType, "product_launch");
});

Deno.test("contraction news is not scored as intent", () => {
  // Layoffs and closures mean a company is contracting. Scoring them would put
  // the accounts least able to buy at the top of the queue.
  const out = normalizeNewsEvents({ data: [
    { category: "closes_offices", title: "Shuts Berlin office", found_at: daysAgo(1) },
    { category: "decreases_headcount_by", title: "Cuts 12%", found_at: daysAgo(1) },
    { category: "files_for_bankruptcy", title: "Chapter 11", found_at: daysAgo(1) },
  ] }, NOW);
  assertEquals(out.length, 0);
});

Deno.test("an unmapped category is kept at the bottom of the ladder", () => {
  // They add categories over time; a silent drop would lose real events.
  const out = normalizeNewsEvents({ data: [{ category: "some_new_category", title: "X", found_at: daysAgo(1) }] }, NOW);
  assertEquals(out[0].signalType, "company_news");
  assertEquals(out[0].weight, 10);
});

Deno.test("categories normalize across spacing and case", () => {
  for (const c of ["Receives Financing", "receives-financing", "RECEIVES_FINANCING"]) {
    const out = normalizeNewsEvents({ data: [{ category: c, title: "t", found_at: daysAgo(1) }] }, NOW);
    assertEquals(out[0]?.signalType, "funding_raised", `failed for ${c}`);
  }
});

Deno.test("epoch dates decode, and a bare year is not read as one", () => {
  const secs = Math.floor((NOW - 5 * 86_400_000) / 1000);
  assert(normalizeNewsEvents({ data: [{ category: "launches", title: "t", found_at: secs }] }, NOW)[0].at?.startsWith("2026-08-11"));
  assert(normalizeNewsEvents({ data: [{ category: "launches", title: "t", found_at: "2025" }] }, NOW)[0].at?.startsWith("2025-01-01"));
});

Deno.test("the strongest event wins, not merely the newest", () => {
  // A funding round from three weeks ago outranks a partnership from yesterday.
  const out = normalizeNewsEvents({ data: [
    { category: "partners_with", title: "Partners with X", found_at: daysAgo(1) },
    { category: "receives_financing", title: "Raises $20M", found_at: daysAgo(21) },
  ] }, NOW);
  assertEquals(topSignal(out, 90, NOW)?.signalType, "funding_raised");
});

Deno.test("events outside the window are ignored", () => {
  const out = normalizeNewsEvents({ data: [{ category: "receives_financing", title: "Old round", found_at: daysAgo(400) }] }, NOW);
  assertEquals(topSignal(out, 90, NOW), null);
});

Deno.test("duplicate coverage of one event collapses", () => {
  const out = normalizeNewsEvents({ data: [
    { category: "receives_financing", title: "Acme raises $12M", found_at: daysAgo(2) },
    { category: "receives_financing", title: "Acme raises $12M", found_at: daysAgo(3) },
  ] }, NOW);
  assertEquals(out.length, 1);
});

Deno.test("unrecognized payloads degrade to empty instead of throwing", () => {
  for (const bad of [null, undefined, 42, "text", {}, { data: "nope" }]) {
    assertEquals(normalizeNewsEvents(bad, NOW).length, 0);
    assertEquals(extractEvents(bad).length, 0);
  }
});

Deno.test("an event with no category is skipped rather than guessed", () => {
  assertEquals(normalizeNewsEvents({ data: [{ title: "Something happened", found_at: daysAgo(1) }] }, NOW).length, 0);
});
