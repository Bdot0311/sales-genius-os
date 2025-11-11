import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Play, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const exampleQueries = [
  {
    name: "Get All Leads",
    query: `leads {
  id
  contact_name
  company_name
  contact_email
  icp_score
}`,
  },
  {
    name: "Filter Leads by Industry",
    query: `leads(filter: {industry: "Technology"}, limit: 10) {
  id
  contact_name
  company_name
  industry
  icp_score
}`,
  },
  {
    name: "Get Deals by Stage",
    query: `deals(filter: {stage: "negotiation"}) {
  id
  title
  company_name
  value
  stage
  probability
}`,
  },
  {
    name: "Get Activities",
    query: `activities(filter: {completed: false}, limit: 20) {
  id
  subject
  type
  due_date
  completed
}`,
  },
];

export const GraphQLPlayground = () => {
  const [query, setQuery] = useState(exampleQueries[0].query);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleExecuteQuery = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Not authenticated');
      }

      // Get user's API key
      const { data: apiKeys } = await supabase
        .from('api_keys')
        .select('key')
        .eq('is_active', true)
        .limit(1);

      if (!apiKeys || apiKeys.length === 0) {
        throw new Error('No active API key found. Please create one in the API Keys tab.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/graphql-api`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKeys[0].key,
          },
          body: JSON.stringify({ query }),
        }
      );

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));

      if (!response.ok) {
        throw new Error(data.error || 'Query failed');
      }

      toast({
        title: "Query executed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Query failed",
        description: error.message,
        variant: "destructive",
      });
      setResult(JSON.stringify({ error: error.message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>GraphQL Playground</CardTitle>
          <CardDescription>
            Test GraphQL queries against your SalesOS data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Example Queries</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((example) => (
                  <Badge
                    key={example.name}
                    variant="outline"
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => setQuery(example.query)}
                  >
                    {example.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Query</label>
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="font-mono text-sm mt-2"
                rows={10}
                placeholder="Enter your GraphQL query..."
              />
            </div>

            <Button onClick={handleExecuteQuery} disabled={loading} className="w-full">
              <Play className={`w-4 h-4 mr-2 ${loading ? 'animate-pulse' : ''}`} />
              Execute Query
            </Button>

            {result && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Result</label>
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
                  {result}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GraphQL Schema</CardTitle>
          <CardDescription>Available queries and fields</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 font-mono text-sm">
            <div>
              <h4 className="font-semibold mb-2">leads(filter: LeadFilter, limit: Int, offset: Int)</h4>
              <pre className="bg-muted p-3 rounded text-xs">
{`Fields:
  id, contact_name, company_name, contact_email,
  contact_phone, industry, company_size, source,
  icp_score, notes, created_at, updated_at`}
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">deals(filter: DealFilter, limit: Int, offset: Int)</h4>
              <pre className="bg-muted p-3 rounded text-xs">
{`Fields:
  id, title, company_name, contact_name, value,
  stage, probability, expected_close_date, notes,
  created_at, updated_at`}
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">activities(filter: ActivityFilter, limit: Int)</h4>
              <pre className="bg-muted p-3 rounded text-xs">
{`Fields:
  id, subject, type, description, due_date,
  completed, lead_id, deal_id, created_at`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
