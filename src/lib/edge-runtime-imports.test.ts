import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
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

  it("never pin npm supabase-js 2.76.0, which fails to boot (missing tslib)", () => {
    const offenders = walk("supabase/functions").filter((file) =>
      readFileSync(file, "utf8").includes("npm:@supabase/supabase-js@2.76.0"),
    );
    expect(offenders).toEqual([]);
  });
});
