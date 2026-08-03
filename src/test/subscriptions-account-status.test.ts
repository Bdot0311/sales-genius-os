import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Mirror of the live DB constraint:
 *   subscriptions_account_status_check
 *   CHECK (account_status IN ('active','locked','trial','paused','past_due','cancelled','grace_period','admin'))
 *
 * If the constraint changes, update this list AND the migration in the same change.
 */
const ALLOWED_ACCOUNT_STATUSES = [
  "active",
  "locked",
  "trial",
  "past_due",
  "paused",
  "cancelled",
  "grace_period",
  "admin",
] as const;

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCE_FILES = [
  ...walk(path.join(ROOT, "supabase", "functions")),
  ...walk(path.join(ROOT, "src")),
].filter((f) => !f.includes(`${path.sep}test${path.sep}`) && !f.endsWith("types.ts"));

describe("subscriptions.account_status writes satisfy the DB check constraint", () => {
  it("every hardcoded account_status literal in the codebase is an allowed value", () => {
    const literalWrite = /account_status\s*:\s*(['"`])([a-z_]+)\1/g;
    const violations: string[] = [];

    for (const file of SOURCE_FILES) {
      const contents = readFileSync(file, "utf8");
      for (const match of contents.matchAll(literalWrite)) {
        const value = match[2];
        if (!ALLOWED_ACCOUNT_STATUSES.includes(value as (typeof ALLOWED_ACCOUNT_STATUSES)[number])) {
          violations.push(`${path.relative(ROOT, file)} → "${value}"`);
        }
      }
    }

    expect(violations, `Values not permitted by subscriptions_account_status_check:\n${violations.join("\n")}`)
      .toEqual([]);
  });

  it("new-user provisioning defaults to an allowed status ('free' is NOT allowed)", () => {
    const migrations = walk(path.join(ROOT, "supabase", "migrations"));
    expect(ALLOWED_ACCOUNT_STATUSES).not.toContain("free" as never);
    // Guard the historical regression: the signup trigger must not insert 'free'.
    const triggerFiles = readdirSync(path.join(ROOT, "supabase", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => path.join(ROOT, "supabase", "migrations", f));
    const latestWithTrigger = triggerFiles
      .filter((f) => readFileSync(f, "utf8").includes("handle_new_user_subscription"))
      .sort()
      .pop();
    expect(latestWithTrigger, "handle_new_user_subscription migration not found").toBeTruthy();
    const sql = readFileSync(latestWithTrigger!, "utf8");
    expect(sql).not.toMatch(/account_status[^;]*'free'/);
    void migrations;
  });
});
