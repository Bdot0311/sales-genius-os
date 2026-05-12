import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Search, Inbox, ShieldCheck, PlayCircle, Skull,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type WebhookStatus = "pending" | "succeeded" | "failed" | "dead_letter";

interface WebhookEvent {
  id: string;
  event_id: string;
  event_type: string;
  status: WebhookStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  next_retry_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  payload: any;
}

const STATUS_META: Record<
  WebhookStatus,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  pending: { label: "Pending", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  succeeded: { label: "Applied", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  failed: { label: "Failed (retrying)", color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  dead_letter: { label: "Dead-letter", color: "bg-red-500/15 text-red-400 border-red-500/30", icon: Skull },
};

const AdminWebhooks = () => {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | WebhookStatus>("all");
  const [search, setSearch] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [selected, setSelected] = useState<WebhookEvent | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("stripe_webhook_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(`Failed to load webhook events: ${error.message}`);
    } else {
      setEvents((data || []) as WebhookEvent[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-webhook-events")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stripe_webhook_events" },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<WebhookStatus, number> = {
      pending: 0, succeeded: 0, failed: 0, dead_letter: 0,
    };
    for (const e of events) c[e.status] = (c[e.status] || 0) + 1;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.event_type.toLowerCase().includes(q) &&
          !e.event_id.toLowerCase().includes(q) &&
          !(e.last_error || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [events, statusFilter, search]);

  const triggerRetries = async () => {
    setRetrying(true);
    const t = toast.loading("Triggering retry worker…");
    try {
      const { data, error } = await supabase.functions.invoke("retry-stripe-webhooks");
      if (error) throw error;
      toast.success(`Retry worker ran: ${JSON.stringify(data)}`, { id: t });
      load();
    } catch (e: any) {
      toast.error(`Retry failed: ${e.message ?? e}`, { id: t });
    } finally {
      setRetrying(false);
    }
  };

  const requeue = async (id: string) => {
    const { error } = await supabase
      .from("stripe_webhook_events")
      .update({ status: "pending", next_retry_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(`Requeue failed: ${error.message}`);
    } else {
      toast.success("Event requeued for immediate retry");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stripe Webhooks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Lifecycle of every Stripe event: received → verified → applied, or failed with retry/dead-letter.
        </p>
      </div>

      {/* Lifecycle legend */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
            Event Lifecycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap text-sm">
            <Step icon={Inbox} label="Received" hint="Webhook hit our endpoint" tone="muted" />
            <Arrow />
            <Step icon={ShieldCheck} label="Verified" hint="Signature checked & stored" tone="muted" />
            <Arrow />
            <Step icon={PlayCircle} label="Applied" hint="DB updated successfully" tone="success" count={counts.succeeded} />
            <Arrow />
            <Step icon={AlertTriangle} label="Failed" hint="Retrying with backoff" tone="warn" count={counts.failed} />
            <Arrow />
            <Step icon={Skull} label="Dead-letter" hint="Max retries reached" tone="danger" count={counts.dead_letter} />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-44 bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses ({events.length})</SelectItem>
                  <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
                  <SelectItem value="succeeded">Applied ({counts.succeeded})</SelectItem>
                  <SelectItem value="failed">Failed ({counts.failed})</SelectItem>
                  <SelectItem value="dead_letter">Dead-letter ({counts.dead_letter})</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by type, event id, or error…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 w-80 bg-muted/30 border-border/50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} className="border-border/50">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button size="sm" onClick={triggerRetries} disabled={retrying}>
                <RefreshCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
                {retrying ? "Running…" : "Run retry worker"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading webhook events…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No webhook events {statusFilter !== "all" ? `with status "${statusFilter}"` : ""} yet.
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border/40">
                {filtered.map((e) => {
                  const meta = STATUS_META[e.status];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelected(e)}
                      className="w-full text-left p-4 hover:bg-accent/30 transition-colors flex items-start gap-4"
                    >
                      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{e.event_type}</span>
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>
                            {meta.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            attempt {e.attempts}/{e.max_attempts}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                          {e.event_id}
                        </div>
                        {e.last_error && (
                          <div className="text-xs text-red-400 mt-1 truncate">
                            {e.last_error}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                        {e.next_retry_at && e.status === "failed" && (
                          <div className="mt-0.5">
                            next retry {formatDistanceToNow(new Date(e.next_retry_at), { addSuffix: true })}
                          </div>
                        )}
                        {e.processed_at && e.status === "succeeded" && (
                          <div className="mt-0.5 text-emerald-400">
                            applied {formatDistanceToNow(new Date(e.processed_at), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.event_type}
              {selected && (
                <Badge variant="outline" className={`text-xs ${STATUS_META[selected.status].color}`}>
                  {STATUS_META[selected.status].label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <Timeline event={selected} />

              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="Event ID" value={selected.event_id} mono />
                <Field label="Attempts" value={`${selected.attempts} / ${selected.max_attempts}`} />
                <Field label="Created" value={new Date(selected.created_at).toLocaleString()} />
                <Field label="Updated" value={new Date(selected.updated_at).toLocaleString()} />
                {selected.processed_at && (
                  <Field label="Processed" value={new Date(selected.processed_at).toLocaleString()} />
                )}
                {selected.next_retry_at && (
                  <Field label="Next retry" value={new Date(selected.next_retry_at).toLocaleString()} />
                )}
              </div>

              {selected.last_error && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Last error
                  </div>
                  <pre className="bg-red-500/5 border border-red-500/20 rounded p-3 text-xs text-red-300 whitespace-pre-wrap break-all max-h-40 overflow-auto">
                    {selected.last_error}
                  </pre>
                </div>
              )}

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Payload
                </div>
                <pre className="bg-muted/30 border border-border/40 rounded p-3 text-xs whitespace-pre-wrap break-all max-h-72 overflow-auto">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>

              {(selected.status === "failed" || selected.status === "dead_letter") && (
                <Button
                  size="sm"
                  onClick={() => { requeue(selected.id); setSelected(null); }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Requeue for immediate retry
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Step = ({
  icon: Icon, label, hint, tone, count,
}: {
  icon: typeof CheckCircle2; label: string; hint: string;
  tone: "muted" | "success" | "warn" | "danger"; count?: number;
}) => {
  const toneClass = {
    muted: "text-muted-foreground border-border/50",
    success: "text-emerald-400 border-emerald-500/30",
    warn: "text-orange-400 border-orange-500/30",
    danger: "text-red-400 border-red-500/30",
  }[tone];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/20 ${toneClass}`}>
      <Icon className="h-4 w-4" />
      <div>
        <div className="text-xs font-medium leading-tight">{label}</div>
        <div className="text-[10px] opacity-70 leading-tight">{hint}</div>
      </div>
      {typeof count === "number" && (
        <span className="text-xs font-mono ml-1 px-1.5 py-0.5 rounded bg-background/40">
          {count}
        </span>
      )}
    </div>
  );
};

const Arrow = () => (
  <span className="text-muted-foreground/50 text-sm">→</span>
);

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div>
    <div className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</div>
    <div className={mono ? "font-mono break-all" : ""}>{value}</div>
  </div>
);

const Timeline = ({ event }: { event: WebhookEvent }) => {
  const steps: Array<{
    label: string; at: string | null; ok: boolean; pending?: boolean; error?: boolean;
  }> = [
    { label: "Received", at: event.created_at, ok: true },
    { label: "Verified & stored", at: event.created_at, ok: true },
    {
      label: "Processing attempts",
      at: event.updated_at,
      ok: event.attempts > 0 && event.status === "succeeded",
      pending: event.status === "pending" && event.attempts === 0,
      error: event.status === "failed" || event.status === "dead_letter",
    },
    {
      label: event.status === "dead_letter" ? "Dead-lettered" : "Applied",
      at: event.processed_at,
      ok: event.status === "succeeded",
      error: event.status === "dead_letter",
      pending: event.status === "pending" || event.status === "failed",
    },
  ];
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="mt-0.5">
            {s.error ? (
              <XCircle className="h-4 w-4 text-red-400" />
            ) : s.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="text-sm">{s.label}</div>
            <div className="text-xs text-muted-foreground">
              {s.at ? new Date(s.at).toLocaleString() : s.pending ? "Waiting…" : "—"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AdminWebhooks;
