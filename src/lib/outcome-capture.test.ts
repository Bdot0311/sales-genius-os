import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildCopyFeatures,
  captureSendSnapshot,
  editRatio,
  hasLink,
  hasQuestionCta,
  personalizationType,
  wordCount,
} from "../../supabase/functions/_shared/outcome-capture";

/* Comments are stripped so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = (name: string) => code(readFileSync(`supabase/functions/${name}/index.ts`, "utf8"));
const MIGRATION = readFileSync("supabase/migrations/20261120090000_outcome_data_layer_capture.sql", "utf8");

describe("wordCount counts words, not markup", () => {
  it("ignores tags, entities, style and script", () => {
    expect(wordCount("<p>three visible words</p>")).toBe(3);
    expect(wordCount("<style>p{color:red}</style>hello")).toBe(1);
    expect(wordCount("<script>var x=1</script>hi there")).toBe(2);
    expect(wordCount("a&nbsp;b")).toBe(2);
  });
  it("is zero for nothing", () => {
    for (const empty of ["", "   ", "<br>", null, undefined]) expect(wordCount(empty)).toBe(0);
  });
});

describe("hasQuestionCta looks where a CTA actually sits", () => {
  it("finds a question in the closing ask", () => {
    expect(hasQuestionCta("We noticed your hiring push. Worth a quick look next week?")).toBe(true);
  });
  it("does not count an opening hook as a CTA", () => {
    const body = "Quick question? " + "Body sentence that carries the message. ".repeat(8) + "Thanks.";
    expect(hasQuestionCta(body)).toBe(false);
  });
  it("is false with no question at all", () => {
    expect(hasQuestionCta("Here is the thing. Let me know.")).toBe(false);
    expect(hasQuestionCta(null)).toBe(false);
  });
});

describe("hasLink", () => {
  it("sees anchors and bare urls", () => {
    expect(hasLink('<a href="https://x.co">x</a>')).toBe(true);
    expect(hasLink("see https://example.com/p")).toBe(true);
  });
  it("is false for plain text", () => {
    expect(hasLink("no links here")).toBe(false);
    expect(hasLink(null)).toBe(false);
  });
});

describe("personalizationType reports the most specific grounding achieved", () => {
  const base = { companyName: "Acme Robotics", jobTitle: "VP Engineering" };

  it("prefers a signal over company and role", () => {
    expect(personalizationType({
      ...base,
      signalTypes: ["hiring_surge"],
      body: "Saw the hiring surge at Acme Robotics, and you being VP Engineering",
    })).toBe("signal");
  });

  it("falls to company when no signal is referenced", () => {
    expect(personalizationType({ ...base, signalTypes: ["funding"], body: "Noticed Acme Robotics shipped" }))
      .toBe("company");
  });

  it("falls to role when neither signal nor company appears", () => {
    expect(personalizationType({ ...base, signalTypes: [], body: "As a VP Engineering you probably" }))
      .toBe("role");
  });

  it("is none for a generic body", () => {
    expect(personalizationType({ ...base, signalTypes: ["hiring"], body: "Hope this finds you well." }))
      .toBe("none");
  });

  it("does not match a signal on a word fragment", () => {
    // "hiring" must not be matched by "hire" inside another word.
    expect(personalizationType({ ...base, signalTypes: ["hiring"], body: "we hired nobody" })).toBe("none");
  });

  it("ignores a signal name too short to be meaningful", () => {
    expect(personalizationType({ ...base, signalTypes: ["ai"], body: "ai is everywhere" })).toBe("none");
  });
});

describe("editRatio", () => {
  it("is zero when untouched and null when provenance is unknown", () => {
    expect(editRatio("same text", "same text")).toBe(0);
    expect(editRatio(null, "x")).toBeNull();
    expect(editRatio("x", null)).toBeNull();
  });
  it("is 1 when rewritten from nothing", () => {
    expect(editRatio("", "a whole new email")).toBe(1);
  });
  it("grows with the share of characters changed", () => {
    const small = editRatio("Hello there Brandon, quick thought.", "Hello there Brandon, quick thoughts.")!;
    const large = editRatio("Hello there Brandon, quick thought.", "Completely different message entirely!")!;
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(1);
  });
});

describe("buildCopyFeatures", () => {
  it("marks an unedited AI draft as not user_edited", () => {
    const f = buildCopyFeatures({
      subject: "quick thought", body: "<p>Body here?</p>", originalBody: "<p>Body here?</p>",
      sentBy: "agent_auto", aiGenerated: true,
    });
    expect(f).toMatchObject({ user_edited: false, edit_ratio: 0, sent_by: "agent_auto", ai_generated: true });
  });

  it("does not claim a draft was untouched when provenance is unknown", () => {
    const f = buildCopyFeatures({ subject: "s", body: "b", sentBy: "manual", aiGenerated: false });
    expect(f.edit_ratio).toBeNull();
    expect(f.user_edited).toBe(false);
  });
});

describe("captureSendSnapshot never throws into a completed send", () => {
  it("reports failure instead of raising when the rpc errors", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) };
    await expect(captureSendSnapshot(client, "send-1", "user-1", {})).resolves.toMatchObject({
      captured: false, reason: "boom",
    });
  });

  it("reports failure instead of raising when the client throws", async () => {
    const client = { rpc: vi.fn(async () => { throw new Error("offline"); }) };
    await expect(captureSendSnapshot(client, "send-1", "user-1", {})).resolves.toMatchObject({
      captured: false, reason: "offline",
    });
  });

  it("treats a send with no lead as nothing to capture, not an error", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    expect(await captureSendSnapshot(client, "send-1", "user-1", {})).toEqual({
      captured: false, reason: "no_lead",
    });
  });

  it("passes the send, the owner and the copy features to the rpc", async () => {
    const client = { rpc: vi.fn(async () => ({ data: "snap-1", error: null })) };
    expect(await captureSendSnapshot(client, "send-1", "user-1", { sent_by: "manual" }))
      .toEqual({ captured: true, snapshotId: "snap-1" });
    expect(client.rpc).toHaveBeenCalledWith("capture_send_snapshot", {
      p_sent_email_id: "send-1", p_user_id: "user-1", p_copy: { sent_by: "manual" },
    });
  });
});

/**
 * Acceptance criterion 1 says every send creates exactly one snapshot. Only two
 * places mark a prospect-facing send as sent: send-email's markSent (which
 * agent-run and agent-approvals both reach over HTTP) and
 * process-scheduled-emails. This guard fails when a third appears, because a
 * send that is never captured is training data lost for good and nothing else
 * would notice.
 */
describe("every send-completion site captures a snapshot", () => {
  const CAPTURING = ["send-email", "process-scheduled-emails"];

  for (const name of CAPTURING) {
    it(`${name} calls captureSendSnapshot`, () => {
      const src = fn(name);
      expect(src).toContain("captureSendSnapshot(");
      expect(src).toContain("_shared/outcome-capture.ts");
    });
  }

  it("no other edge function marks sent_emails as sent", () => {
    /*
     * Scoped to writes against sent_emails itself. A flat search for
     * status: "sent" also matches agent_approvals.status, which is a different
     * table and a different meaning.
     */
    const { readdirSync, existsSync } = require("node:fs") as typeof import("node:fs");
    const offenders: string[] = [];
    for (const dir of readdirSync("supabase/functions")) {
      const path = `supabase/functions/${dir}/index.ts`;
      if (dir.startsWith("_") || !existsSync(path)) continue;
      const src = code(readFileSync(path, "utf8"));
      let marksSent = false;
      for (const m of src.matchAll(/from\(['"]sent_emails['"]\)/g)) {
        const region = src.slice(m.index!, m.index! + 700);
        // Stop at the next table so a later from() cannot lend its status.
        const nextTable = region.slice(1).search(/from\(['"][a-z_]+['"]\)/);
        const scoped = nextTable === -1 ? region : region.slice(0, nextTable + 1);
        if (/status:\s*['"]sent['"]/.test(scoped)) marksSent = true;
      }
      if (marksSent && !src.includes("captureSendSnapshot(")) offenders.push(dir);
    }
    expect(offenders.filter((d) => d !== "admin-demo-data")).toEqual([]);
  });

  it("agent sends declare provenance rather than defaulting to manual", () => {
    expect(fn("agent-run")).toContain('sentBy: "agent_auto"');
    expect(fn("agent-approvals")).toContain('sentBy: "agent_approved"');
  });
});

describe("the snapshot table cannot be rewritten", () => {
  it("is append-only: no update or delete policy, and a trigger that refuses both", () => {
    expect(MIGRATION).toContain("BEFORE UPDATE OR DELETE ON public.lead_feature_snapshots");
    expect(MIGRATION).toContain("is append-only");
    expect(MIGRATION).not.toMatch(/FOR UPDATE[\s\S]{0,80}lead_feature_snapshots/);
  });

  it("has no insert policy, so only the definer function can write training rows", () => {
    expect(MIGRATION).not.toMatch(/CREATE POLICY[^;]*lead_feature_snapshots[^;]*FOR INSERT/);
    expect(MIGRATION).toContain("SECURITY DEFINER");
  });

  it("is readable only by its owner", () => {
    expect(MIGRATION).toContain("ENABLE ROW LEVEL SECURITY");
    expect(MIGRATION).toMatch(/FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
  });

  it("captures at most one snapshot per send", () => {
    expect(MIGRATION).toContain("IF v_snapshot_id IS NOT NULL THEN");
  });

  it("scopes the clone to the owner, so one account cannot snapshot another's lead", () => {
    expect(MIGRATION).toContain("WHERE id = p_sent_email_id AND user_id = p_user_id");
    expect(MIGRATION).toContain("d.lead_id = l.id AND d.user_id = p_user_id");
  });

  it("counts only signals that existed at send time", () => {
    expect(MIGRATION).toContain("s.occurred_at <= v_sent_at");
  });

  it("prefers employee_count over the free-text company_size", () => {
    expect(MIGRATION).toContain("p_employees IS NOT NULL AND p_employees > 0");
  });

  it("is not executable by browser clients", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.capture_send_snapshot");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.capture_send_snapshot(uuid, uuid, jsonb) TO service_role");
  });
});
