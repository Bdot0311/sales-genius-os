import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const FN = code(readFileSync("supabase/functions/disconnect-integration/index.ts", "utf8"));
const PAGE = readFileSync("src/pages/DashboardIntegrations.tsx", "utf8");
const handler = code(
  PAGE.slice(PAGE.indexOf("const handleDisconnect = async ("), PAGE.indexOf("\n  };", PAGE.indexOf("const handleDisconnect = async ("))),
);

/**
 * Connecting an inbox worked and removing one did not, and the asymmetry was
 * structural rather than bad luck.
 *
 * Connect runs in an edge function on the service role, which bypasses table
 * grants. Remove wrote straight from the page and needed a privilege
 * `authenticated` does not hold, so it failed with `permission denied for
 * table integrations` — raised before RLS is ever consulted.
 *
 * A migration granting that write was the obvious repair and it did not take
 * effect: the migration ledger here belongs to Lovable, and a file added
 * through a pull request is not necessarily in it. So Remove stops depending
 * on the grant and runs the way Connect already does.
 *
 * It is the better posture too. `integrations.config` holds OAuth refresh
 * tokens and 20260901211628 deliberately took away the browser's ability to
 * read them; handing the browser a table-wide UPDATE to flip one boolean
 * widens what that page can write to the same row.
 */
describe("removing an integration no longer needs a browser grant", () => {
  it("the page asks the function instead of writing to the table", () => {
    expect(handler).toContain("functions.invoke('disconnect-integration'");
    // The write that could not work from here.
    expect(handler).not.toContain("from('integrations')");
    expect(handler).not.toContain(".update({ is_active: false })");
  });

  it("it passes whichever identifier it has", () => {
    expect(handler).toContain("rowId ? { rowId } : { integrationId }");
  });

  it("a failure shows the function's reason, not the transport's", () => {
    expect(handler).toContain("edgeErrorMessage(error");
    expect(handler).not.toMatch(/description:\s*error\.message/);
  });
});

describe("the function decides whose row it is", () => {
  it("resolves the caller rather than trusting the body", () => {
    expect(FN).toContain("resolveCaller(req)");
    expect(FN).toContain('ownerOf(supabase, "integrations", rowId, caller)');
    // A user_id in the request would be a way to disconnect someone else's.
    expect(FN).not.toMatch(/body\??\.\s*user_?[Ii]d/);
  });

  it("an unknown row and someone else's row give the same answer", () => {
    /*
     * ownerOf returns null for both, and the reply must not distinguish them
     * or it becomes a way to discover whose a record is.
     */
    expect(FN).toContain('if (!owner) return json({ error: "That integration was not found."');
  });

  it("ownership is settled before anything is written", () => {
    const check = FN.indexOf("ownerOf(");
    const write = FN.indexOf(".update({ is_active: false })");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(write);
  });

  it("the bulk path is scoped to the caller's own rows", () => {
    // No ownerOf to lean on when no row id was given, so the filter is what
    // keeps it to this account.
    expect(FN).toContain('.eq("user_id", caller.userId)');
  });

  it("a service key cannot disconnect on nobody's behalf", () => {
    /*
     * An internal caller is trusted but has not said whose integration it
     * means, and nothing schedules a disconnect. Letting it through would mean
     * a body alone could choose the row.
     */
    expect(FN).toContain("if (caller.internal)");
    expect(FN).toContain("user_required");
  });

  it("it reports when there was nothing to disconnect", () => {
    /*
     * The guard, not the sentence. A mutation that disabled the check left
     * the message in place, unreachable, and a grep for it still passed.
     */
    expect(FN).toContain("if (!data?.length) {");
    expect(FN).toContain("There was nothing connected to disconnect.");
    // The select is what makes `data.length` mean anything at all.
    expect(FN).toContain('.select("id")');
  });

  it("it refuses a request that names nothing", () => {
    expect(FN).toContain("invalid_input");
  });
});
