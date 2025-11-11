import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Copy, Check, ExternalLink, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const ApiDocs = () => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const endpoints = [
    {
      name: "Get Leads",
      method: "GET",
      path: "/api/leads",
      description: "Retrieve all leads with optional filtering",
      params: [
        { name: "industry", type: "string", description: "Filter by industry" },
        { name: "limit", type: "number", description: "Number of results (default: 50)" },
        { name: "offset", type: "number", description: "Pagination offset" },
      ],
      response: {
        status: 200,
        body: {
          data: [
            {
              id: "uuid",
              contact_name: "John Doe",
              company_name: "Acme Inc",
              contact_email: "john@acme.com",
              industry: "Technology",
              icp_score: 85,
            },
          ],
          count: 1,
        },
      },
    },
    {
      name: "Create Lead",
      method: "POST",
      path: "/api/leads",
      description: "Create a new lead",
      body: {
        contact_name: "John Doe",
        company_name: "Acme Inc",
        contact_email: "john@acme.com",
        industry: "Technology",
      },
      response: {
        status: 201,
        body: {
          id: "uuid",
          contact_name: "John Doe",
          company_name: "Acme Inc",
          created_at: "2025-01-11T10:30:00Z",
        },
      },
    },
    {
      name: "Get Deals",
      method: "GET",
      path: "/api/deals",
      description: "Retrieve deals with filtering options",
      params: [
        { name: "stage", type: "string", description: "Filter by deal stage" },
        { name: "minValue", type: "number", description: "Minimum deal value" },
      ],
      response: {
        status: 200,
        body: {
          data: [
            {
              id: "uuid",
              title: "Enterprise Deal",
              value: 50000,
              stage: "negotiation",
              probability: 75,
            },
          ],
        },
      },
    },
  ];

  const generateCodeSnippet = (endpoint: any, language: string) => {
    const baseUrl = "https://api.salesos.com";
    
    switch (language) {
      case "javascript":
        return endpoint.method === "GET"
          ? `// GET Request
const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'GET',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);`
          : `// POST Request
const response = await fetch('${baseUrl}${endpoint.path}', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${JSON.stringify(endpoint.body, null, 2)}),
});

const data = await response.json();
console.log(data);`;

      case "python":
        return endpoint.method === "GET"
          ? `import requests

# GET Request
headers = {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
}

response = requests.get('${baseUrl}${endpoint.path}', headers=headers)
data = response.json()
print(data)`
          : `import requests

# POST Request
headers = {
    'X-API-Key': 'your-api-key',
    'Content-Type': 'application/json',
}

payload = ${JSON.stringify(endpoint.body, null, 2)}

response = requests.post('${baseUrl}${endpoint.path}', 
                        headers=headers, 
                        json=payload)
data = response.json()
print(data)`;

      case "curl":
        return endpoint.method === "GET"
          ? `curl -X GET '${baseUrl}${endpoint.path}' \\
  -H 'X-API-Key: your-api-key' \\
  -H 'Content-Type: application/json'`
          : `curl -X POST '${baseUrl}${endpoint.path}' \\
  -H 'X-API-Key: your-api-key' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(endpoint.body)}'`;

      case "php":
        return endpoint.method === "GET"
          ? `<?php
// GET Request
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, '${baseUrl}${endpoint.path}');
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-API-Key: your-api-key',
    'Content-Type: application/json',
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
print_r($data);`
          : `<?php
// POST Request
$data = ${JSON.stringify(endpoint.body, null, 2)};

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, '${baseUrl}${endpoint.path}');
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-API-Key: your-api-key',
    'Content-Type: application/json',
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);
print_r($result);`;

      default:
        return "";
    }
  };

  const webhookVerificationCode = {
    javascript: `const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const calculatedSignature = hmac.update(JSON.stringify(payload)).digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(calculatedSignature)
  );
}

// Express.js example
app.post('/webhooks', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook
  console.log('Webhook verified:', req.body);
  res.status(200).send('OK');
});`,
    python: `import hmac
import hashlib
import json

def verify_webhook_signature(payload, signature, secret):
    calculated_signature = hmac.new(
        secret.encode(),
        json.dumps(payload).encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, calculated_signature)

# Flask example
@app.route('/webhooks', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-Webhook-Signature')
    secret = os.environ.get('WEBHOOK_SECRET')
    
    if not verify_webhook_signature(request.json, signature, secret):
        return 'Invalid signature', 401
    
    # Process webhook
    print('Webhook verified:', request.json)
    return 'OK', 200`,
    php: `<?php
function verifyWebhookSignature($payload, $signature, $secret) {
    $calculatedSignature = hash_hmac('sha256', json_encode($payload), $secret);
    return hash_equals($signature, $calculatedSignature);
}

// Usage
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'];
$secret = getenv('WEBHOOK_SECRET');
$payload = json_decode(file_get_contents('php://input'), true);

if (!verifyWebhookSignature($payload, $signature, $secret)) {
    http_response_code(401);
    die('Invalid signature');
}

// Process webhook
error_log('Webhook verified: ' . json_encode($payload));
http_response_code(200);
echo 'OK';`,
    ruby: `require 'openssl'
require 'json'

def verify_webhook_signature(payload, signature, secret)
  calculated_signature = OpenSSL::HMAC.hexdigest(
    'SHA256',
    secret,
    payload.to_json
  )
  
  Rack::Utils.secure_compare(signature, calculated_signature)
end

# Sinatra example
post '/webhooks' do
  signature = request.env['HTTP_X_WEBHOOK_SIGNATURE']
  secret = ENV['WEBHOOK_SECRET']
  payload = JSON.parse(request.body.read)
  
  unless verify_webhook_signature(payload, signature, secret)
    halt 401, 'Invalid signature'
  end
  
  # Process webhook
  puts "Webhook verified: #{payload}"
  status 200
  'OK'
end`,
  };

  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <div className="flex-1 container mx-auto px-4 pt-24 pb-12 max-w-6xl">
        <div className="space-y-6">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => navigate(-1)}
              className="gap-2 hover:bg-primary hover:text-primary-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold">API Documentation</h1>
              <p className="text-muted-foreground">
                Complete reference with interactive examples
              </p>
            </div>
            <Button variant="outline" asChild className="shrink-0 w-fit hover:bg-primary hover:text-primary-foreground">
              <a href="/api-status" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                API Status
              </a>
            </Button>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Authentication and base URL information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Base URL</h3>
              <code className="bg-muted px-3 py-1 rounded text-sm">
                https://api.salesos.com
              </code>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Authentication</h3>
              <p className="text-sm text-muted-foreground mb-2">
                Include your API key in the request header:
              </p>
              <code className="bg-muted px-3 py-1 rounded text-sm block">
                X-API-Key: your-api-key
              </code>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Rate Limits</h3>
              <p className="text-sm text-muted-foreground">
                Rate limits vary by plan. Check response headers for your current usage:
              </p>
              <ul className="text-sm space-y-1 mt-2">
                <li><code className="text-xs bg-muted px-2 py-0.5 rounded">X-RateLimit-Remaining</code> - Requests remaining</li>
                <li><code className="text-xs bg-muted px-2 py-0.5 rounded">X-RateLimit-Reset</code> - Reset timestamp</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {endpoints.map((endpoint) => (
          <Card key={endpoint.path}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Badge variant={endpoint.method === "GET" ? "default" : "secondary"}>
                      {endpoint.method}
                    </Badge>
                    <code className="text-sm">{endpoint.path}</code>
                  </div>
                  <CardTitle className="text-xl">{endpoint.name}</CardTitle>
                  <CardDescription>{endpoint.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {endpoint.params && (
                <div>
                  <h3 className="font-semibold mb-3">Query Parameters</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3">Name</th>
                          <th className="text-left p-3">Type</th>
                          <th className="text-left p-3">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {endpoint.params.map((param) => (
                          <tr key={param.name} className="border-t">
                            <td className="p-3 font-mono text-xs">{param.name}</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs">
                                {param.type}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground">{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {endpoint.body && (
                <div>
                  <h3 className="font-semibold mb-3">Request Body</h3>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                    {JSON.stringify(endpoint.body, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <h3 className="font-semibold mb-3">Response</h3>
                <div className="space-y-2">
                  <Badge variant="default">Status: {endpoint.response.status}</Badge>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                    {JSON.stringify(endpoint.response.body, null, 2)}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Code Examples</h3>
                <Tabs defaultValue="javascript">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                    <TabsTrigger value="python">Python</TabsTrigger>
                    <TabsTrigger value="curl">cURL</TabsTrigger>
                    <TabsTrigger value="php">PHP</TabsTrigger>
                  </TabsList>
                  {["javascript", "python", "curl", "php"].map((lang) => (
                    <TabsContent key={lang} value={lang} className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 z-10"
                        onClick={() =>
                          copyToClipboard(
                            generateCodeSnippet(endpoint, lang),
                            `${endpoint.path}-${lang}`
                          )
                        }
                      >
                        {copiedCode === `${endpoint.path}-${lang}` ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                        {generateCodeSnippet(endpoint, lang)}
                      </pre>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Webhook Signature Verification</CardTitle>
            <CardDescription>
              Securely verify webhook deliveries from SalesOS
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Every webhook delivery includes a signature in the <code className="bg-muted px-2 py-0.5 rounded text-xs">X-Webhook-Signature</code> header.
              Use your webhook secret to verify the signature using HMAC-SHA256.
            </p>

            <Tabs defaultValue="javascript">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="php">PHP</TabsTrigger>
                <TabsTrigger value="ruby">Ruby</TabsTrigger>
              </TabsList>

              {Object.entries(webhookVerificationCode).map(([lang, code]) => (
                <TabsContent key={lang} value={lang}>
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 z-10"
                      onClick={() => copyToClipboard(code, `webhook-${lang}`)}
                    >
                      {copiedCode === `webhook-${lang}` ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                      {code}
                    </pre>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Need Help?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Check our <Button variant="link" className="p-0 h-auto" asChild><a href="/api-status">API Status Page</a></Button> for real-time system status
            </p>
            <p className="text-sm text-muted-foreground">
              Contact support at <a href="mailto:support@alephwave.io" className="text-primary hover:underline">support@alephwave.io</a>
            </p>
          </CardContent>
        </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ApiDocs;
