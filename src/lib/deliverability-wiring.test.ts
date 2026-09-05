import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bounceVerdict, complaintVerdict } from "./deliverability-verdict";
import {
  BOUNCE_AT_RISK,
  BOUNCE_CRITICAL,
  BOUNCE_FAILING,
  bounceSeverity,
  complaintSeverity,
} from "../../supabase/functions/_shared/deliverability-thresholds";

const APP = readFileSync("src/App.tsx", "utf8");
const VERDICT = readFileSync("src/lib/deliverability-verdict.ts", "utf8");
const SCAN = readFileSync("supabase/functions/deliverability-alerts-scan/index.ts", "utf8");

/**
 * "Verify your list" navigated to /leads. The route is /dashboard/leads, and
 * App.tsx ends in a catch-all that renders NotFound — so the one button on the
 * tile that names the fix threw the user onto a 404.
 */
describe("every action button goes somewhere real", () => {
  const targets = [...VERDICT.matchAll(/kind: "navigate", target: "([^"]+)"/g)].map((m) => m[1]);

  it("finds the buttons at all, so this test cannot pass vacuously", () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  it("points every absolute target at a declared route", () => {
    for (const t of targets.filter((x) => x.startsWith("/"))) {
      expect(APP, `no route for ${t}`).toContain(`path="${t}"`);
    }
  });

  it("no longer points at the route that renders NotFound", () => {
    expect(targets).not.toContain("/leads");
    expect(APP).toContain('path="/dashboard/leads"');
  });
});

/**
 * The tile called 3.4% "at risk" and said so in red for thirty days. The alert
 * scan filed the same number as `warning`, because its critical threshold was
 * 5%. Only critical alerts are emailed. So the product showed the problem and
 * told nobody, and the operator found out by opening the page.
 */
describe("the tile and the alert agree about the same number", () => {
  it("emails at the line where sending should stop, not where throttling starts", () => {
    // 5% is where providers are already throttling: by then recovery takes
    // weeks. 3% is where there is still something to save.
    expect(BOUNCE_CRITICAL).toBe(0.03);
    expect(BOUNCE_FAILING).toBe(0.05);
    expect(BOUNCE_CRITICAL).toBeLessThan(BOUNCE_FAILING);
  });

  it("treats the reported 3.4% as worth an email", () => {
    expect(bounceSeverity(0.034)).toBe("critical");
  });

  it("still calls a rate under the erosion line a warning", () => {
    expect(bounceSeverity(0.025)).toBe("warning");
    expect(bounceSeverity(BOUNCE_AT_RISK)).toBe("warning");
  });

  it("escalates a complaint rate at the providers' cut-off", () => {
    expect(complaintSeverity(0.003)).toBe("critical");
    expect(complaintSeverity(0.0015)).toBe("warning");
  });

  it("the scan uses the shared rule rather than its own number", () => {
    expect(SCAN).toContain("bounceSeverity(bounceRate / 100)");
    expect(SCAN).toContain("complaintSeverity(complaintRate / 100)");
    expect(SCAN).not.toContain('bounceRate >= 5 ? "critical"');
  });

  it("the tile reads the same constants", () => {
    expect(VERDICT).toContain("BOUNCE_FAILING");
    expect(VERDICT).toContain("BOUNCE_AT_RISK");
  });

  it("a rate the tile calls at-risk is never filed as nothing", () => {
    // The property that was violated: any rate the dashboard paints as a
    // problem must produce an alert the user can be told about.
    for (const rate of [0.021, 0.03, 0.034, 0.049, 0.06]) {
      const v = bounceVerdict({ sent: 500, bounced: Math.round(500 * rate), complaints: 0 });
      expect(v.state === "at_risk" || v.state === "failing").toBe(true);
    }
  });
});

/**
 * Sharing the constants introduced a real runtime bug that tsc and 1161 tests
 * both missed: `export { X } from "..."` re-exports without creating a local
 * binding, and complaintVerdict still referenced the bare name. No existing
 * test called it below the sends floor, so the branch never ran.
 */
describe("both verdicts work below the sends floor", () => {
  it("bounceVerdict returns unknown rather than throwing", () => {
    expect(bounceVerdict({ sent: 10, bounced: 1, complaints: 0 }).state).toBe("unknown");
  });

  it("complaintVerdict returns unknown rather than throwing", () => {
    expect(complaintVerdict({ sent: 10, bounced: 0, complaints: 1 }).state).toBe("unknown");
  });

  it("both still score normally above it", () => {
    expect(bounceVerdict({ sent: 500, bounced: 2, complaints: 0 }).state).toBe("healthy");
    expect(complaintVerdict({ sent: 500, bounced: 0, complaints: 0 }).state).toBe("healthy");
  });
});
