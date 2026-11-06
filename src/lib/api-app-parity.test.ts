import { describe, expect, it, vi } from "vitest";
import { APP_API_ACTIONS, validateAppAction } from "../../supabase/functions/_shared/api-action-contract";
import { resolveAppUser } from "../../supabase/functions/_shared/app-user";
import { prospectSearchSchema } from "./mcp/action-schemas";
import { z } from "zod";
import { readFileSync } from "node:fs";

const dbForKey = (key: unknown) => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: key, error: null }), insert: vi.fn().mockResolvedValue({ error: null }) };
  return { from: vi.fn(() => query), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "oauth-owner" } }, error: null }) } };
};
describe("API and MCP app action boundaries", () => {
  it("routes new prospect searches to the real app pipeline, never the static sample handler", () => {
    expect(APP_API_ACTIONS["prospects/search"]).toBe("fetch-external-leads");
    expect(Object.values(APP_API_ACTIONS)).not.toContain("search-prospects");
  });
  it("accepts ICP arrays and opaque pagination for real prospecting", () => {
    expect(validateAppAction("prospects/search", { job_titles: ["Founder"], industries: ["Software"], limit: 25, cursor: "next-page" })).toBeNull();
  });
  it("rejects caller-supplied ownership and job impersonation", () => {
    for (const key of ["userId", "user_id", "job_id"]) expect(validateAppAction("prospects/search", { query: "SaaS founders", [key]: "another-user" })).toBe("Unsupported input field");
  });
  it("rejects unbounded result limits and fake list types", () => {
    expect(validateAppAction("prospects/search", { query: "SaaS", limit: 201 })).toBe("Invalid limit");
    expect(validateAppAction("prospects/search", { query: "SaaS", industries: "software" })).toBe("Invalid industries");
  });
  it("MCP closes targeting input to reject owner fields", () => {
    expect(z.object(prospectSearchSchema).strict().safeParse({ query: "SaaS", user_id: "other" }).success).toBe(false);
  });
  it("requires a lookup identifier and forbids implicit saving", () => {
    expect(validateAppAction("people/lookup", { full_name: "Jane Doe", company: "Acme" })).toBeNull();
    expect(validateAppAction("people/lookup", { action: "save", email: "jane@acme.test" })).toBe("Unsupported input field");
  });
  it("rejects expired API keys before checking quota or spending credits", async () => {
    const db = dbForKey({ user_id: "key-owner", expires_at: "2020-01-01" });
    expect(await resolveAppUser(new Request("https://app.invalid", { headers: { "X-API-Key": "test" } }), db)).toMatchObject({ user: null, status: 401 });
  });
  it("derives owner from OAuth, ignoring an identity in the body", async () => {
    expect(await resolveAppUser(new Request("https://app.invalid", { method: "POST", headers: { Authorization: "Bearer test" }, body: JSON.stringify({ userId: "other" }) }), dbForKey(null))).toMatchObject({ user: { id: "oauth-owner" } });
  });
  it("API-key owner is the verified key row, not input; quota failure closes access", async () => {
    vi.stubGlobal("Deno", { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://app.invalid" : "internal-test" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowed: true }))));
    const req = new Request("https://app.invalid", { headers: { "X-API-Key": "test" } });
    expect(await resolveAppUser(req, dbForKey({ id: "key-id", user_id: "key-owner" }))).toMatchObject({ user: { id: "key-owner" } });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await resolveAppUser(req, dbForKey({ id: "key-id", user_id: "key-owner" }))).toMatchObject({ user: null, status: 503 });
    vi.unstubAllGlobals();
  });
  it("paid-plan denial never becomes an allowed app identity", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "https://app.invalid" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ allowed: false, reason: "Starter and above required" }))));
    expect(await resolveAppUser(new Request("https://app.invalid", { headers: { "X-API-Key": "test" } }), dbForKey({ id: "key-id", user_id: "key-owner" }))).toMatchObject({ user: null, status: 403 });
    vi.unstubAllGlobals();
  });
  it("every new MCP action calls app handlers through a user-token client", () => {
    const helper = readFileSync("src/lib/mcp/app-actions.ts", "utf8");
    expect(helper).toContain("supabaseForUser(ctx).functions.invoke");
    expect(helper).not.toContain("SERVICE_ROLE");
    for (const name of ["search-prospects", "search-companies", "find-person", "verify-email", "enrich-lead", "score-lead", "research-lead", "generate-email"]) expect(readFileSync(`src/lib/mcp/tools/${name}.ts`, "utf8")).toContain("callAppAction");
  });
  it("REST app forwarding satisfies the gateway without a privileged bearer", () => {
    const src = readFileSync("supabase/functions/rest-api/index.ts", "utf8");
    const start = src.indexOf("const appRoute");
    const delegated = src.slice(start, src.indexOf("// ── Rate limit", start));
    expect(delegated).toContain("Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}`");
    expect(delegated).not.toContain("Bearer ${serviceKey}");
  });
});