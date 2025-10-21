import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const ApiDocs = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      
      <main className="container mx-auto px-6 pt-24 pb-16">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">API Documentation</h1>
            <p className="text-xl text-muted-foreground">
              Integrate SalesOS into your existing workflows with our comprehensive API
            </p>
          </div>

          <div className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Base URL: <code className="bg-muted px-2 py-1 rounded">https://api.salesos.com/v1</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    All API requests require authentication using an API key in the Authorization header:
                  </p>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code>Authorization: Bearer YOUR_API_KEY</code>
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="leads" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="leads">Leads</TabsTrigger>
              <TabsTrigger value="deals">Deals</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="leads" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Get All Leads</CardTitle>
                    <Badge variant="outline">GET</Badge>
                  </div>
                  <CardDescription>/leads</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                      <code>{`GET /leads?page=1&limit=50`}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Response</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "data": [
    {
      "id": "lead_123",
      "name": "John Doe",
      "email": "john@example.com",
      "company": "Acme Corp",
      "score": 85,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Create Lead</CardTitle>
                    <Badge>POST</Badge>
                  </div>
                  <CardDescription>/leads</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request Body</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "company": "Tech Solutions",
  "phone": "+1234567890",
  "source": "website"
}`}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Response</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "id": "lead_456",
  "name": "Jane Smith",
  "email": "jane@company.com",
  "score": 0,
  "created_at": "2025-01-21T14:20:00Z"
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="deals" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Get All Deals</CardTitle>
                    <Badge variant="outline">GET</Badge>
                  </div>
                  <CardDescription>/deals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                      <code>{`GET /deals?status=active`}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Response</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "data": [
    {
      "id": "deal_789",
      "title": "Enterprise Contract",
      "value": 50000,
      "stage": "negotiation",
      "probability": 75,
      "close_date": "2025-02-28"
    }
  ]
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Update Deal Stage</CardTitle>
                    <Badge className="bg-orange-500">PATCH</Badge>
                  </div>
                  <CardDescription>/deals/:id</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request Body</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "stage": "closed_won",
  "value": 52000
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="outreach" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Generate AI Email</CardTitle>
                    <Badge>POST</Badge>
                  </div>
                  <CardDescription>/outreach/generate</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request Body</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "lead_id": "lead_123",
  "tone": "professional",
  "goal": "book_meeting"
}`}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Response</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "subject": "Quick chat about scaling your sales?",
  "body": "Hi John,\\n\\nI noticed your recent...",
  "generated_at": "2025-01-21T15:00:00Z"
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Get Sales Metrics</CardTitle>
                    <Badge variant="outline">GET</Badge>
                  </div>
                  <CardDescription>/analytics/metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Request</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                      <code>{`GET /analytics/metrics?period=30d`}</code>
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Response</h4>
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{`{
  "total_revenue": 250000,
  "deals_closed": 15,
  "win_rate": 0.68,
  "avg_deal_size": 16666,
  "period": "30d"
}`}</code>
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Rate Limits</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Standard: 100 requests per minute</li>
                <li>• Pro: 500 requests per minute</li>
                <li>• Enterprise: Custom limits available</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Support</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Need help? Contact our API support team at{" "}
                <a href="mailto:api@salesos.com" className="text-primary hover:underline">
                  api@salesos.com
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ApiDocs;
