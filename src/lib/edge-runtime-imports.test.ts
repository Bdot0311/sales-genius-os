import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// esm.sh's Deno build of supabase-js 2.76+ loads deno.land/std@0.177.1/node,
// whose shutdown hook calls Deno.core.runMicrotasks() and crashes every
// function on the hosted runtime. Functions must use the npm: specifier.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("edge function imports", () => {
  it("never load supabase-js 2.76+ or floating @2 through esm.sh", () => {
    const offenders = walk("supabase/functions").filter((file) =>
      /https:\/\/esm\.sh\/@supabase\/supabase-js@(2["'?]|2\.(7[6-9]|[89]\d))/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps a shared module and its callers on one supabase specifier", () => {
    /*
     * A type from one module instance and a client from another are nominally
     * incompatible: SupabaseClient has a protected member, so neither counts as
     * "a class derived from" the other, and passing one to the other is TS2345.
     *
     * process-stripe-event typed its parameter from esm.sh 2.57.2 while
     * reconcile-stripe-subscriptions already built its client from
     * npm ^2.76.1. That stayed invisible until `^2.76.1` resolved to 2.119.2,
     * at which point edge-functions-deno failed on every pull request with an
     * error in a file nobody had touched. The two specifiers only have to
     * agree where a client crosses between them, which is here.
     */
    const specifier = (text: string) =>
      text.match(/["'](?:npm:|https:\/\/esm\.sh\/)@supabase\/supabase-js@[^"']+["']/)?.[0] ?? null;

    const shared = "supabase/functions/_shared/process-stripe-event.ts";
    const want = specifier(readFileSync(shared, "utf8"));
    expect(want, `${shared} should import supabase-js`).toBeTruthy();

    const callers = readdirSync("supabase/functions")
      .map((d) => `supabase/functions/${d}/index.ts`)
      .filter((f) => existsSync(f) && readFileSync(f, "utf8").includes("process-stripe-event"));
    expect(callers.length, "no callers found, so this rule checks nothing").toBeGreaterThan(0);

    const mismatched = callers.filter((f) => specifier(readFileSync(f, "utf8")) !== want);
    expect(mismatched, `these pass a client to ${shared}, which imports ${want}`).toEqual([]);
  });

  it("never pin npm supabase-js 2.76.0, which fails to boot (missing tslib)", () => {
    const offenders = walk("supabase/functions").filter((file) =>
      readFileSync(file, "utf8").includes("npm:@supabase/supabase-js@2.76.0"),
    );
    expect(offenders).toEqual([]);
  });
});
