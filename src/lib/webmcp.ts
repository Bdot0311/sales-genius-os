/**
 * WebMCP — exposes a small set of read-only, navigation-level site tools to
 * AI agents running in the browser (navigator.modelContext).
 *
 * Spec: https://webmachinelearning.github.io/webmcp/
 *
 * Deliberately limited to public, non-destructive actions: discovery metadata,
 * pricing/plan info, and navigation. Anything that touches user data goes
 * through the authenticated MCP server instead (see /connect).
 */

type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
  }>;
};

type ModelContext = {
  provideContext?: (context: { tools: WebMcpTool[] }) => void;
  registerTool?: (tool: WebMcpTool) => void;
};

const PAGES: Record<string, string> = {
  home: "/",
  pricing: "/pricing",
  blog: "/blog",
  help: "/help",
  "api-docs": "/api-docs",
  "api-status": "/api-status",
  connect: "/connect",
  security: "/security",
  privacy: "/privacy",
  terms: "/terms",
  partners: "/partners",
  signup: "/auth",
};

const PLANS = [
  { name: "Explore (Free)", price: "$0/mo", includes: "100 lead searches per month, up to 25 results per search, 100 emails per month, view-only dashboard, Explore AI SDR agent (1 agent build, 25 leads/day sourcing, 3 draft replies/day for approval)." },
  { name: "Starter", price: "$39/mo", includes: "1,000 prospects per month, 100 per day, 50,000 emails per month, ICP Builder (3 profiles), AI email generator" },
  { name: "Growth", price: "$89/mo", includes: "2,500 prospects per month, 250 per day, 250,000 emails per month, unified reply inbox, ICP lookalike discovery, Growth AI SDR agent (3 agent builds, 300 leads/day, 50 replies/day, objection handling)" },
  { name: "Pro", price: "$179/mo", includes: "5,000 prospects per month, 500 per day, 1,000,000 emails per month, sequence branching and A/B testing, CRM integrations, Pro AI SDR agent (5 agent builds, 750 leads/day, 150 replies/day, meeting booking)" },
  { name: "Agency", price: "$249/mo", includes: "15,000 prospects per month, 1,500 per day, unlimited emails, white-label client portal, Elite AI SDR agent (unlimited agent builds, unlimited sourcing, 500 replies/day)" },
];

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

const tools: WebMcpTool[] = [
  {
    name: "outreign_get_overview",
    description:
      "Get a short factual overview of OutReign: what the product does, who it is for, and the key capabilities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () =>
      text(
        [
          "OutReign is a B2B lead intelligence and outbound sales platform.",
          "Core workflow: describe your ideal customer in plain English, review ranked verified prospects, research each lead, then draft and send personalized email sequences and manage replies.",
          "Key capabilities: plain-English lead search, ICP scoring, lead research briefs, AI email drafting, multi-touch sequences, reply management, deliverability suite, and a full-cycle AI SDR agent.",
          "Best for founder-led B2B sales teams, outbound agencies, and SDR/growth teams. Not a fit for e-commerce or B2C.",
        ].join("\n"),
      ),
  },
  {
    name: "outreign_list_plans",
    description: "List OutReign subscription plans with prices and what each plan includes.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () =>
      text(
        PLANS.map((p) => `${p.name}: ${p.price}: ${p.includes}`).join("\n") +
          "\nPricing scales by prospects contacted per month, not per seat. Seats are unlimited on paid plans. Monthly and yearly billing are both available; yearly saves 20%. All four paid plans start with a 14-day free trial and a 30-day money-back guarantee. Explore is free forever and needs no credit card. One-time credit packs: 200 prospects for $37.50, 400 for $67.50, 600 for $90.",
      ),
  },
  {
    name: "outreign_get_agent_connection",
    description:
      "Get the details an AI assistant needs to connect to OutReign's authenticated MCP server (endpoint, transport, auth, and setup guide).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => {
      const ref = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";
      const endpoint = ref ? `https://${ref}.supabase.co/functions/v1/mcp` : "see /connect";
      return text(
        [
          `MCP endpoint: ${endpoint}`,
          "Transport: streamable HTTP",
          "Auth: OAuth 2.1 (authorization code + PKCE); the user signs in to OutReign and approves the client.",
          `Server card: ${window.location.origin}/.well-known/mcp/server-card.json`,
          `Agent auth guide: ${window.location.origin}/auth.md`,
          `Step-by-step setup: ${window.location.origin}/connect`,
        ].join("\n"),
      );
    },
  },
  {
    name: "outreign_navigate",
    description:
      "Navigate the OutReign site to a known public page so the user can see it. Returns the resulting URL.",
    inputSchema: {
      type: "object",
      properties: {
        page: {
          type: "string",
          enum: Object.keys(PAGES),
          description: "Which public page to open.",
        },
      },
      required: ["page"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const page = String(args?.page ?? "");
      const path = PAGES[page];
      if (!path) return text(`Unknown page "${page}". Available: ${Object.keys(PAGES).join(", ")}`);
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return text(`Navigated to ${window.location.origin}${path}`);
    },
  },
];

export function registerWebMcpTools() {
  if (typeof navigator === "undefined") return;
  const ctx = (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  if (!ctx) return;
  try {
    if (typeof ctx.provideContext === "function") {
      ctx.provideContext({ tools });
    } else if (typeof ctx.registerTool === "function") {
      tools.forEach((tool) => ctx.registerTool?.(tool));
    }
  } catch {
    // WebMCP is progressive enhancement — never break the app if it fails.
  }
}
