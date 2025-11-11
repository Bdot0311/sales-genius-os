import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WebhookDelivery {
  id: string;
  event: string;
  status: string;
  response_status: number | null;
  created_at: string;
  webhooks: {
    name: string;
  };
}

export const WebhookReplayTab = () => {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [selectedDeliveries, setSelectedDeliveries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { toast } = useToast();

  useEffect(() => {
    loadDeliveries();
  }, []);

  const loadDeliveries = async () => {
    try {
      const { data, error } = await supabase
        .from('webhook_deliveries' as any)
        .select('*, webhooks(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setDeliveries((data as any) || []);
    } catch (error: any) {
      toast({
        title: "Error loading deliveries",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReplay = async () => {
    if (selectedDeliveries.length === 0) {
      toast({
        title: "No deliveries selected",
        description: "Please select at least one delivery to replay.",
        variant: "destructive",
      });
      return;
    }

    setReplaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('replay-webhook', {
        body: { deliveryIds: selectedDeliveries },
      });

      if (error) throw error;

      toast({
        title: "Replay completed",
        description: `${data.successful} succeeded, ${data.failed} failed`,
      });

      setSelectedDeliveries([]);
      loadDeliveries();
    } catch (error: any) {
      toast({
        title: "Replay failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setReplaying(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedDeliveries(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDeliveries.length === filteredDeliveries.length) {
      setSelectedDeliveries([]);
    } else {
      setSelectedDeliveries(filteredDeliveries.map(d => d.id));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = delivery.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.webhooks?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="text-center py-8">Loading webhook deliveries...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Event Replay</CardTitle>
              <CardDescription>
                Resend past webhook events for testing or recovery
              </CardDescription>
            </div>
            <Button
              onClick={handleReplay}
              disabled={selectedDeliveries.length === 0 || replaying}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${replaying ? 'animate-spin' : ''}`} />
              Replay {selectedDeliveries.length > 0 && `(${selectedDeliveries.length})`}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Input
                placeholder="Search by event or webhook name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredDeliveries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No webhook deliveries found.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Checkbox
                    checked={selectedDeliveries.length === filteredDeliveries.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    Select all ({filteredDeliveries.length})
                  </span>
                </div>

                <div className="space-y-2">
                  {filteredDeliveries.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="flex items-center gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedDeliveries.includes(delivery.id)}
                        onCheckedChange={() => toggleSelection(delivery.id)}
                      />
                      <div className="flex items-center gap-2">
                        {getStatusIcon(delivery.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{delivery.event}</span>
                          <Badge variant="outline">{delivery.webhooks?.name}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(delivery.created_at).toLocaleString()}
                          {delivery.response_status && ` • Status: ${delivery.response_status}`}
                        </div>
                      </div>
                      <Badge variant={delivery.status === 'delivered' ? 'default' : 'destructive'}>
                        {delivery.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
