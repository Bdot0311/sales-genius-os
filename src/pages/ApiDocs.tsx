import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  bodyExample?: Record<string, any>;
  responseExample: Record<string, any>;
  responseStatus: number;
};

const endpointGroups: { title: string; endpoints: Endpoint[] }[] = [
  {
    title: "Leads",
    endpoints: [
      {
        name: "List Leads",
        method: "GET",
        path: "/leads",
        description: "Retrieve all leads with optional filtering and pagination",
        params: [
          { name: "industry", type: "string", description: "Filter by industry" },
          { name: "status", type: "string", description: "Filter by lead_status" },
          { name: "limit", type: "number", description: "Results per page (1–100, default 50)" },
          { name: "offset", type: "number", description: "Pagination offset" },
        ],
        responseStatus: 200,
        responseExample: {
          data: [{ id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc", industry: "Technology", icp_score: 85 }],
          count: 1,
          limit: 50,
          offset: 0,
        },
      },
      {
        name: "Get Lead",
        method: "GET",
        path: "/leads/:id",
        description: "Retrieve a single lead by ID",
        responseStatus: 200,
        responseExample: { data: { id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc" } },
      },
      {
        name: "Create Lead",
        method: "POST",
        path: "/leads",
        description: "Create a new lead",
        bodyExample: { contact_name: "Jane Doe", company_name: "Acme Inc", contact_email: "jane@acme.com", industry: "Technology", job_title: "VP Sales" },
        responseStatus: 201,
        responseExample: { data: { id: "uuid", contact_name: "Jane Doe", company_name: "Acme Inc", created_at: "2026-02-23T10:30:00Z" } },
      },
      {
        name: "Update Lead",
        method: "PATCH",
        path: "/leads/:id",
        description: "Update an existing lead (partial update)",
        bodyExample: { lead_status: "qualified", icp_score: 92 },
        responseStatus: 200,
        responseExample: { data: { id: "uuid", lead_status: "qualified", icp_score: 92 } },
      },
      {
        name: "Delete Lead",
        method: "DELETE",
        path: "/leads/:id",
        description: "Delete a lead",
        responseStatus: 200,
        responseExample: { deleted: true },
      },
      {
        name: "Bulk Import Leads",
        method: "POST",
        path: "/leads/bulk",
        description: "Import up to 100 leads in a single request",
        bodyExample: {
          leads: [
            { contact_name: "Jane Doe", company_name: "Acme Corp", contact_email: "jane@acme.com" },
            { contact_name: "Bob Smith", company_name: "TechCo", job_title: "CTO" },
          ],
        },
        responseStatus: 201,
        responseExample: { imported: 2, failed: 0, leads: ["..."], errors: [] },
      },
      {
        name: "Enrich Lead",
        method: "POST",
        path: "/leads/:id/enrich",
        description: "Trigger AI enrichment for a lead",
        responseStatus: 200,
        responseExample: { status: "enriched", fields_updated: ["job_title", "linkedin_url", "company_size"] },
      },
      {
        name: "Score Lead",
        method: "POST",
        path: "/leads/:id/score",
        description: "Trigger ICP scoring for a lead",
        responseStatus: 200,
        responseExample: { icp_score: 87, explanation: "Strong fit: VP-level, Technology sector, 500+ employees" },
      },
    ],
  },
  {
    title: "Deals",
    endpoints: [
      {
        name: "List Deals",
        method: "GET",
        path: "/deals",
        description: "Retrieve deals with optional filtering",
        params: [
          { name: "stage", type: "string", description: "Filter by deal stage" },
          { name: "limit", type: "number", description: "Results per page (1–100, default 50)" },
          { name: "offset", type: "number", description: "Pagination offset" },
        ],
        responseStatus: 200,
        responseExample: { data: [{ id: "uuid", title: "Enterprise Deal", value: 50000, stage: "negotiation", probability: 75 }], count: 1 },
      },
      {
        name: "Create Deal",
        method: "POST",
        path: "/deals",
        description: "Create a new deal",
        bodyExample: { title: "Enterprise Deal", company_name: "Acme Inc", value: 50000, stage: "discovery", probability: 30 },
        responseStatus: 201,
        responseExample: { data: { id: "uuid", title: "Enterprise Deal", stage: "discovery" } },
      },
      {
        name: "Update Deal",
        method: "PATCH",
        path: "/deals/:id",
        description: "Update a deal (e.g. change stage, value)",
        bodyExample: { stage: "negotiation", probability: 75 },
        responseStatus: 200,
        responseExample: { data: { id: "uuid", stage: "negotiation", probability: 75 } },
      },
      {
        name: "Delete Deal",
        method: "DELETE",
        path: "/deals/:id",
        description: "Delete a deal",
        responseStatus: 200,
        responseExample: { deleted: true },
      },
    ],
  },
  {
    title: "Activities",
    endpoints: [
      {
        name: "List Activities",
        method: "GET",
        path: "/activities",
        description: "Retrieve activities with optional filtering",
        params: [
          { name: "type", type: "string", description: "Filter by type (task, call, email, note)" },
          { name: "limit", type: "number", description: "Results per page (1–100, default 50)" },
        ],
        responseStatus: 200,
        responseExample: { data: [{ id: "uuid", subject: "Follow up call", type: "call", completed: false }], count: 1 },
      },
      {
        name: "Create Activity",
        method: "POST",
        path: "/activities",
        description: "Create an activity (task, call, email, note)",
        bodyExample: { subject: "Follow up call", type: "call", due_date: "2026-03-01T10:00:00Z", lead_id: "uuid" },
        responseStatus: 201,
        responseExample: { data: { id: "uuid", subject: "Follow up call", type: "call" } },
      },
      {
        name: "Update Activity",
        method: "PATCH",
        path: "/activities/:id",
        description: "Update an activity (mark complete, reschedule)",
        bodyExample: { completed: true },
        responseStatus: 200,
        responseExample: { data: { id: "uuid", completed: true } },
      },
      {
        name: "Delete Activity",
        method: "DELETE",
        path: "/activities/:id",
        description: "Delete an activity",
        responseStatus: 200,
        responseExample: { deleted: true },
      },
    ],
  },
  {
    title: "Contacts",
    endpoints: [
      {
        name: "List Contacts",
        method: "GET",
        path: "/contacts",
        description: "Retrieve contacts with optional filtering",
        params: [
          { name: "status", type: "string", description: "Filter by lead_status" },
          { name: "limit", type: "number", description: "Results per page (1–100, default 50)" },
        ],
        responseStatus: 200,
        responseExample: { data: [{ id: "uuid", first_name: "Jane", last_name: "Doe", email: "jane@acme.com" }], count: 1 },
      },
      {
        name: "Create Contact",
        method: "POST",
        path: "/contacts",
        description: "Create a new contact",
        bodyExample: { first_name: "Jane", last_name: "Doe", email: "jane@acme.com", job_title: "VP Sales" },
        responseStatus: 201,
        responseExample: { data: { id: "uuid", first_name: "Jane", last_name: "Doe" } },
      },
      {
        name: "Update Contact",
        method: "PATCH",
        path: "/contacts/:id",
        description: "Update a contact",
        bodyExample: { job_title: "SVP Sales" },
        responseStatus: 200,
        responseExample: { data: { id: "uuid", job_title: "SVP Sales" } },
      },
      {
        name: "Delete Contact",
        method: "DELETE",
        path: "/contacts/:id",
        description: "Delete a contact",
        responseStatus: 200,
        responseExample: { deleted: true },
      },
    ],
  },
  {
    title: "Workflows",
    endpoints: [
      {
        name: "List Workflows",
        method: "GET",
        path: "/workflows",
        description: "Retrieve all workflows",
        responseStatus: 200,
        responseExample: { data: [{ id: "uuid", name: "New Lead Notifier", trigger: "new_lead", active: true }], count: 1 },
      },
      {
        name: "Toggle Workflow",
        method: "PATCH",
        path: "/workflows/:id",
        description: "Enable or disable a workflow",
        bodyExample: { active: false },
        responseStatus: 200,
        responseExample: { data: { id: "uuid", active: false } },
      },
      {
        name: "Execute Workflow",
        method: "POST",
        path: "/workflows/:id/execute",
        description: "Trigger a workflow execution with optional test data",
        bodyExample: { data: { lead_id: "uuid" } },
        responseStatus: 200,
        responseExample: { success: true, executed_actions: 3 },
      },
    ],
  },
  {
    title: "Outreach",
    endpoints: [
      {
        name: "Generate Email",
        method: "POST",
        path: "/email/generate",
        description: "Generate an AI email draft for a lead",
        bodyExample: { leadId: "uuid", tone: "professional", trigger_context: "New funding round" },
        responseStatus: 200,
        responseExample: { subject: "Congrats on the funding!", body: "Hi Jane, I saw that Acme just raised..." },
      },
    ],
  },
];

const methodColors: Record<string, string> = {
  GET: "default",
  POST: "secondary",
  PATCH: "outline",
  DELETE: "destructive",
};

const generateSnippet = (endpoint: Endpoint, lang: string) => {
  const url = `${BASE_URL_TEMPLATE}${endpoint.path}`;
  const hasBody = endpoint.bodyExample && ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
  const bodyStr = hasBody ? JSON.stringify(endpoint.bodyExample, null, 2) : '';

  switch (lang) {
    case 'javascript':
      return hasBody
        ? `const response = await fetch('${url}', {
  method: '${endpoint.method}',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${bodyStr}),
});

const data = await response.json();
console.log(data);`
        : `const response = await fetch('${url}', {
  headers: { 'X-API-Key': 'your-api-key' },
});

const data = await response.json();
console.log(data);`;

    case 'python':
      return hasBody
        ? `import requests

response = requests.${endpoint.method.toLowerCase()}(
    '${url}',
    headers={'X-API-Key': 'your-api-key'},
    json=${bodyStr}
)
print(response.json())`
        : `import requests

response = requests.get(
    '${url}',
    headers={'X-API-Key': 'your-api-key'}
)
print(response.json())`;

    case 'curl':
      return hasBody
        ? `curl -X ${endpoint.method} '${url}' \\
  -H 'X-API-Key: your-api-key' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(endpoint.bodyExample)}'`
        : `curl '${url}' \\
  -H 'X-API-Key: your-api-key'`;

    case 'php':
      return hasBody
        ? `<?php
$ch = curl_init('${url}');
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => '${endpoint.method}',
    CURLOPT_POSTFIELDS => json_encode(${bodyStr}),
    CURLOPT_HTTPHEADER => [
        'X-API-Key: your-api-key',
        'Content-Type: application/json',
    ],
    CURLOPT_RETURNTRANSFER => true,
]);
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));`
        : `<?php
$ch = curl_init('${url}');
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER => ['X-API-Key: your-api-key'],
    CURLOPT_RETURNTRANSFER => true,
]);
$response = curl_exec($ch);
curl_close($ch);
print_r(json_decode($response, true));`;
    default:
      return '';
  }
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

const ApiDocs = () => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const navigate = useNavigate();

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleDownloadDocs = () => {
    const lines: string[] = [];
    lines.push("SALESOS API DOCUMENTATION");
    lines.push("=".repeat(50));
    lines.push(`Base URL: ${BASE_URL_TEMPLATE}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    lines.push("AUTHENTICATION");
    lines.push("-".repeat(30));
    lines.push("Include your API key in the X-API-Key header:");
    lines.push("  X-API-Key: sk_your_api_key_here");
    lines.push("");

    endpointGroups.forEach((group) => {
      lines.push("");
      lines.push("=".repeat(50));
      lines.push(group.title.toUpperCase());
      lines.push("=".repeat(50));
      group.endpoints.forEach((ep) => {
        lines.push("");
        lines.push(`${ep.method} ${ep.path}`);
        lines.push(`  ${ep.name} — ${ep.description}`);
        if (ep.params?.length) {
          lines.push("  Query Parameters:");
          ep.params.forEach((p) => lines.push(`    ${p.name} (${p.type}): ${p.description}`));
        }
        if (ep.bodyExample) {
          lines.push("  Request Body:");
          JSON.stringify(ep.bodyExample, null, 2).split("\n").forEach((l) => lines.push(`    ${l}`));
        }
        lines.push(`  Response (${ep.responseStatus}):`);
        JSON.stringify(ep.responseExample, null, 2).split("\n").forEach((l) => lines.push(`    ${l}`));
      });
    });

    lines.push("");
    lines.push("=".repeat(50));
    lines.push("WEBHOOK VERIFICATION");
    lines.push("=".repeat(50));
    lines.push("Verify webhook signatures using HMAC-SHA256.");
    lines.push("Header: X-Webhook-Signature");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "salesos-api-docs.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SEOHead
        title="API Documentation – SalesOS Developer Portal"
        description="Complete SalesOS REST API reference with code examples in JavaScript, Python, PHP & cURL. Manage leads, deals, contacts, workflows & outreach programmatically."
        keywords="SalesOS API, sales API, lead generation API, CRM API, REST API documentation, webhook integration"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "API Documentation", url: "https://salesos.alephwavex.io/api-docs" },
      ]} />
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 pt-24 pb-12 max-w-6xl">
          <div className="space-y-6">
            {/* Header */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold">API Documentation</h1>
                <p className="text-muted-foreground">Full REST API reference for third-party integrations</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" onClick={handleDownloadDocs} className="gap-2 w-fit">
                  <Download className="w-4 h-4" />
                  Download Docs
                </Button>
                <Button variant="outline" asChild className="w-fit">
                  <a href="/api-status" className="gap-2">
                    <ExternalLink className="w-4 h-4" />
                    API Status
                  </a>
                </Button>
              </div>
            </div>

            {/* Getting Started */}
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>Authentication, base URL, and rate limits</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Base URL</h3>
                  <code className="bg-muted px-3 py-1 rounded text-sm block break-all">
                    {BASE_URL_TEMPLATE}
                  </code>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Include your API key in the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header. Generate API keys from the <strong>Settings → API Keys</strong> page (Elite plan).
                  </p>
                  <code className="bg-muted px-3 py-1 rounded text-sm block">X-API-Key: sk_your_api_key_here</code>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Rate Limits</h3>
                  <p className="text-sm text-muted-foreground">
                    Rate limits are configured per API key. Check response headers:
                  </p>
                  <ul className="text-sm space-y-1 mt-2">
                    <li><code className="text-xs bg-muted px-2 py-0.5 rounded">X-RateLimit-Remaining</code> — Requests remaining in window</li>
                    <li><code className="text-xs bg-muted px-2 py-0.5 rounded">X-RateLimit-Reset</code> — ISO timestamp when the limit resets</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Data Scoping</h3>
                  <p className="text-sm text-muted-foreground">
                    All requests are scoped to the API key owner's account. You can only access your own data — no cross-user access is possible.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Endpoint Groups */}
            {endpointGroups.map((group) => (
              <div key={group.title} className="space-y-4">
                <h2 className="text-2xl font-bold pt-4 border-b pb-2">{group.title}</h2>
                {group.endpoints.map((ep) => (
                  <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} copiedCode={copiedCode} onCopy={copyToClipboard} />
                ))}
              </div>
            ))}

            {/* Webhook Verification */}
            <Card>
              <CardHeader>
                <CardTitle>Webhook Signature Verification</CardTitle>
                <CardDescription>Securely verify incoming webhook deliveries from SalesOS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Every webhook delivery includes an <code className="bg-muted px-2 py-0.5 rounded text-xs">X-Webhook-Signature</code> header.
                  Verify it using HMAC-SHA256 with your webhook secret.
                </p>
                <Tabs defaultValue="javascript">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="php">PHP</TabsTrigger>
                  </TabsList>
                  {Object.entries(webhookVerificationCode).map(([lang, code]) => (
                    <TabsContent key={lang} value={lang}>
                      <div className="relative">
                        <Button variant="ghost" size="sm" className="absolute top-2 right-2 z-10" onClick={() => copyToClipboard(code, `webhook-${lang}`)}>
                          {copiedCode === `webhook-${lang}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">{code}</pre>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>

            {/* Third-Party Integration */}
            <Card>
              <CardHeader>
                <CardTitle>Third-Party Integration Quick Start</CardTitle>
                <CardDescription>Connect SalesOS with popular automation tools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">Zapier / Make / n8n</h3>
                  <p className="text-sm text-muted-foreground">
                    Use a generic HTTP / Webhook module. Set the base URL above, add your <code className="bg-muted px-1.5 py-0.5 rounded text-xs">X-API-Key</code> header, and call any endpoint listed in this documentation.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Python / Node.js Scripts</h3>
                  <p className="text-sm text-muted-foreground">
                    Use the code examples above directly. The bulk import endpoint (<code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /leads/bulk</code>) is optimized for importing leads from AI tools, CSV processors, and enrichment pipelines.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-1">External Lead Tools</h3>
                  <p className="text-sm text-muted-foreground">
                    Export leads from external tools as JSON, then push them into SalesOS using the bulk import endpoint. Trigger enrichment and scoring via the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /leads/:id/enrich</code> and <code className="bg-muted px-1.5 py-0.5 rounded text-xs">POST /leads/:id/score</code> endpoints.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Help */}
            <Card>
              <CardHeader>
                <CardTitle>Need Help?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Visit our <Button variant="link" className="p-0 h-auto" asChild><a href="/help">Help Center</a></Button> for guides and troubleshooting
                </p>
                <p className="text-sm text-muted-foreground">
                  Check our <Button variant="link" className="p-0 h-auto" asChild><a href="/api-status">API Status Page</a></Button> for real-time system status
                </p>
                <p className="text-sm text-muted-foreground">
                  Contact support at <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">support@bdotindustries.com</a>
                </p>
              </CardContent>
            </Card>

            {/* Related */}
            <Card>
              <CardHeader>
                <CardTitle>Related Resources</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid sm:grid-cols-2 gap-3">
                  <li><a href="/security" className="text-primary hover:underline">Security Practices</a><span className="text-sm text-muted-foreground"> – Enterprise-grade data protection</span></li>
                  <li><a href="/pricing" className="text-primary hover:underline">Pricing Plans</a><span className="text-sm text-muted-foreground"> – Find the right plan for your team</span></li>
                  <li><a href="/privacy" className="text-primary hover:underline">Privacy Policy</a><span className="text-sm text-muted-foreground"> – How we handle your data</span></li>
                  <li><a href="/terms" className="text-primary hover:underline">Terms of Service</a><span className="text-sm text-muted-foreground"> – User agreement and policies</span></li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
};

// ── Endpoint card component ─────────────────────────────────────────
function EndpointCard({ endpoint, copiedCode, onCopy }: { endpoint: Endpoint; copiedCode: string | null; onCopy: (code: string, id: string) => void }) {
  const cardId = `${endpoint.method}-${endpoint.path}`;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3 mb-1">
          <Badge variant={methodColors[endpoint.method] as any || "default"}>{endpoint.method}</Badge>
          <code className="text-sm">{endpoint.path}</code>
        </div>
        <CardTitle className="text-lg">{endpoint.name}</CardTitle>
        <CardDescription>{endpoint.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {endpoint.params && (
          <div>
            <h4 className="font-semibold mb-2 text-sm">Query Parameters</h4>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted"><tr><th className="text-left p-2.5">Name</th><th className="text-left p-2.5">Type</th><th className="text-left p-2.5">Description</th></tr></thead>
                <tbody>
                  {endpoint.params.map((p) => (
                    <tr key={p.name} className="border-t">
                      <td className="p-2.5 font-mono text-xs">{p.name}</td>
                      <td className="p-2.5"><Badge variant="outline" className="text-xs">{p.type}</Badge></td>
                      <td className="p-2.5 text-muted-foreground">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {endpoint.bodyExample && (
          <div>
            <h4 className="font-semibold mb-2 text-sm">Request Body</h4>
            <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto">{JSON.stringify(endpoint.bodyExample, null, 2)}</pre>
          </div>
        )}

        <div>
          <h4 className="font-semibold mb-2 text-sm">Response <Badge variant="default" className="ml-2">Status: {endpoint.responseStatus}</Badge></h4>
          <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto">{JSON.stringify(endpoint.responseExample, null, 2)}</pre>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-sm">Code Examples</h4>
          <Tabs defaultValue="javascript">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="php">PHP</TabsTrigger>
            </TabsList>
            {["javascript", "python", "curl", "php"].map((lang) => {
              const snippet = generateSnippet(endpoint, lang);
              return (
                <TabsContent key={lang} value={lang} className="relative">
                  <Button variant="ghost" size="sm" className="absolute top-2 right-2 z-10" onClick={() => onCopy(snippet, `${cardId}-${lang}`)}>
                    {copiedCode === `${cardId}-${lang}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">{snippet}</pre>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApiDocs;
