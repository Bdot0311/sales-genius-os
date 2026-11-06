import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AI clients (Grok, Cursor, the MCP TypeScript SDK) refuse a server whose
// advertised OAuth `resource` differs from the URL they connected to. The
// public connector URL is https://api.outreign.io/mcp, so the server must
// advertise exactly that, via metadata served at the same public host.
const PUBLIC_MCP = "https://api.outreign.io/mcp";

describe("MCP public resource binding", () => {
  const entry = readFileSync("src/lib/mcp/index.ts", "utf8");
  const metadataFn = readFileSync("supabase/functions/mcp-oauth-metadata/index.ts", "utf8");

  it("pins the advertised resource to the public connector URL", () => {
    expect(entry).toContain(`resource: "${PUBLIC_MCP}"`);
  });

  it("points the sign-in challenge at metadata on the public host", () => {
    expect(entry).toContain('protectedResourceMetadataUrl: "https://api.outreign.io/mcp-oauth-metadata"');
  });

  it("serves metadata whose resource equals the public connector URL", () => {
    expect(metadataFn).toContain(`const PUBLIC_MCP_RESOURCE = "${PUBLIC_MCP}"`);
    expect(metadataFn).toContain("resource: PUBLIC_MCP_RESOURCE");
  });

  it("keeps the metadata endpoint publicly readable", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config).toMatch(/\[functions\.mcp-oauth-metadata\]\s*\n\s*verify_jwt = false/);
  });

  it("documents the same connector URL", () => {
    expect(readFileSync("developer-docs/mcp/connect.mdx", "utf8")).toContain(PUBLIC_MCP);
  });
});
