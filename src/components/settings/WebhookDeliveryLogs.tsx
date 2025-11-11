import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { List, Search, Filter, Loader2, RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: string;
  payload: any;
  status: string;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
  completed_at: string | null;
  webhooks: {
    name: string;
    url: string;
  };
}

export const WebhookDeliveryLogs = () => {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [filteredDeliveries, setFilteredDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedWebhookId, setSelectedWebhookId] = useState<string>("all");
  const [webhooks, setWebhooks] = useState<any[]>([]);

  useEffect(() => {
    loadWebhooks();
    loadDeliveries();
  }, []);

  useEffect(() => {
    filterDeliveries();
  }, [deliveries, searchTerm, statusFilter, selectedWebhookId]);

  const loadWebhooks = async () => {
    try {
      const { data, error } = await supabase
        .from("webhooks")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setWebhooks(data || []);
    } catch (error) {
      console.error("Error loading webhooks:", error);
    }
  };

  const loadDeliveries = async () => {
    try {
      const { data: webhooksData } = await supabase
        .from("webhooks")
        .select("id");

      const webhookIds = webhooksData?.map(w => w.id) || [];

      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select(`
          *,
          webhooks!inner(name, url)
        `)
        .in("webhook_id", webhookIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setDeliveries(data || []);
    } catch (error) {
      console.error("Error loading deliveries:", error);
      toast.error("Failed to load webhook deliveries");
    } finally {
      setLoading(false);
    }
  };

  const filterDeliveries = () => {
    let filtered = [...deliveries];

    if (searchTerm) {
      filtered = filtered.filter(d =>
        d.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.webhooks.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(d => d.status === statusFilter);
    }

    if (selectedWebhookId !== "all") {
      filtered = filtered.filter(d => d.webhook_id === selectedWebhookId);
    }

    setFilteredDeliveries(filtered);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      success: "default",
      failed: "destructive",
      pending: "secondary",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <List className="h-5 w-5" />
                Webhook Delivery Logs
              </CardTitle>
              <CardDescription>
                Track and debug webhook deliveries with detailed logs
              </CardDescription>
            </div>
            <Button onClick={loadDeliveries} variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by event or webhook name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={selectedWebhookId} onValueChange={setSelectedWebhookId}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Webhooks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Webhooks</SelectItem>
                {webhooks.map(webhook => (
                  <SelectItem key={webhook.id} value={webhook.id}>
                    {webhook.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results Count */}
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {filteredDeliveries.length} of {deliveries.length} deliveries
          </div>

          {/* Delivery Logs */}
          {filteredDeliveries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <List className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No webhook deliveries found matching your filters.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredDeliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(delivery.status)}
                        <span className="font-medium">{delivery.webhooks.name}</span>
                        {getStatusBadge(delivery.status)}
                        <Badge variant="outline">{delivery.event}</Badge>
                        {delivery.response_status && (
                          <Badge variant="outline">HTTP {delivery.response_status}</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>Attempts: {delivery.attempt_count} / {delivery.max_attempts}</p>
                        <p>Created: {format(new Date(delivery.created_at), 'PPpp')}</p>
                        {delivery.last_attempt_at && (
                          <p>Last attempt: {format(new Date(delivery.last_attempt_at), 'PPpp')}</p>
                        )}
                        {delivery.next_retry_at && (
                          <p>Next retry: {format(new Date(delivery.next_retry_at), 'PPpp')}</p>
                        )}
                      </div>
                      {delivery.response_body && (
                        <details className="mt-2">
                          <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                            View response
                          </summary>
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                            {delivery.response_body}
                          </pre>
                        </details>
                      )}
                      <details className="mt-2">
                        <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">
                          View payload
                        </summary>
                        <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                          {JSON.stringify(delivery.payload, null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
