import { useState } from "react";
import { Copy, Check, ExternalLink, ArrowLeft, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const BASE_URL_TEMPLATE = "https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/rest-api";

type Endpoint = {
  name: string;
  method: string;
  path: string;
  description: string;
  params?: { name: string; type: string; description: string }[];
  bodyExample?: Record<string, unknown>;
  responseExample: Record<string, unknown>;
  responseStatus: number;
};

const endpointGroups: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: "Leads",
    endpoints: [
      { name: "List Leads", method: "GET", path: "/leads", description: "Retrieve all leads with optional filtering and pagination", params: [{ name: "industry", type: "string", description: "Filter by industry" }, { name: "status", type: "string", description: "Filter by lead_status" }, { name: "limit", type: "number", description: "Results per page (1–100, default 50)" }, { name: "offset", type: "number", description: "Pagination offset" }], responseStatus: 200, responseExample: { data: [{ id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc", industry: "Technology", icp_score: 85 }], count: 1, limit: 50, offset: 0 } },
      { name: "Get Lead", method: "GET", path: "/leads/:id", description: "Retrieve a single lead by ID", responseStatus: 200, responseExample: { data: { id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc" } } },
      { name: "Create Lead", method: "POST", path: "/leads", description: "Create a new lead", bodyExample: { contact_name: "Jane Doe", company_name: "Acme Inc", contact_email: "jane@acme.com", industry: "Technology", job_title: "VP Sales" }, responseStatus: 201, responseExample: { data: { id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc", created_at: "2026-02-23T10:30:00Z" } } },
      { name: "Update Lead", method: "PATCH", path: "/leads/:id", description: "Update an existing lead (partial update)", bodyExample: { lead_status: "qualified", icp_score: 92 }, responseStatus: 200, responseExample: { data: { id: "uuid", lead_status: "qualified", icp_score: 92 } } },
      { name: "Delete Lead", method: "DELETE", path: "/leads/:id", description: "Delete a lead", responseStatus: 200, responseExample: { deleted: true } },
      { name: "Bulk Import Leads", method: "POST", path: "/leads/bulk", description: "Import up to 100 leads in a single request", bodyExample: { leads: [{ contact_name: "Jane Doe", company_name: "Acme Corp", contact_email: "jane@acme.com" }, { contact_name: "Bob Smith", company_name: "TechCo", job_title: "CTO" }] }, responseStatus: 201, responseExample: { imported: 2, failed: 0, leads: ["..."], errors: [] } },
      { name: "Enrich Lead", method: "POST", path: "/leads/:id/enrich", description: "Trigger AI enrichment for a lead", responseStatus: 200, responseExample: { status: "enriched", fields_updated: ["job_title", "linkedin_url", "company_size"] } },
      { name: "Score Lead", method: "POST", path: "/leads/:id/score", description: "Trigger ICP scoring for a lead", responseStatus: 200, responseExample: { icp_score: 87, explanation: "Strong fit: VP-level, Technology sector, 500+ employees" } },
    ],
  },
  {
    title: "Deals",
    endpoints: [
      { name: "List Deals", method: "GET", path: "/deals", description: "Retrieve deals with optional filtering", params: [{ name: "stage", type: "string", description: "Filter by deal stage" }, { name: "limit", type: "number", description: "Results per page (1–100, default 50)" }, { name: "offset", type: "number", description: "Pagination offset" }], responseStatus: 200, responseExample: { data: [{ id: "uuid", title: "Enterprise Deal", value: 50000, stage: "negotiation", probability: 75 }], count: 1 } },
      { name: "Create Deal", method: "POST", path: "/deals", description: "Create a new deal", bodyExample: { title: "Enterprise Deal", company_name: "Acme Inc", value: 50000, stage: "discovery", probability: 30 }, responseStatus: 201, responseExample: { data: { id: "uuid", title: "Enterprise Deal", stage: "discovery" } } },
      { name: "Update Deal", method: "PATCH", path: "/deals/:id", description: "Update a deal (e.g. change stage, value)", bodyExample: { stage: "negotiation", probability: 75 }, responseStatus: 200, responseExample: { data: { id: "uuid", stage: "negotiation", probability: 75 } } },
      { name: "Delete Deal", method: "DELETE", path: "/deals/:id", description: "Delete a deal", responseStatus: 200, responseExample: { deleted: true } },
    ],
  },
  {
    title: "Activities",
    endpoints: [
      { name: "List Activities", method: "GET", path: "/activities", description: "Retrieve activities with optional filtering", params: [{ name: "type", type: "string", description: "Filter by type (task, call, email, note)" }, { name: "limit", type: "number", description: "Results per page (1–100, default 50)" }], responseStatus: 200, responseExample: { data: [{ id: "uuid", subject: "Follow up call", type: "call", completed: false }], count: 1 } },
      { name: "Create Activity", method: "POST", path: "/activities", description: "Create an activity (task, call, email, note)", bodyExample: { subject: "Follow up call", type: "call", due_date: "2026-03-01T10:00:00Z", lead_id: "uuid" }, responseStatus: 201, responseExample: { data: { id: "uuid", subject: "Follow up call", type: "call" } } },
      { name: "Update Activity", method: "PATCH", path: "/activities/:id", description: "Update an activity (mark complete, reschedule)", bodyExample: { completed: true }, responseStatus: 200, responseExample: { data: { id: "uuid", completed: true } } },
      { name: "Delete Activity", method: "DELETE", path: "/activities/:id", description: "Delete an activity", responseStatus: 200, responseExample: { deleted: true } },
    ],
  },
  {
    title: "Contacts",
    endpoints: [
      { name: "List Contacts", method: "GET", path: "/contacts", description: "Retrieve contacts with optional filtering", params: [{ name: "status", type: "string", description: "Filter by lead_status" }, { name: "limit", type: "number", description: "Results per page (1–100, default 50)" }], responseStatus: 200, responseExample: { data: [{ id: "uuid", first_name: "Jane", last_name: "Doe", email: "jane@acme.com" }], count: 1 } },
      { name: "Create Contact", method: "POST", path: "/contacts", description: "Create a new contact", bodyExample: { first_name: "Jane", last_name: "Doe", email: "jane@acme.com", job_title: "VP Sales" }, responseStatus: 201, responseExample: { data: { id: "uuid", first_name: "Jane", last_name: "Doe" } } },
      { name: "Update Contact", method: "PATCH", path: "/contacts/:id", description: "Update a contact", bodyExample: { job_title: "SVP Sales" }, responseStatus: 200, responseExample: { data: { id: "uuid", job_title: "SVP Sales" } } },
      { name: "Delete Contact", method: "DELETE", path: "/contacts/:id", description: "Delete a contact", responseStatus: 200, responseExample: { deleted: true } },
    ],
  },
  {
    title: "Workflows",
    endpoints: [
      { name: "List Workflows", method: "GET", path: "/workflows", description: "Retrieve all workflows", responseStatus: 200, responseExample: { data: [{ id: "uuid", name: "New Lead Notifier", trigger: "new_lead", active: true }], count: 1 } },
      { name: "Toggle Workflow", method: "PATCH", path: "/workflows/:id", description: "Enable or disable a workflow", bodyExample: { active: false }, responseStatus: 200, responseExample: { data: { id: "uuid", active: false } } },
      { name: "Execute Workflow", method: "POST", path: "/workflows/:id/execute", description: "Trigger a workflow execution with optional test data", bodyExample: { data: { lead_id: "uuid" } }, responseStatus: 200, responseExample: { success: true, executed_actions: 3 } },
    ],
  },
  {
    title: "Outreach",
    endpoints: [
      { name: "Generate Email", method: "POST", path: "/email/generate", description: "Generate an AI email draft for a lead", bodyExample: { leadId: "uuid", tone: "professional", trigger_context: "New funding round" }, responseStatus: 200, responseExample: { subject: "Congrats on the funding!", body: "Hi Jane, I saw that Acme just raised..." } },
    ],
  },
];

const methodStyle: Record<string, { bg: string; border: string; color: string }> = {
  GET:    { bg: "hsl(142 70% 55% / 0.1)", border: "hsl(142 70% 55% / 0.3)", color: "hsl(142 70% 62%)" },
  POST:   { bg: "hsl(261 75% 55% / 0.1)", border: "hsl(261 75% 55% / 0.3)", color: "hsl(261 75% 68%)" },
  PATCH:  { bg: "hsl(38 85% 60% / 0.1)",  border: "hsl(38 85% 60% / 0.3)",  color: "hsl(38 85% 65%)" },
  DELETE: { bg: "hsl(0 70% 65% / 0.1)",   border: "hsl(0 70% 65% / 0.3)",   color: "hsl(0 70% 68%)" },
};

const webhookVerificationCode: Record<string, string> = {
  javascript: `const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const calculated = hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(calculated));
}

app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  if (!verifyWebhookSignature(req.body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  console.log('Webhook verified:', req.body);
  res.status(200).send('OK');
});`,
  python: `import hmac, hashlib, json

def verify_webhook_signature(payload, signature, secret):
    calculated = hmac.new(
        secret.encode(), json.dumps(payload).encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, calculated)

@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    if not verify_webhook_signature(request.json, signature, os.environ['WEBHOOK_SECRET']):
        return 'Invalid signature', 401
    print('Webhook verified:', request.json)
    return 'OK', 200`,
  php: `<?php
function verifyWebhookSignature($payload, $signature, $secret) {
    $calculated = hash_hmac('sha256', json_encode($payload), $secret);
    return hash_equals($signature, $calculated);
}

$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'];
$payload = json_decode(file_get_contents('php://input'), true);

if (!verifyWebhookSignature($payload, $signature, getenv('WEBHOOK_SECRET'))) {
    http_response_code(401);
    die('Invalid signature');
}
echo 'OK';`,
};

const generateSnippet = (endpoint: Endpoint, lang: string): string => {
  const url = `${BASE_URL_TEMPLATE}${endpoint.path}`;
  const hasBody = endpoint.bodyExample && ["POST", "PATCH", "PUT"].includes(endpoint.method);
  const bodyStr = hasBody ? JSON.stringify(endpoint.bodyExample, null, 2) : "";
  switch (lang) {
    case "javascript":
      return hasBody
        ? `const response = await fetch('${url}', {\n  method: '${endpoint.method}',\n  headers: {\n    'X-API-Key': 'your-api-key',\n    'Content-Type': 'application/json',\n  },\n  body: JSON.stringify(${bodyStr}),\n});\n\nconst data = await response.json();\nconsole.log(data);`
        : `const response = await fetch('${url}', {\n  headers: { 'X-API-Key': 'your-api-key' },\n});\n\nconst data = await response.json();\nconsole.log(data);`;
    case "python":
      return hasBody
        ? `import requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n    '${url}',\n    headers={'X-API-Key': 'your-api-key'},\n    json=${bodyStr}\n)\nprint(response.json())`
        : `import requests\n\nresponse = requests.get(\n    '${url}',\n    headers={'X-API-Key': 'your-api-key'}\n)\nprint(response.json())`;
    case "curl":
      return hasBody
        ? `curl -X ${endpoint.method} '${url}' \\\n  -H 'X-API-Key: your-api-key' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(endpoint.bodyExample)}'`
        : `curl '${url}' \\\n  -H 'X-API-Key: your-api-key'`;
    case "php":
      return hasBody
        ? `<?php\n$ch = curl_init('${url}');\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => '${endpoint.method}',\n    CURLOPT_POSTFIELDS => json_encode(${bodyStr}),\n    CURLOPT_HTTPHEADER => [\n        'X-API-Key: your-api-key',\n        'Content-Type: application/json',\n    ],\n    CURLOPT_RETURNTRANSFER => true,\n]);\n$response = curl_exec($ch);\ncurl_close($ch);\nprint_r(json_decode($response, true));`
        : `<?php\n$ch = curl_init('${url}');\ncurl_setopt_array($ch, [\n    CURLOPT_HTTPHEADER => ['X-API-Key: your-api-key'],\n    CURLOPT_RETURNTRANSFER => true,\n]);\n$response = curl_exec($ch);\ncurl_close($ch);\nprint_r(json_decode($response, true));`;
    default:
      return "";
  }
};

const codeBlockStyle = {
  background: "hsl(261 75% 50% / 0.06)",
  border: "1px solid hsl(261 75% 50% / 0.18)",
  color: "hsl(261 75% 72%)",
} as const;

const cardStyle = {
  background: "hsl(261 75% 50% / 0.04)",
  border: "1px solid hsl(261 75% 50% / 0.14)",
} as const;

function MethodTag({ method }: { method: string }) {
  const s = methodStyle[method] ?? methodStyle.GET;
  return (
    <span
      className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {method}
    </span>
  );
}

function CodeTabs({ tabs, id }: { tabs: { label: string; value: string }[]; id: string }) {
  const [active, setActive] = useState(tabs[0].label);
  const activeTab = tabs.find((t) => t.label === active)!;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = () => {
    navigator.clipboard.writeText(activeTab.value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(261 75% 50% / 0.18)" }}>
      <div
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto"
        style={{ background: "hsl(261 75% 50% / 0.08)", borderBottom: "1px solid hsl(261 75% 50% / 0.14)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.label}
            onClick={() => setActive(t.label)}
            className="px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap"
            style={
              active === t.label
                ? { background: "hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 92%)" }
                : { color: "hsl(0 0% 100% / 0.5)" }
            }
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={copy}
          className="ml-auto p-1.5 rounded transition-colors"
          style={{ color: copiedId === id ? "hsl(142 70% 60%)" : "hsl(0 0% 100% / 0.65)" }}
          title="Copy"
        >
          {copiedId === id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre
        className="p-4 text-xs overflow-x-auto leading-relaxed"
        style={{ background: "hsl(261 75% 50% / 0.04)", color: "hsl(261 75% 72%)" }}
      >
        <code>{activeTab.value}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-[0.8em] px-1.5 py-0.5 rounded font-mono"
      style={{ background: "hsl(261 75% 50% / 0.1)", color: "hsl(261 75% 72%)" }}
    >
      {children}
    </code>
  );
}

function EndpointCard({ endpoint, copiedCode, onCopy }: { endpoint: Endpoint; copiedCode: string | null; onCopy: (code: string, id: string) => void }) {
  const cardId = `${endpoint.method}-${endpoint.path}`;
  const langs = ["javascript", "python", "curl", "php"];

  return (
    <div className="rounded-2xl overflow-hidden" style={cardStyle}>
      <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.1)" }}>
        <div className="flex flex-wrap items-center gap-2.5 mb-2">
          <MethodTag method={endpoint.method} />
          <code className="text-sm font-mono" style={{ color: "hsl(0 0% 80%)" }}>{endpoint.path}</code>
        </div>
        <h3 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>{endpoint.name}</h3>
        <p className="text-sm mt-1" style={{ color: "hsl(0 0% 100% / 0.5)" }}>{endpoint.description}</p>
      </div>

      <div className="px-5 sm:px-6 py-5 space-y-5">
        {endpoint.params && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              Query Parameters
            </p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(261 75% 50% / 0.14)" }}>
              <table className="w-full text-sm">
                <thead style={{ background: "hsl(261 75% 50% / 0.06)", borderBottom: "1px solid hsl(261 75% 50% / 0.14)" }}>
                  <tr>
                    {["Name", "Type", "Description"].map((h) => (
                      <th key={h} className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(261 75% 65%)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params!.map((p, i) => (
                    <tr key={p.name} style={{ borderTop: i > 0 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined }}>
                      <td className="p-3"><InlineCode>{p.name}</InlineCode></td>
                      <td className="p-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "hsl(261 75% 50% / 0.08)", color: "hsl(261 75% 65%)" }}>{p.type}</span>
                      </td>
                      <td className="p-3 text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {endpoint.bodyExample && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              Request Body
            </p>
            <pre className="p-3 rounded-xl text-xs overflow-x-auto" style={codeBlockStyle}>
              {JSON.stringify(endpoint.bodyExample, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
            Response
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(261 75% 50% / 0.1)", color: "hsl(261 75% 65%)" }}>
              {endpoint.responseStatus}
            </span>
          </p>
          <pre className="p-3 rounded-xl text-xs overflow-x-auto" style={codeBlockStyle}>
            {JSON.stringify(endpoint.responseExample, null, 2)}
          </pre>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
            Code Examples
          </p>
          <CodeTabs
            id={cardId}
            tabs={langs.map((lang) => ({ label: lang === "javascript" ? "JS" : lang === "python" ? "Python" : lang === "curl" ? "cURL" : "PHP", value: generateSnippet(endpoint, lang) }))}
          />
        </div>
      </div>
    </div>
  );
}

const ApiDocs = () => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const navigate = useNavigate();

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDownloadDocs = () => {
    const lines: string[] = ["SALESOS API DOCUMENTATION", "=".repeat(50), `Base URL: ${BASE_URL_TEMPLATE}`, `Generated: ${new Date().toISOString()}`, ""];
    endpointGroups.forEach((group) => {
      lines.push("", "=".repeat(50), group.title.toUpperCase(), "=".repeat(50));
      group.endpoints.forEach((ep) => {
        lines.push("", `${ep.method} ${ep.path}`, `  ${ep.name}: ${ep.description}`);
        if (ep.params?.length) { lines.push("  Query Parameters:"); ep.params.forEach((p) => lines.push(`    ${p.name} (${p.type}): ${p.description}`)); }
        if (ep.bodyExample) { lines.push("  Request Body:"); JSON.stringify(ep.bodyExample, null, 2).split("\n").forEach((l) => lines.push(`    ${l}`)); }
        lines.push(`  Response (${ep.responseStatus}):`);
        JSON.stringify(ep.responseExample, null, 2).split("\n").forEach((l) => lines.push(`    ${l}`));
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "salesos-api-docs.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SEOHead
        title="API Documentation – OutReign Developer Portal"
        description="Complete OutReign REST API reference with code examples in JavaScript, Python, PHP & cURL. Manage leads, deals, contacts, workflows & outreach programmatically."
        keywords="OutReign API, sales API, lead generation API, CRM API, REST API documentation, webhook integration"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "API Documentation", url: "https://outreign.io/api-docs" },
      ]} />

      <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-12 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-16"
            aria-labelledby="api-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)", backgroundSize: "32px 32px" }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none"
              style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, transparent 70%)", filter: "blur(40px)" }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-60px] right-[-100px] h-[360px] w-[360px] rounded-full hero-orb pointer-events-none"
              style={{ background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.1) 0%, transparent 70%)", filter: "blur(50px)", animationDelay: "6s" }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-5xl">
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 mb-6 text-sm transition-colors"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 sm:text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                    Developers
                  </span>
                  <h1
                    id="api-heading"
                    className="font-display text-3xl sm:text-4xl mb-2"
                    style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
                  >
                    API{" "}
                    <span
                      className="font-display italic animate-shiny"
                      style={{
                        backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        filter: "url(#c3-noise)",
                      }}
                    >
                      Documentation
                    </span>
                  </h1>
                  <p style={{ color: "hsl(0 0% 100% / 0.55)" }}>Full REST API reference for third-party integrations</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={handleDownloadDocs}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  >
                    <Download className="w-4 h-4" />
                    Download Docs
                  </button>
                  <a
                    href="/api-status"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-colors"
                    style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  >
                    <ExternalLink className="w-4 h-4" />
                    API Status
                  </a>
                </div>
              </div>
            </div>
          </section>

          <div className="container mx-auto px-5 sm:px-6 pb-16 max-w-5xl space-y-8">

            {/* Getting Started */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
                <h2 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Getting Started</h2>
                <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Authentication, base URL, and rate limits</p>
              </div>
              <div className="px-5 sm:px-6 py-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Base URL</p>
                  <div className="px-3 py-2 rounded-xl font-mono text-sm break-all" style={codeBlockStyle}>{BASE_URL_TEMPLATE}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Authentication</p>
                  <p className="text-sm mb-3" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                    Include your API key in the <InlineCode>X-API-Key</InlineCode> header. Generate API keys from <strong style={{ color: "hsl(0 0% 80%)" }}>Settings → API Keys</strong> (Pro plan).
                  </p>
                  <div className="px-3 py-2 rounded-xl font-mono text-sm" style={codeBlockStyle}>X-API-Key: sk_your_api_key_here</div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Rate Limits</p>
                  <p className="text-sm mb-2" style={{ color: "hsl(0 0% 100% / 0.55)" }}>Rate limits are configured per API key. Check response headers:</p>
                  <ul className="space-y-1.5">
                    {[["X-RateLimit-Remaining", "Requests remaining in window"], ["X-RateLimit-Reset", "ISO timestamp when the limit resets"]].map(([h, d]) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <InlineCode>{h}</InlineCode>
                        <span style={{ color: "hsl(0 0% 100% / 0.55)" }}>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Data Scoping</p>
                  <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                    All requests are scoped to the API key owner's account. You can only access your own data.
                  </p>
                </div>
              </div>
            </div>

            {/* Endpoint Groups */}
            {endpointGroups.map((group) => (
              <div key={group.title} className="space-y-4">
                <h2 className="text-2xl font-bold pt-2" style={{ color: "hsl(0 0% 92%)", letterSpacing: "-0.01em", borderBottom: "1px solid hsl(261 75% 50% / 0.18)", paddingBottom: "0.5rem" }}>
                  {group.title}
                </h2>
                {group.endpoints.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} copiedCode={copiedCode} onCopy={copyToClipboard} />
                ))}
              </div>
            ))}

            {/* Webhook Verification */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
                <h2 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Webhook Signature Verification</h2>
                <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Securely verify incoming webhook deliveries from OutReign</p>
              </div>
              <div className="px-5 sm:px-6 py-5">
                <p className="text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                  Every webhook delivery includes an <InlineCode>X-Webhook-Signature</InlineCode> header.
                  Verify it using HMAC-SHA256 with your webhook secret.
                </p>
                <CodeTabs
                  id="webhook"
                  tabs={Object.entries(webhookVerificationCode).map(([lang, code]) => ({ label: lang === "javascript" ? "JavaScript" : lang === "python" ? "Python" : "PHP", value: code }))}
                />
              </div>
            </div>

            {/* Third-Party Integration */}
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <div className="px-5 sm:px-6 py-4" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
                <h2 className="font-semibold" style={{ color: "hsl(0 0% 90%)" }}>Third-Party Integration Quick Start</h2>
                <p className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Connect OutReign with popular automation tools</p>
              </div>
              <div className="px-5 sm:px-6 py-5 space-y-4">
                {[
                  { title: "Zapier / Make / n8n", body: <>Use a generic HTTP / Webhook module. Set the base URL above, add your <InlineCode>X-API-Key</InlineCode> header, and call any endpoint listed in this documentation.</> },
                  { title: "Python / Node.js Scripts", body: <>Use the code examples above directly. The bulk import endpoint (<InlineCode>POST /leads/bulk</InlineCode>) is optimized for importing leads from AI tools, CSV processors, and enrichment pipelines.</> },
                  { title: "External Lead Tools", body: <>Export leads from external tools as JSON, then push them into OutReign using the bulk import endpoint. Trigger enrichment and scoring via <InlineCode>POST /leads/:id/enrich</InlineCode> and <InlineCode>POST /leads/:id/score</InlineCode>.</> },
                ].map(({ title, body }) => (
                  <div key={title}>
                    <h3 className="font-semibold mb-1.5" style={{ color: "hsl(0 0% 85%)" }}>{title}</h3>
                    <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>{body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Help */}
            <div className="rounded-2xl p-5 sm:p-6" style={cardStyle}>
              <h2 className="font-semibold mb-3" style={{ color: "hsl(0 0% 90%)" }}>Need Help?</h2>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                <li>Visit our <a href="/help" className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>Help Center</a> for guides and troubleshooting</li>
                <li>Check our <a href="/api-status" className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>API Status Page</a> for real-time system status</li>
                <li>Contact support at <a href="mailto:support@bdotindustries.com" className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>support@bdotindustries.com</a></li>
              </ul>
            </div>

            {/* Related */}
            <div className="pt-4" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.18)" }}>
              <p className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>Related resources</p>
              <ul className="grid sm:grid-cols-2 gap-3 text-sm">
                {[
                  { href: "/security", label: "Security Practices", sub: "Enterprise-grade data protection" },
                  { href: "/pricing", label: "Pricing Plans", sub: "Find the right plan for your team" },
                  { href: "/privacy", label: "Privacy Policy", sub: "How we handle your data" },
                  { href: "/terms", label: "Terms of Service", sub: "User agreement and policies" },
                ].map(({ href, label, sub }) => (
                  <li key={href}>
                    <a href={href} className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>{label}</a>
                    <span style={{ color: "hsl(0 0% 100% / 0.55)" }}> – {sub}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default ApiDocs;
