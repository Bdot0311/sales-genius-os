import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  authVerdict,
  bounceVerdict,
  complaintVerdict,
  connectionSummary,
  diagnoseConnection,
  explainProviderError,
  MIN_SENDS_FOR_RATE,
  placementVerdict,
  worstState,
  type ConnectionInput,
} from "./deliverability-verdict";

/**
 * The whole thesis: a number with no named cause and no action does not ship.
 * These assert the shape of every verdict, not just the happy path.
 */
describe("every verdict either names a cause or says why it can't", () => {
  const verdicts = [
    placementVerdict([]),
    placementVerdict([{ provider: "gmail", placement: "spam" }]),
    placementVerdict([{ provider: "gmail", placement: "inbox" }]),
    authVerdict([]),
    authVerdict([{ domain: "a.com", spf_status: "fail", dkim_status: "pass", dmarc_status: "pass" }]),
    authVerdict([{ domain: "a.com", spf_status: "pass", dkim_status: "pass", dmarc_status: "pass" }]),
    bounceVerdict({ sent: 10, bounced: 1, complaints: 0 }),
    bounceVerdict({ sent: 500, bounced: 40, complaints: 0 }),
    complaintVerdict({ sent: 500, bounced: 0, complaints: 5 }),
  ];

  it("never leaves both cause and unknownReason empty", () => {
    for (const v of verdicts) {
      expect(Boolean(v.cause || v.unknownReason), JSON.stringify(v)).toBe(true);
    }
  });

  it("never states a cause and an unknown reason at once", () => {
    for (const v of verdicts) {
      if (v.cause) expect(v.unknownReason).toBeUndefined();
    }
  });

  it("offers an action on everything that isn't healthy", () => {
    for (const v of verdicts) {
      if (v.state === "healthy") continue;
      // The one exception: a rate we cannot compute yet has nothing to click.
      if (v.state === "unknown" && !v.action) {
        expect(v.unknownReason).toBeTruthy();
        continue;
      }
      expect(v.action, JSON.stringify(v)).not.toBeNull();
    }
  });

  it("does not pass off a restatement of the number as a cause", () => {
    const failing = bounceVerdict({ sent: 500, bounced: 40, complaints: 0 });
    // "Bounce rate is high" would be a restatement. A cause says what is behind it.
    expect(failing.cause).toMatch(/list|addresses/i);
    expect(failing.cause!.length).toBeGreaterThan(40);
  });
});

describe("placement is read from seed tests, never inferred", () => {
  it("says so when no test has run, rather than showing a zero", () => {
    const v = placementVerdict([]);
    expect(v.state).toBe("unknown");
    expect(v.value).toBeNull();
    expect(v.unknownReason).toMatch(/not inferred from opens/i);
    expect(v.action?.kind).toBe("run");
  });

  it("distinguishes a test in flight from no test at all", () => {
    expect(placementVerdict([{ provider: "gmail", placement: "pending" }]).unknownReason)
      .toMatch(/in flight/i);
  });

  it("ignores providers with no seed rather than counting them as failures", () => {
    const v = placementVerdict([
      { provider: "gmail", placement: "inbox" },
      { provider: "outlook", placement: "unsupported" },
      { provider: "yahoo", placement: "unsupported" },
    ]);
    expect(v.state).toBe("healthy");
    expect(v.value).toBe("100%");
  });

  it("names WHICH provider filtered — the difference between a cause and a restatement", () => {
    const v = placementVerdict([
      { provider: "gmail", placement: "inbox" },
      { provider: "m365", placement: "spam" },
    ]);
    expect(v.state).toBe("at_risk");
    expect(v.cause).toContain("Microsoft 365");
    expect(v.cause).toMatch(/provider-specific/i);
  });

  it("escalates when every provider filtered", () => {
    const v = placementVerdict([
      { provider: "gmail", placement: "spam" },
      { provider: "m365", placement: "spam" },
    ]);
    expect(v.state).toBe("failing");
    expect(v.cause).toMatch(/authentication or reputation/i);
  });

  it("treats Promotions as a real problem, not a pass", () => {
    // Delivered but unread is the failure people describe as "my opens died".
    const v = placementVerdict([{ provider: "gmail", placement: "inbox", tab: "promotions" }]);
    expect(v.state).toBe("degrading");
    expect(v.cause).toMatch(/Promotions/);
  });
});

describe("authentication treats 'unknown' as unknown, never as a pass", () => {
  it("does not report an unresolvable lookup as healthy", () => {
    const v = authVerdict([{ domain: "a.com", spf_status: "pass", dkim_status: "unknown", dmarc_status: "pass" }]);
    expect(v.state).toBe("unknown");
    expect(v.unknownReason).toMatch(/failed check, not a passed one/i);
  });

  it("names the domain and the missing records", () => {
    const v = authVerdict([
      { domain: "a.com", spf_status: "fail", dkim_status: "fail", dmarc_status: "pass" },
      { domain: "b.com", spf_status: "pass", dkim_status: "pass", dmarc_status: "pass" },
    ]);
    expect(v.state).toBe("at_risk");
    expect(v.cause).toContain("a.com");
    expect(v.cause).toContain("SPF, DKIM");
    expect(v.cause).not.toContain("b.com");
  });

  it("escalates when a domain publishes none of the three", () => {
    const v = authVerdict([{ domain: "a.com", spf_status: "fail", dkim_status: "fail", dmarc_status: "fail" }]);
    expect(v.state).toBe("failing");
  });
});

describe("rates are not reported below the volume that makes them meaningful", () => {
  it("refuses a bounce rate on a handful of sends", () => {
    const v = bounceVerdict({ sent: 12, bounced: 1, complaints: 0 });
    expect(v.state).toBe("unknown");
    expect(v.value).toBeNull();
    // 1 in 12 is 8.3%, which would read as a crisis.
    expect(v.unknownReason).toMatch(/reads as a crisis/i);
  });

  it("reports it once there is enough volume", () => {
    const v = bounceVerdict({ sent: MIN_SENDS_FOR_RATE, bounced: 0, complaints: 0 });
    expect(v.state).toBe("healthy");
    expect(v.value).toBe("0%");
  });

  it("uses the published provider thresholds", () => {
    expect(bounceVerdict({ sent: 1000, bounced: 25, complaints: 0 }).state).toBe("at_risk");  // 2.5%
    expect(bounceVerdict({ sent: 1000, bounced: 60, complaints: 0 }).state).toBe("failing");  // 6%
    expect(complaintVerdict({ sent: 1000, bounced: 0, complaints: 2 }).state).toBe("at_risk");  // 0.2%
    expect(complaintVerdict({ sent: 1000, bounced: 0, complaints: 4 }).state).toBe("failing");  // 0.4%
  });
});

describe("worst state wins in a roll-up", () => {
  it("does not let a healthy sibling hide a failure", () => {
    expect(worstState(["healthy", "failing", "healthy"])).toBe("failing");
    expect(worstState(["healthy", "degrading"])).toBe("degrading");
    expect(worstState(["healthy", "healthy"])).toBe("healthy");
  });

  it("ranks unknown above healthy but below any real problem", () => {
    expect(worstState(["healthy", "unknown"])).toBe("unknown");
    expect(worstState(["unknown", "degrading"])).toBe("degrading");
  });
});

// ---------------------------------------------------------------------------

const connected: ConnectionInput = {
  email: "a@b.com",
  status: "active",
  sentToday: 10,
  dailyLimit: 50,
  integrationActive: true,
  hasRefreshToken: true,
};

describe("connection health is about the pipe, not about landing", () => {
  it("reports a working mailbox with its usage", () => {
    const d = diagnoseConnection(connected);
    expect(d.state).toBe("sending");
    expect(d.explanation).toContain("10 of 50");
  });

  it("calls an unlinked mailbox disconnected", () => {
    const d = diagnoseConnection({ ...connected, integrationActive: false });
    expect(d.state).toBe("disconnected");
    expect(d.fix?.kind).toBe("reconnect");
  });

  it("only calls an expired token terminal when it cannot renew itself", () => {
    const expired = { ...connected, tokenExpiresAt: Date.now() - 1000 };
    // With a refresh token the next send renews it silently — not a problem.
    expect(diagnoseConnection({ ...expired, hasRefreshToken: true }).state).toBe("sending");
    expect(diagnoseConnection({ ...expired, hasRefreshToken: false }).state).toBe("disconnected");
  });

  it("separates a limit reached from a mailbox that is broken", () => {
    const d = diagnoseConnection({ ...connected, sentToday: 50 });
    expect(d.state).toBe("degraded");
    expect(d.explanation).toMatch(/starts again tomorrow/i);
    expect(d.fix).toBeNull();
  });

  it("tells a manual pause apart from an automatic one", () => {
    expect(diagnoseConnection({ ...connected, status: "paused", pausedReason: "Paused manually" }).explanation)
      .toMatch(/You paused/);
    expect(diagnoseConnection({ ...connected, status: "paused", pausedReason: "Auto-paused: reputation 41 below threshold 70" }).explanation)
      .toMatch(/protect this mailbox's reputation/i);
  });
});

describe("no raw provider error ever reaches the UI", () => {
  const RAW = [
    "invalid_grant",
    "Error 403: insufficient authentication scopes",
    "429 Too Many Requests: user-rate limit exceeded",
    "535 5.7.8 Username and Password not accepted",
    "Auto-paused: reputation 38 below threshold 70",
    "Account has been suspended",
  ];

  it("translates each one into a sentence a person can act on", () => {
    for (const raw of RAW) {
      const out = explainProviderError(raw);
      expect(out, raw).not.toContain(raw);
      expect(out.length, raw).toBeGreaterThan(30);
      expect(out, raw).toMatch(/[.!]$/);
    }
  });

  it("does not echo an unrecognised error back at the user", () => {
    const out = explainProviderError("ERR_QUIC_PROTOCOL_ERROR (0x2a)");
    expect(out).not.toContain("QUIC");
    expect(out).toMatch(/reconnect/i);
  });

  it("says something useful when there is no reason at all", () => {
    expect(explainProviderError(null)).toMatch(/No reason was recorded/i);
    expect(explainProviderError("")).toMatch(/No reason was recorded/i);
  });
});

describe("the connection roll-up", () => {
  it("counts each state", () => {
    const s = connectionSummary([
      diagnoseConnection(connected),
      diagnoseConnection({ ...connected, integrationActive: false }),
      diagnoseConnection({ ...connected, sentToday: 50 }),
      diagnoseConnection({ ...connected, status: "paused", pausedReason: "Paused manually" }),
    ]);
    expect(s).toEqual({ sending: 1, degraded: 1, blocked: 1, disconnected: 1, total: 4 });
  });
});

/**
 * The rua address a customer publishes has to point at a mailbox that exists.
 * Recommending one that doesn't looks correct in DNS and delivers nothing —
 * worse than not asking, because it looks done.
 */
describe("the DMARC record we hand customers", () => {
  const SRC = readFileSync("supabase/functions/check-domain-auth/index.ts", "utf8");

  it("only points rua at us when a receiving domain is configured", () => {
    expect(SRC).toMatch(/DMARC_RUA_DOMAIN/);
    expect(SRC).toMatch(/ruaDomain \? `\$\{ruaToken\}@\$\{ruaDomain\}` : `dmarc@\$\{root\}`/);
  });

  it("reuses an existing token instead of minting a new one on every check", () => {
    // Overwriting it would silently break a record the customer already published.
    expect(SRC).toMatch(/existing\?\.dmarc_rua_token\s*\n?\s*\?\?/);
  });
});
