import { PUBLIC_API_BASE } from "@/lib/public-api";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Activity,
  Terminal,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface InboundWebhook {
  id: string;
  name: string;
  events: string[];
  endpoint_token: string | null;
  default_source: string | null;
  is_active: boolean;
  created_at: string;
  last_received_at: string | null;
  total_received: number;
  secret_masked: string;
  fullSecret?: string;
}

interface Receipt {
  id: string;
  webhook_id: string;
  event: string;
  status: string;
  response_status: number | null;
  created_at: string;
}

const INBOUND_ACTIONS = [
  { value: "lead.created", label: "Create leads", hint: "New lead from a form, CRM or Zapier" },
  { value: "lead.updated", label: "Update leads", hint: "Match on email and update fields" },
  { value: "lead.stage_changed", label: "Change pipeline stage", hint: "Move a lead's stage" },
  { value: "contact.created", label: "Create / update contacts", hint: "Upsert by email" },
  { value: "deal.created", label: "Create deals", hint: "Push a deal into your pipeline" },
];

const FUNCTIONS_BASE = `${PUBLIC_API_BASE}/inbound-webhook`;

export const InboundWebhooksPanel = () => {
  const [hooks, setHooks] = useState<InboundWebhook[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    source: "",
    events: ["lead.created"] as string[],
  });

  const load = useCallback(async () => {
    try {
      const [{ data: hookRows, error }, { data: receiptRows }] = await Promise.all([
        supabase
          .from("webhooks_safe")
          .select("*")
          .eq("direction", "inbound")
          .order("created_at", { ascending: false }),
        supabase
          .from("webhook_deliveries")
          .select("id, webhook_id, event, status, response_status, created_at")
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);
      if (error) throw error;
      setHooks((hookRows as unknown as InboundWebhook[]) || []);
      setReceipts((receiptRows as unknown as Receipt[]) || []);
    } catch (err) {
      console.error("Error loading inbound webhooks:", err);
      toast.error("Failed to load incoming webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const endpointUrl = (hook: InboundWebhook) => `${FUNCTIONS_BASE}/${hook.endpoint_token ?? ""}`;

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  };

  const copySecret = async (hook: InboundWebhook) => {
    try {
      let secret = hook.fullSecret;
      if (!secret) {
        const { data, error } = await supabase.rpc("get_webhook_secret", { webhook_id: hook.id });
        if (error) throw error;
        secret = data as string;
      }
      if (secret) copy(secret, "Secret");
    } catch (err) {
      console.error("Error copying secret:", err);
      toast.error("Failed to copy secret");
    }
  };

  const copyCurl = async (hook: InboundWebhook) => {
    try {
      const { data } = await supabase.rpc("get_webhook_secret", { webhook_id: hook.id });
      const secret = hook.fullSecret || (data as string) || "YOUR_SECRET";
      const snippet = `curl -X POST '${endpointUrl(hook)}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-webhook-secret: ${secret}' \\
  -d '{"event":"lead.created","data":{"email":"jane@acme.com","first_name":"Jane","last_name":"Doe","company":"Acme Inc","title":"VP Sales"}}'`;
      copy(snippet, "Example request");
    } catch {
      toast.error("Failed to build example request");
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || form.events.length === 0) {
      toast.error("Give the endpoint a name and pick at least one action");
      return;
    }
    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const secret = crypto.randomUUID().replace(/-/g, "");
      const token = crypto.randomUUID();

      const { data, error } = await supabase
        .from("webhooks")
        .insert({
          user_id: user.id,
          name: form.name.trim(),
          url: "",
          direction: "inbound",
          endpoint_token: token,
          default_source: form.source.trim() || null,
          events: form.events,
          secret,
        })
        .select("id")
        .single();
      if (error) throw error;

      await load();
      setHooks((prev) => prev.map((h) => (h.id === data.id ? { ...h, fullSecret: secret } : h)));
      setShowCreate(false);
      setForm({ name: "", source: "", events: ["lead.created"] });
      toast.success("Endpoint created. The unique URL is ready to receive data.");
    } catch (err) {
      console.error("Error creating inbound webhook:", err);
      toast.error("Failed to create endpoint");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (hook: InboundWebhook) => {
    const { error } = await supabase
      .from("webhooks")
      .update({ is_active: !hook.is_active })
      .eq("id", hook.id);
    if (error) return toast.error("Failed to update endpoint");
    await load();
    toast.success(`Endpoint ${hook.is_active ? "disabled" : "enabled"}`);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    setDeleteId(null);
    if (error) return toast.error("Failed to delete endpoint");
    await load();
    toast.success("Endpoint deleted");
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
      <Panel>
        <PanelHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <PanelTitle className="flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5" />
                Incoming Endpoints
              </PanelTitle>
              <PanelDescription>
                Give external tools a URL that pushes data into OutReign — leads, contacts, stage
                changes and deals.
              </PanelDescription>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Endpoint
            </Button>
          </div>
        </PanelHeader>
        <PanelBody>
          {hooks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ArrowDownToLine className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                No incoming endpoints yet. Create one to let Zapier, Make, your website forms or your
                CRM send data straight into your workspace.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {hooks.map((hook) => (
                <div key={hook.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold">{hook.name}</h4>
                        <Badge variant={hook.is_active ? "default" : "secondary"}>
                          {hook.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                          {endpointUrl(hook)}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copy(endpointUrl(hook), "Endpoint URL")}
                          title="Copy endpoint URL"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {hook.events.map((event) => (
                          <Badge key={event} variant="outline" className="text-xs">
                            {event}
                          </Badge>
                        ))}
                        {hook.default_source && (
                          <Badge variant="outline" className="text-xs">
                            source: {hook.default_source}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Activity className="h-3 w-3" />
                          {hook.total_received} requests received
                        </span>
                        {hook.last_received_at && (
                          <span>Last: {new Date(hook.last_received_at).toLocaleString()}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {hook.fullSecret ? (
                          <>
                            <code className="text-xs bg-primary/20 text-primary px-2 py-1 rounded border border-primary/30 break-all">
                              {hook.fullSecret}
                            </code>
                            <span className="text-xs text-destructive">
                              Copy now — it won't be shown again
                            </span>
                          </>
                        ) : (
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {hook.secret_masked}
                          </code>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => copySecret(hook)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyCurl(hook)} className="gap-1">
                        <Terminal className="h-3 w-3" />
                        Example
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggle(hook)}>
                        {hook.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete endpoint ${hook.name}`} onClick={() => setDeleteId(hook.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>How to send data in</PanelTitle>
          <PanelDescription>
            Send a POST request to the unique endpoint URL. Providers that support custom headers
            can also send <code>x-webhook-secret</code> with the endpoint secret for an additional
            check. Field names are flexible — <code>email</code>, <code>first_name</code>,{" "}
            <code>company</code>, <code>title</code>, <code>phone</code>, <code>linkedin</code>,{" "}
            <code>website</code>, <code>industry</code>, <code>country</code>, <code>stage</code> and{" "}
            <code>notes</code> are all recognised. Leads are matched on email, so repeat sends update
            instead of duplicating. Batch up to 100 records with{" "}
            <code>{`{"event":"lead.created","leads":[...]}`}</code>.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
          <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
{`POST ${FUNCTIONS_BASE}/<endpoint-token>
Content-Type: application/json

Optional: x-webhook-secret: <endpoint-secret>

{
  "event": "lead.created",
  "data": {
    "email": "jane@acme.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "company": "Acme Inc",
    "title": "VP Sales",
    "source": "website-form"
  }
}`}
          </pre>
        </PanelBody>
      </Panel>

      {receipts.length > 0 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Recent incoming requests</PanelTitle>
            <PanelDescription>The last 15 requests received on your endpoints</PanelDescription>
          </PanelHeader>
          <PanelBody className="space-y-2">
            {receipts.map((r) => {
              const hook = hooks.find((h) => h.id === r.webhook_id);
              const ok = r.status === "success";
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {ok ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="truncate">{hook?.name ?? "Endpoint"}</span>
                    <Badge variant="outline" className="text-xs">
                      {r.event}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </PanelBody>
        </Panel>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Incoming Endpoint</DialogTitle>
            <DialogDescription>
              We'll generate a URL and secret you can paste into any external tool.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inbound-name">Endpoint Name</Label>
              <Input
                id="inbound-name"
                placeholder="Website form leads"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inbound-source">Default Lead Source (optional)</Label>
              <Input
                id="inbound-source"
                placeholder="zapier"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Allowed Actions</Label>
              <div className="space-y-3 max-h-56 overflow-y-auto border rounded-lg p-3">
                {INBOUND_ACTIONS.map((action) => (
                  <div key={action.value} className="flex items-start space-x-2">
                    <Checkbox
                      id={`in-${action.value}`}
                      checked={form.events.includes(action.value)}
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          events: checked
                            ? [...form.events, action.value]
                            : form.events.filter((e) => e !== action.value),
                        })
                      }
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor={`in-${action.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {action.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{action.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Endpoint"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              External tools posting to this URL will start receiving errors immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
