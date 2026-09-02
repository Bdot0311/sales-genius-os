import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  blacklistFinding,
  domainsToCheck,
  extractLinks,
  isRawIp,
  isShortener,
  newDomainFinding,
  redirectFinding,
  staticLinkFindings,
} from "../../supabase/functions/_shared/link-risk.ts";
import {
  COPY_RISK_PROMPT_VERSION,
  COPY_RISK_SYSTEM_PROMPT,
  parseCopyRiskFindings,
} from "../../supabase/functions/_shared/copy-risk-prompts.ts";

describe("finding the links", () => {
  it("pulls them out with the line they are on", () => {
    const links = extractLinks("Hi there\nsee https://acme.com/pricing for detail\nthanks");
    expect(links).toHaveLength(1);
    expect(links[0].domain).toBe("acme.com");
    expect(links[0].line).toBe(2);
  });

  it("does not swallow sentence punctuation into the URL", () => {
    expect(extractLinks("Look at https://acme.com/pricing.")[0].url).toBe("https://acme.com/pricing");
  });

  it("strips www so a domain is checked once", () => {
    expect(domainsToCheck("https://www.acme.com/a and https://acme.com/b")).toEqual(["acme.com"]);
  });
});

describe("what gets a message filtered on its links alone", () => {
  it("flags a shortener, because a hidden destination reads as evasion", () => {
    const findings = staticLinkFindings("Details here: https://bit.ly/3xYz");
    const shortener = findings.find((f) => f.kind === "shortener")!;
    expect(shortener.severity).toBe("critical");
    // A label is not advice — it has to say what to do instead.
    expect(shortener.message).toMatch(/use the full URL/i);
    expect(shortener.message).toMatch(/Line 1/);
  });

  it("flags a bare IP", () => {
    expect(isRawIp("192.168.1.1")).toBe(true);
    expect(isRawIp("acme.com")).toBe(false);
    expect(staticLinkFindings("http://203.0.113.9/x").some((f) => f.kind === "raw_ip")).toBe(true);
  });

  it("holds a cold first touch to one link", () => {
    const two = staticLinkFindings("https://acme.com/a and https://acme.com/b", true);
    expect(two.some((f) => f.kind === "excess_links")).toBe(true);
    const one = staticLinkFindings("just https://acme.com/a", true);
    expect(one.some((f) => f.kind === "excess_links")).toBe(false);
  });

  it("gives a reply thread more latitude than a cold opener", () => {
    const body = "https://a.com/1 https://a.com/2 https://a.com/3";
    expect(staticLinkFindings(body, true).some((f) => f.kind === "excess_links")).toBe(true);
    expect(staticLinkFindings(body, false).some((f) => f.kind === "excess_links")).toBe(false);
  });

  it("knows the common shorteners", () => {
    for (const d of ["bit.ly", "t.co", "tinyurl.com", "lnkd.in"]) expect(isShortener(d), d).toBe(true);
    expect(isShortener("acme.com")).toBe(false);
  });
});

describe("findings that need a lookup", () => {
  it("says nothing when a domain is not listed", () => {
    expect(blacklistFinding("acme.com", [])).toBeNull();
  });

  it("names the lists and says to remove the link", () => {
    const f = blacklistFinding("acme.com", ["SURBL", "URIBL"])!;
    expect(f.severity).toBe("critical");
    expect(f.message).toContain("SURBL, URIBL");
    expect(f.message).toMatch(/remove the link/i);
  });

  it("treats an unknown domain age as unknown, not as new", () => {
    expect(newDomainFinding("acme.com", null)).toBeNull();
    expect(newDomainFinding("acme.com", 400)).toBeNull();
    expect(newDomainFinding("acme.com", 10)!.severity).toBe("critical");
    expect(newDomainFinding("acme.com", 60)!.severity).toBe("warning");
  });

  it("only reports a redirect chain when there is one", () => {
    expect(redirectFinding("https://a.com", [])).toBeNull();
    expect(redirectFinding("https://a.com", ["b.com"])).toBeNull();
    const f = redirectFinding("https://a.com", ["b.com", "c.com", "d.com"])!;
    expect(f.severity).toBe("critical");
    expect(f.message).toMatch(/cloaking/i);
  });
});

/**
 * The requirement: return specific rewrites, not a score. A finding that quotes
 * text which isn't in the email is worse than no finding — the writer searches
 * for it, can't find it, and stops trusting the panel.
 */
describe("model output is verified against the email before it ships", () => {
  const email = "Subject: quick one\nWe offer a free consultation for teams like yours.";

  it("keeps a finding that quotes real text", () => {
    const { findings, dropped } = parseCopyRiskFindings({
      findings: [{
        quote: "free consultation",
        replacement: "a 20-minute look at your setup",
        reason: "Reads as bulk marketing.",
        severity: "critical",
      }],
    }, email);
    expect(findings).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it("drops a finding quoting text the email does not contain", () => {
    const { findings, dropped } = parseCopyRiskFindings({
      findings: [{ quote: "act now", replacement: "x", reason: "y", severity: "warning" }],
    }, email);
    expect(findings).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("drops a finding with no replacement — advice is not a rewrite", () => {
    const { findings } = parseCopyRiskFindings({
      findings: [{ quote: "free consultation", replacement: "", reason: "risky", severity: "warning" }],
    }, email);
    expect(findings).toHaveLength(0);
  });

  it("defaults an unrecognised severity to warning rather than guessing", () => {
    const { findings } = parseCopyRiskFindings({
      findings: [{ quote: "free consultation", replacement: "a look", reason: "r", severity: "apocalyptic" }],
    }, email);
    expect(findings[0].severity).toBe("warning");
  });

  it("survives junk instead of throwing", () => {
    expect(parseCopyRiskFindings(null, email).findings).toEqual([]);
    expect(parseCopyRiskFindings({ findings: "nope" }, email).findings).toEqual([]);
    expect(parseCopyRiskFindings({}, email).findings).toEqual([]);
  });
});

describe("the prompt", () => {
  it("forbids scoring and demands concrete replacements", () => {
    expect(COPY_RISK_SYSTEM_PROMPT).toMatch(/You do not score/);
    expect(COPY_RISK_SYSTEM_PROMPT).toMatch(/concrete replacement/i);
    expect(COPY_RISK_SYSTEM_PROMPT).toMatch(/verbatim/i);
  });

  it("allows the model to say the email is fine", () => {
    // Without this a reviewer invents problems to look useful.
    expect(COPY_RISK_SYSTEM_PROMPT).toMatch(/empty findings array/i);
  });

  it("forbids inventing proof", () => {
    expect(COPY_RISK_SYSTEM_PROMPT).toMatch(/Never invent a statistic/i);
  });

  it("is versioned so a bad rewrite can be traced to a prompt", () => {
    expect(COPY_RISK_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(readFileSync("supabase/functions/check-copy-risk/index.ts", "utf8"))
      .toMatch(/promptVersion: COPY_RISK_PROMPT_VERSION/);
  });
});

describe("the function degrades honestly", () => {
  const SRC = readFileSync("supabase/functions/check-copy-risk/index.ts", "utf8");

  it("still returns link findings when the model is unavailable", () => {
    expect(SRC).toMatch(/copyAvailable = false/);
    expect(SRC).toMatch(/cover links only/);
  });

  it("bounds the lookups so a writer is not left waiting", () => {
    expect(SRC).toMatch(/domains\.slice\(0, 5\)/);
    expect(SRC).toMatch(/\.slice\(0, 3\)/);
  });

  it("routes the model call through the metered provider", () => {
    expect(SRC).toMatch(/aiFetch\(/);
    expect(SRC).toMatch(/userId: user\.id/);
    expect(SRC).not.toMatch(/api\.anthropic\.com/);
  });
});
