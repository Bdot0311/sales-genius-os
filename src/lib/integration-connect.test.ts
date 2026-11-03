import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { saveIntegration } from "../../supabase/functions/_shared/save-integration";

function database(existing: { id: string } | null, lookupError: unknown = null, writeError: unknown = null) {
  const query: any = {};
  for (const method of ["select", "eq", "order", "limit"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: existing, error: lookupError }));
  query.update = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.single = vi.fn(async () => ({ data: writeError ? null : { id: existing?.id || "new-row" }, error: writeError }));
  return { client: { from: vi.fn(() => query) }, query };
}

describe("integration connection saving", () => {
  for (const provider of ["zapier", "slack", "salesforce", "hubspot", "calendly"]) {
    it(`saves a new ${provider} connection without a user/provider conflict constraint`, async () => {
      const { client, query } = database(null);
      expect(await saveIntegration(client, "owner", provider, provider, { setting: "value" })).toBe("new-row");
      expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner", integration_id: provider, is_active: true }));
    });
    it(`reconnects ${provider} using its existing owner-scoped row`, async () => {
      const { client, query } = database({ id: "existing-row" });
      expect(await saveIntegration(client, "owner", provider, provider, {})).toBe("existing-row");
      expect(query.limit).toHaveBeenCalledWith(1);
      expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
      expect(query.eq).toHaveBeenCalledWith("id", "existing-row");
      expect(query.insert).not.toHaveBeenCalled();
    });
  }
  it("does not write when lookup fails", async () => {
    const { client, query } = database(null, { code: "error" });
    await expect(saveIntegration(client, "owner", "zapier", "Zapier", {})).rejects.toThrow("Could not read");
    expect(query.insert).not.toHaveBeenCalled();
  });
  for (const existing of [null, { id: "existing-row" }]) {
    it(`does not report success after ${existing ? "update" : "insert"} failure`, async () => {
      const { client } = database(existing, null, { code: "write-failed" });
      await expect(saveIntegration(client, "owner", "zapier", "Zapier", {})).rejects.toThrow("Could not save");
    });
  }
  it("manual connects do not depend on browser table writes", () => {
    const page = readFileSync("src/pages/DashboardIntegrations.tsx", "utf8");
    const submit = page.slice(page.indexOf("const handleSubmit"), page.indexOf("const handleDisconnect"));
    expect(submit).toContain("functions.invoke('connect-integration'");
    expect(submit).not.toContain(".upsert(");
    expect(submit).not.toContain("onConflict");
  });
  it("Google keeps email-scoped multi-account lookup", () => {
    const google = readFileSync("supabase/functions/google-oauth-callback/index.ts", "utf8");
    expect(google).toContain('.eq("connected_email", googleEmail)');
    expect(google).toContain("if (lookupError) throw");
  });
});