import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const MIG = readFileSync(
  "supabase/migrations/20260906120000_capture_blacklist_and_placement_events.sql",
  "utf8",
);
const TIMELINE = readFileSync("src/components/deliverability/EventTimeline.tsx", "utf8");
const HOOK = readFileSync("src/hooks/use-deliverability-timeline.tsx", "utf8");

/**
 * "What changed" was blank, and the triggers were not the reason — the SQL
 * confirmed both event-capture triggers exist. The reason is narrower and
 * worse: EventTimeline rendered sixteen event types and only eight were ever
 * produced. Among the missing seven were the two that most often explain a
 * chart.
 *
 * A blacklist listing is the largest single thing that can happen to a
 * sender, and the nightly sweep that finds it raised an alert and wrote
 * nothing to the timeline. So placement could collapse on the day a domain
 * got listed and the panel would say nothing had changed.
 */
describe("a blacklist verdict reaches the timeline", () => {
  it("has a trigger on the table the sweep writes to", () => {
    expect(MIG).toContain("AFTER INSERT ON public.blacklist_checks");
    expect(MIG).toContain("record_blacklist_event");
  });

  it("writes both directions", () => {
    expect(MIG).toContain("'blacklist_listed'");
    expect(MIG).toContain("'blacklist_cleared'");
  });

  it("only fires on a change of verdict", () => {
    // The sweep runs nightly. A domain clean for a month must not write a
    // "cleared" row every single night.
    expect(MIG).toContain("ELSIF v_was_listed = NEW.listed THEN");
    expect(MIG).toMatch(/ORDER BY b\.checked_at DESC/);
  });

  it("compares against the same target on the same list", () => {
    // Two RBLs disagreeing about one domain are two separate facts.
    expect(MIG).toContain("AND b.target = NEW.target");
    expect(MIG).toContain("AND b.rbl_name = NEW.rbl_name");
  });

  it("excludes the row being inserted from its own history", () => {
    expect(MIG).toContain("AND b.id <> NEW.id");
  });

  it("treats a first clean check as a baseline, not news", () => {
    expect(MIG).toContain("IF v_was_listed IS NULL THEN");
    expect(MIG).toContain("IF NOT NEW.listed THEN RETURN NEW; END IF;");
  });

  it("tells the reader what to do about a listing", () => {
    expect(MIG).toMatch(/Request delisting/);
  });
});

describe("a placement test reaches the timeline", () => {
  it("has a trigger on the test table", () => {
    expect(MIG).toContain("AFTER UPDATE ON public.placement_tests");
  });

  it("fires only on a status transition, so a second touch does not double-log", () => {
    expect(MIG).toContain("IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;");
  });

  it("reads the column the results table actually has", () => {
    // placement, not folder. The first draft of this trigger used a column
    // name that does not exist and would have failed on every completed test.
    expect(MIG).toContain("r.placement = 'inbox'");
    expect(MIG).not.toContain("r.folder");
  });

  it("does not count a provider with no seed inbox as a miss", () => {
    expect(MIG).toContain("r.placement NOT IN ('unsupported', 'pending')");
  });

  it("records a failed test rather than staying silent about it", () => {
    expect(MIG).toContain("'Placement test did not complete'");
  });
});

describe("the timeline only claims events that can happen", () => {
  const styled = [...TIMELINE.matchAll(/^ {2}([a-z_]+): +\{ icon:/gm)].map((m) => m[1]);

  it("finds the style map, so this cannot pass vacuously", () => {
    expect(styled.length).toBeGreaterThan(5);
  });

  it("no longer lists types nothing writes", () => {
    // A map of events that cannot happen reads as a feature list.
    for (const dead of ["dns_changed", "quarantine_released", "copy_edited", "campaign_launched"]) {
      expect(styled, `${dead} is styled but never written`).not.toContain(dead);
    }
  });

  it("styles the two this change starts producing", () => {
    expect(styled).toContain("blacklist_listed");
    expect(styled).toContain("blacklist_cleared");
    expect(styled).toContain("placement_test");
  });

  it("keeps a fallback, so a type added later renders instead of crashing", () => {
    expect(TIMELINE).toContain("const FALLBACK");
  });
});

/**
 * The query discarded its error, so a failing request rendered the empty state
 * — and the empty state says "Nothing has changed in the last 30 days", which
 * is a claim about the account that a failed query has not established.
 */
describe("a failure is not reported as nothing having happened", () => {
  it("the hook surfaces the error instead of swallowing it", () => {
    expect(HOOK).toContain("if (error) throw error;");
    expect(HOOK.match(/if \(error\) throw error;/g)?.length).toBe(2);
  });

  it("the panel says so rather than showing the quiet-month copy", () => {
    expect(TIMELINE).toContain("isError");
    expect(TIMELINE).toMatch(/not a statement that nothing changed/i);
  });

  it("still shows the quiet-month copy when the query genuinely returns none", () => {
    expect(TIMELINE).toMatch(/Nothing has changed in the last \{days\} days/);
  });
});
