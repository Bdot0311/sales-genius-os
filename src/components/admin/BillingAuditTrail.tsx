import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollText, RefreshCw, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface AuditRow {
  id: string;
  source: "admin_action" | "stripe_webhook";
  event_at: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_user_id: string | null;
  target_email: string | null;
  status: string | null;
  details: Record<string, any> | null;
}

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  billing_pause_account: "Paused access",
  billing_restore_account: "Restored access",
  billing_remove_account: "Removed account",
  billing_auto_pause: "Auto-paused (unpaid)",
  lock_account: "Paused access (legacy)",
  unlock_account: "Restored access (legacy)",
  update_subscription: "Changed plan",
  set_trial: "Changed trial",
  set_admin: "Changed admin role",
};

const STATUS_BADGE: Record<string, string> = {
  processed: "bg-green-500/10 text-green-400 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  failed: "bg-red-500/10 text-red-400 border-red-500/20",
  dlq: "bg-red-500/10 text-red-400 border-red-500/20",
  recorded: "bg-primary/10 text-primary border-primary/20",
};

export function BillingAuditTrail() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_billing_audit" as any, {
      _source: source,
      _search: query,
      _limit: PAGE_SIZE,
      _offset: page * PAGE_SIZE,
    });
    if (error) {
      console.error(error);
      toast.error("Failed to load billing audit trail");
    } else {
      setRows((data as unknown as AuditRow[]) ?? []);
    }
    setLoading(false);
  }, [source, query, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-primary" />
              Billing audit trail
            </CardTitle>
            <CardDescription>
              Every Stripe webhook event and every admin action (pause, restore, remove, plan
              change) with timestamps and actor details.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Select
            value={source}
            onValueChange={(v) => {
              setPage(0);
              setSource(v);
            }}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="admin_action">Admin actions</SelectItem>
              <SelectItem value="stripe_webhook">Stripe webhooks</SelectItem>
            </SelectContent>
          </Select>
          <form
            className="flex flex-1 min-w-[220px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(search.trim());
            }}
          >
            <Input
              placeholder="Search email, event type or Stripe event id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>

        {!loading && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No audit records match this filter yet.
          </p>
        )}

        <div className="divide-y divide-border rounded-md border border-border">
          {rows.map((row) => {
            const isOpen = expanded === row.id;
            return (
              <div key={row.id} className="p-3">
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {row.source === "admin_action" ? "Admin" : "Stripe"}
                      </Badge>
                      <span className="text-sm font-medium break-words">
                        {ACTION_LABEL[row.action] ?? row.action}
                      </span>
                      {row.status && (
                        <Badge variant="outline" className={STATUS_BADGE[row.status] ?? ""}>
                          {row.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground break-words">
                      {new Date(row.event_at).toLocaleString()}
                      {" · actor: "}
                      {row.actor_email ?? (row.actor_id ? row.actor_id : "system")}
                      {row.target_email ? ` · customer: ${row.target_email}` : ""}
                    </p>
                    {row.details?.reason && (
                      <p className="text-xs text-orange-400 break-words">
                        Reason: {String(row.details.reason)}
                      </p>
                    )}
                  </div>
                  {row.details?.invoice_url && (
                    <a
                      href={String(row.details.invoice_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-xs text-primary inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Invoice <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </button>
                {isOpen && (
                  <pre className="mt-3 max-h-72 overflow-auto rounded bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(row.details ?? {}, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page + 1}
            {rows.length ? ` · ${rows.length} records` : ""}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rows.length < PAGE_SIZE || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
