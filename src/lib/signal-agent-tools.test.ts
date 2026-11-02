import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  OUTBOUND_TOOL_DEFS,
  OUTBOUND_TOOL_NAMES,
  runOutboundTool,
} from "../../supabase/functions/_shared/agent-outbound-tools.ts";
import {
  ALL_AGENT_TOOLS,
  SIGNAL_TOOLS,
  TOOL_CATALOG,
  withToolPrerequisites,
} from "../../supabase/functions/_shared/agent-tool-scope.ts";
import { TIER_BLOCKED_TOOLS } from "../../supabase/functions/_shared/agent-tier-scope.ts";
import { ALL_AGENT_TOOL_NAMES } from "@/components/agent/AgentRoles";

/**
 * Ninety-four agent tools were registered and not one of them could read
 * `signal_events` or ask a detector to look again.
 *
 * So an agent asked "why now for this company" answered from the lead's
 * standing description — the same sentence the company's website shows every
 * visitor, carrying no timing — while the dated, sourced evidence sat in a
 * table it could not see. The rule in AGENTS.md exists to stop exactly this:
 * "custom agents should never answer 'I don't have the tooling'".
 */

/** A chainable stand-in for the service-role client, recording what it was asked. */
function fakeAdmin(responses: Record<string, { data: unknown; error?: { message: string } | null }>) {
  const calls: Array<{ table: string; filters: Record<string, unknown>; limit?: number }> = [];
  const from = (table: string) => {
    const state: { table: string; filters: Record<string, unknown>; limit?: number } = { table, filters: {} };
    calls.push(state);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.order = self;
    chain.eq = (col: string, val: unknown) => {
      state.filters[col] = val;
      return chain;
    };
    chain.limit = (n: number) => {
      state.limit = n;
      return Promise.resolve(responses[table] ?? { data: [], error: null });
    };
    chain.maybeSingle = () => Promise.resolve(responses[table] ?? { data: null, error: null });
    return chain;
  };
  return { admin: { from }, calls };
}

const EDGE = { url: "https://p.test", serviceKey: "svc" };

const run = (
  name: string,
  args: Record<string, unknown>,
  admin: { from: (t: string) => any },
  edge: { url: string; serviceKey: string } | undefined = EDGE,
) => {
  const toolEvents: Array<{ name: string; label: string; status: "ok" | "error"; detail?: string }> = [];
  return runOutboundTool(name, args, { admin, userId: "user-1", toolEvents, edge })
    .then((r) => ({ r, toolEvents }));
};

describe("the tools exist and are wired everywhere the rule requires", () => {
  it("both are defined as callable tools", () => {
    for (const t of SIGNAL_TOOLS) expect(OUTBOUND_TOOL_NAMES, t).toContain(t);
  });

  it("both are grantable, described, and in the custom-build picker", () => {
    for (const t of SIGNAL_TOOLS) {
      expect(ALL_AGENT_TOOLS, t).toContain(t);
      expect(TOOL_CATALOG[t], t).toBeTruthy();
      expect(ALL_AGENT_TOOL_NAMES, t).toContain(t);
    }
  });

  it("granting refresh also grants the read", () => {
    // An agent that can re-poll a board but not read the result is half a tool.
    expect(withToolPrerequisites(["refresh_signals"])).toContain("list_signals");
  });

  it("lead_id is required on both, so neither can be called blind", () => {
    for (const t of SIGNAL_TOOLS) {
      const def = OUTBOUND_TOOL_DEFS.find((d) => d.function.name === t);
      expect(def?.function.parameters.required, t).toContain("lead_id");
    }
  });

  it("no tier blocks them, deliberately", () => {
    /*
     * The free tier is "research and draft only": nothing leaves the account,
     * nothing is destroyed, no autonomous runs. Reading signals sends nothing
     * and `refresh_signals` reads a public job board and spends no credits, so
     * both are research. Blocking them would withhold the evidence behind a
     * score from the plan whose whole purpose is to evaluate leads.
     */
    for (const [tier, blocked] of Object.entries(TIER_BLOCKED_TOOLS)) {
      for (const t of SIGNAL_TOOLS) expect(blocked, `${t} blocked on ${tier}`).not.toContain(t);
    }
  });
});

describe("list_signals", () => {
  it("returns the rows and the rendered facts", async () => {
    /*
     * Both, on purpose. Raw metadata alone invites an agent to paraphrase
     * `top_role_url` into prose, which is how an unsourced claim reaches an
     * email; the facts are rendered by the same code the copy uses.
     */
    const { admin } = fakeAdmin({
      signal_events: {
        data: [
          {
            signal_type: "hiring_gtm",
            occurred_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
            source: "ats:greenhouse",
            weight: 30,
            metadata: { top_role: "Head of Growth", top_role_url: "https://x/jobs/1", open_roles: 4, gtm_roles: 2 },
          },
        ],
        error: null,
      },
    });
    const { r } = await run("list_signals", { lead_id: "lead-1" }, admin);
    expect((r as any).success).toBe(true);
    expect((r as any).signals).toHaveLength(1);
    const facts = (r as any).facts;
    expect(facts[0].fact).toContain("Head of Growth");
    expect(facts[0].source).toBe("https://x/jobs/1");
    expect(facts[0].occurred_at).toBeTruthy();
  });

  it("is scoped to the calling account", async () => {
    // Otherwise a lead_id from anywhere would read another account's evidence.
    const { admin, calls } = fakeAdmin({ signal_events: { data: [], error: null } });
    await run("list_signals", { lead_id: "lead-1" }, admin);
    const q = calls.find((c) => c.table === "signal_events");
    expect(q?.filters.user_id).toBe("user-1");
    expect(q?.filters.lead_id).toBe("lead-1");
  });

  it("caps how much it returns, whatever is asked for", async () => {
    const { admin, calls } = fakeAdmin({ signal_events: { data: [], error: null } });
    await run("list_signals", { lead_id: "lead-1", limit: 100000 }, admin);
    expect(calls.find((c) => c.table === "signal_events")?.limit).toBe(100);
  });

  it("a database error is reported, not swallowed", async () => {
    const { admin } = fakeAdmin({ signal_events: { data: null, error: { message: "boom" } } });
    const { r, toolEvents } = await run("list_signals", { lead_id: "lead-1" }, admin);
    expect((r as any).error).toBe("boom");
    expect(toolEvents[0].status).toBe("error");
  });
});

describe("refresh_signals", () => {
  const fetchMock = vi.fn();

  const realFetch = globalThis.fetch;
  beforeEach(() => {
    (globalThis as any).fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("refuses a lead that is not this account's, without calling out", async () => {
    /*
     * The ownership check comes first so a lead_id from another account cannot
     * be used to make the platform fetch on its behalf. The detector checks
     * again itself; this is the cheaper refusal.
     */
    const { admin } = fakeAdmin({ leads: { data: null, error: null } });
    const { r } = await run("refresh_signals", { lead_id: "someone-elses" }, admin);
    expect((r as any).error).toMatch(/not found in this account/i);
    expect(fetchMock, "no outbound call for a lead we do not own").not.toHaveBeenCalled();
  });

  it("calls the hiring detector for a lead we own", async () => {
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ detected: true, deduped: false, signal_type: "hiring_surge" }),
    });
    const { r } = await run("refresh_signals", { lead_id: "lead-1" }, admin);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://p.test/functions/v1/detect-hiring-signals");
    expect(JSON.parse(init.body)).toEqual({ leadId: "lead-1" });
    expect((r as any).detected).toBe(true);
    expect((r as any).signal_type).toBe("hiring_surge");
  });

  it("never calls the detectors that cost credits", async () => {
    /*
     * detect-tech-signals spends a Bloomberry credit per uncached lookup and
     * the news one a PredictLeads credit. A tool an agent can call in a loop
     * must not be able to spend those.
     */
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ detected: false }) });
    await run("refresh_signals", { lead_id: "lead-1" }, admin);
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain("detect-tech-signals");
      expect(String(url)).not.toContain("detect-news-signals");
    }
  });

  it("a failed read is reported rather than claimed as success", async () => {
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "board unreachable" }) });
    const { r } = await run("refresh_signals", { lead_id: "lead-1" }, admin);
    expect((r as any).error).toBe("board unreachable");
    expect((r as any).success).toBeUndefined();
  });

  it("a thrown fetch is reported rather than crashing the turn", async () => {
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const { r } = await run("refresh_signals", { lead_id: "lead-1" }, admin);
    expect((r as any).error).toBe("socket hang up");
  });

  it("the call is time-bounded", () => {
    const src = readFileSync("supabase/functions/_shared/agent-outbound-tools.ts", "utf8");
    const block = src.slice(src.indexOf('case "refresh_signals"'), src.indexOf('case "list_sequence_enrollments"'));
    expect(block).toContain("AbortController");
    expect(block).toContain("clearTimeout(timer)");
  });

  it("without edge configuration it refuses rather than fetching nothing", async () => {
    /*
     * Worth a case of its own now that the config is an argument: a caller
     * that forgets to pass it must get a clear refusal, not a request to
     * "undefined/functions/v1/...".
     */
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    /*
     * Called directly rather than through the helper: passing `undefined` to a
     * parameter that HAS a default triggers the default, so the helper would
     * quietly hand it the real config and this would test nothing. It did, on
     * the first run — the failure was a mock returning undefined from fetch,
     * not the refusal this is about.
     */
    const toolEvents: Array<{ name: string; label: string; status: "ok" | "error"; detail?: string }> = [];
    const r = await runOutboundTool(
      "refresh_signals",
      { lead_id: "lead-1" },
      { admin, userId: "user-1", toolEvents },
    );
    expect((r as any).error).toMatch(/not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a dedupe is distinguished from a new signal", async () => {
    // "Nothing changed" and "found something" are different answers for an
    // agent deciding whether it has a new fact to open on.
    const { admin } = fakeAdmin({ leads: { data: { id: "lead-1" }, error: null } });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ detected: true, deduped: true, signal_type: "hiring_gtm" }),
    });
    const { r } = await run("refresh_signals", { lead_id: "lead-1" }, admin);
    expect((r as any).deduped).toBe(true);
  });
});
