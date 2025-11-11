import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Play, Loader2, CheckCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WebhookTestDialogProps {
  webhook: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WebhookTestDialog = ({ webhook, open, onOpenChange }: WebhookTestDialogProps) => {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testPayload, setTestPayload] = useState(JSON.stringify({
    event: "test_event",
    data: {
      message: "This is a test webhook payload",
      timestamp: new Date().toISOString(),
    },
  }, null, 2));

  const samplePayloads = {
    new_lead: {
      event: "new_lead",
      data: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        contact_name: "John Doe",
        company_name: "Acme Corp",
        contact_email: "john@acme.com",
        icp_score: 85,
        created_at: new Date().toISOString(),
      },
    },
    deal_closed: {
      event: "deal_closed",
      data: {
        id: "660e8400-e29b-41d4-a716-446655440001",
        title: "Enterprise Deal",
        company_name: "Acme Corp",
        value: 50000,
        stage: "closed_won",
        closed_at: new Date().toISOString(),
      },
    },
    deal_stage_change: {
      event: "deal_stage_change",
      data: {
        id: "770e8400-e29b-41d4-a716-446655440002",
        title: "SMB Deal",
        old_stage: "negotiation",
        new_stage: "closed_won",
        value: 25000,
        changed_at: new Date().toISOString(),
      },
    },
  };

  const handleLoadSample = (sampleType: string) => {
    const sample = samplePayloads[sampleType as keyof typeof samplePayloads];
    if (sample) {
      setTestPayload(JSON.stringify(sample, null, 2));
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const payload = JSON.parse(testPayload);

      const { data, error } = await supabase.functions.invoke("test-webhook", {
        body: {
          url: webhook.url,
          payload,
          secret: webhook.secret,
        },
      });

      if (error) throw error;

      setTestResult(data);
      
      if (data.success) {
        toast.success("Webhook test successful!");
      } else {
        toast.error(`Webhook test failed: ${data.status}`);
      }
    } catch (error: any) {
      console.error("Error testing webhook:", error);
      toast.error(error.message || "Failed to test webhook");
      setTestResult({ success: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Test Webhook: {webhook?.name}
          </DialogTitle>
          <DialogDescription>
            Send a test payload to your webhook endpoint to verify it's working correctly
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Webhook URL Display */}
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <Input value={webhook?.url} readOnly className="font-mono text-sm" />
          </div>

          {/* Sample Payload Selector */}
          <div className="space-y-2">
            <Label>Load Sample Payload</Label>
            <Select onValueChange={handleLoadSample}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a sample payload..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new_lead">New Lead</SelectItem>
                <SelectItem value="deal_closed">Deal Closed</SelectItem>
                <SelectItem value="deal_stage_change">Deal Stage Change</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Test Payload */}
          <div className="space-y-2">
            <Label>Test Payload (JSON)</Label>
            <Textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              className="font-mono text-sm min-h-[200px]"
              placeholder='{"event": "test", "data": {...}}'
            />
          </div>

          {/* Test Result */}
          {testResult && (
            <div className="space-y-2">
              <Label>Test Result</Label>
              <div className={`p-4 rounded-lg border ${testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className="font-semibold">
                    {testResult.success ? 'Success' : 'Failed'}
                  </span>
                  <Badge variant={testResult.success ? "default" : "destructive"}>
                    HTTP {testResult.status}
                  </Badge>
                  <Badge variant="outline">{testResult.responseTime}ms</Badge>
                </div>
                
                {testResult.responseBody && (
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-1">Response Body:</p>
                    <pre className="text-xs bg-white p-2 rounded border overflow-x-auto">
                      {testResult.responseBody}
                    </pre>
                  </div>
                )}

                {testResult.error && (
                  <div className="mt-3">
                    <p className="text-sm font-medium mb-1 text-red-600">Error:</p>
                    <p className="text-sm text-red-700">{testResult.error}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleTest} disabled={testing}>
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Send Test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
