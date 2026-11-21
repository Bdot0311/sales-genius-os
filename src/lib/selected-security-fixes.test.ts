import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { csvCell } from "../../supabase/functions/_shared/csv-cell";

const read = (file: string) => readFileSync(file, "utf8");
const compiled = (source: string) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const stripImports = (source: string) => source.replace(/^import .*;\s*$/gm, "");

function blacklistHandler(user: unknown) {
  let handler: (req: Request) => Promise<Response>;
  let lookups = 0;
  const source = stripImports(read("supabase/functions/check-blacklists/index.ts"));
  new Function("serve", "createClient", "Deno", "corsHeaders", "validateDomain", "checkDomainAgainstDnsbls", "persistableRows", compiled(source))(
    (fn: typeof handler) => { handler = fn; },
    () => ({ auth: { getUser: async () => ({ data: { user }, error: user ? null : new Error("invalid") }) } }),
    { env: { get: () => "" } }, {}, (domain: unknown) => typeof domain === "string" && domain.includes("."),
    async () => { lookups++; return []; }, () => [],
  );
  return { run: (req: Request) => handler(req), lookups: () => lookups };
}

function workerHandler() {
  let handler: (req: Request) => Promise<Response>;
  let reads = 0;
  const guards = stripImports(read("supabase/functions/_shared/internal-auth.ts")).replace(/export /g, "");
  const requireServiceRole = new Function("Deno", compiled(guards) + "\nreturn requireServiceRole;")({ env: { get: (key: string) => ({ SUPABASE_SERVICE_ROLE_KEY: "test-service", INTERNAL_TRIGGER_SECRET: "test-internal" }[key]) } });
  const source = stripImports(read("supabase/functions/dispatch-webhooks/index.ts"));
  new Function("serve", "createClient", "Deno", "requireServiceRole", "isValidWebhookUrl", compiled(source))(
    (fn: typeof handler) => { handler = fn; },
    () => ({ from: () => { reads++; const q: any = { select: () => q, eq: () => q, or: () => q, order: () => q, limit: async () => ({ data: [], error: null }) }; return q; } }),
    { env: { get: () => "test-service" } }, requireServiceRole, () => true,
  );
  return { run: (token: string) => handler(new Request("https://example.test", { headers: { Authorization: `Bearer ${token}` } })), reads: () => reads };
}

describe("selected security fixes", () => {
  it.each(["", "Bearer invalid"])("rejects unauthenticated blacklist requests before lookups: %s", async (authorization) => {
    const fn = blacklistHandler(null);
    expect((await fn.run(new Request("https://example.test", { method: "POST", headers: { authorization }, body: JSON.stringify({ domain: "example.com" }) }))).status).toBe(401);
    expect(fn.lookups()).toBe(0);
  });
  it("preserves signed-in blacklist checks", async () => {
    const fn = blacklistHandler({ id: "owner" });
    expect((await fn.run(new Request("https://example.test", { method: "POST", headers: { authorization: "Bearer signed-in" }, body: JSON.stringify({ domain: "example.com" }) }))).status).toBe(200);
    expect(fn.lookups()).toBe(1);
  });
  it.each(["", "customer-jwt", "anon-key"])("rejects ordinary webhook callers before shared reads: %s", async (token) => {
    const fn = workerHandler();
    expect((await fn.run(token)).status).toBe(401);
    expect(fn.reads()).toBe(0);
  });
  it.each(["test-service", "test-internal"])("allows trusted worker credentials: %s", async (token) => {
    const fn = workerHandler();
    expect((await fn.run(token)).status).toBe(200);
    expect(fn.reads()).toBe(1);
  });
  it("never resolves a placement token for a different owner", async () => {
    const source = read("supabase/functions/run-placement-test/index.ts");
    const body = source.slice(source.indexOf("async function tokenForIntegration"), source.indexOf("/** Read a mailbox"));
    let refreshed = 0;
    const fn = new Function("accessTokenFromRefresh", compiled(body) + "\nreturn tokenForIntegration;")(async () => { refreshed++; return { token: "new" }; });
    const rows = [{ id: "victim-integration", user_id: "victim", integration_id: "google", is_active: true, config: { accessToken: "victim-token", refreshToken: "victim-refresh", expiresAt: Date.now() + 3600000 }, connected_email: "victim@example.com" }];
    const admin = { from: () => { let found = rows.slice(); const q: any = { select: () => q, eq: (key: string, value: unknown) => { found = found.filter(r => r[key as keyof typeof r] === value); return q; }, maybeSingle: async () => ({ data: found[0] ?? null }) }; return q; } };
    expect((await fn(admin, "victim-integration", "attacker")).mailbox).toBeNull();
    expect(refreshed).toBe(0);
    expect((await fn(admin, "victim-integration", "victim")).mailbox.email).toBe("victim@example.com");
    expect(source).toContain("tokenForIntegration(admin, acct.integration_id, user.id)");
    expect(source).toContain('.eq("id", integrationId).eq("user_id", userId)');
  });
  it.each(["=1+1", "+SUM(1,2)", "-1+2", "@SUM(A1)", "  =HYPERLINK(\"https://evil.test\")", "\t=1", "\r+1", "\n@SUM(A1)"])("neutralizes formula text: %s", (value) => {
    const cell = csvCell(value);
    const decoded = cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell;
    expect(decoded).toBe("'" + value);
  });
  it("retains correct CSV quoting and ordinary values", () => {
    expect(csvCell('hello,"world"')).toBe('"hello,""world"""');
    expect(csvCell("SaaS")).toBe("SaaS");
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });
  it("both selected exports use the safe serializer", () => {
    expect(read("src/pages/admin/Activity.tsx")).toContain("headers.map(h => csvCell(");
    expect(read("supabase/functions/admin-dataset-readiness/index.ts")).toContain('import { csvCell } from "../_shared/csv-cell.ts"');
  });
  it("keeps secret mutation service-only and authenticates the existing job", () => {
    const migration = read("drizzle/migrations/0072_protect_vault_secret_writer_and_webhook_job.sql");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("public.internal_job_key()");
    expect(migration).not.toContain("schedule :=");
  });
});
