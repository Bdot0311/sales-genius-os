// RFC 9728 protected-resource metadata for the OutReign MCP server.
//
// AI clients connect to the public address (https://api.outreign.io/mcp, a
// Cloudflare Worker in front of the backend). MCP clients verify that the
// `resource` in this document equals the URL they connected to; the SDK's
// built-in document advertised the backend host instead, so strict clients
// (Grok, Cursor, the MCP TypeScript SDK) refused the server with
// "failed_to_load". The MCP function points its 401 challenge here.

const PUBLIC_MCP_RESOURCE = "https://api.outreign.io/mcp";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const backend = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const body = {
    resource: PUBLIC_MCP_RESOURCE,
    authorization_servers: [`${backend}/auth/v1`],
    bearer_methods_supported: ["header"],
    resource_name: "OutReign",
    resource_documentation: "https://docs.outreign.io/developer-docs/mcp/connect",
  };

  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    },
  });
});
