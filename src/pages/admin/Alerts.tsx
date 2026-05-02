import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, RefreshCw, Bell } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface SystemAlert {
  id: string;
  category: string;
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  details: Record<string, unknown> | null;
  user_id: string | null;
  related_entity: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  error: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_LABEL: Record<string, string> = {
  stripe_webhook_failure: "Stripe webhook",
  stripe_plan_mismatch: "Plan mismatch",
  outreach_send_limit: "Send limit",
  outreach_send_error: "Send error",
};

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("unresolved");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("system_alerts" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterCategory !== "all") q = q.eq("category", filterCategory);
    if (filterStatus === "unresolved") q = q.eq("resolved", false);
    if (filterStatus === "resolved") q = q.eq("resolved", true);

    const { data, error } = await q;
    if (error) {
      toast.error("Failed to load alerts");
      console.error(error);
    } else {
      setAlerts((data as unknown as SystemAlert[]) ?? []);
    }
    setLoading(false);
  }, [filterCategory, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const byCat = (cat: string) =>
      alerts.filter((a) => a.category === cat && !a.resolved).length;
    return {
      webhook: byCat("stripe_webhook_failure"),
      mismatch: byCat("stripe_plan_mismatch"),
      sendLimit: byCat("outreach_send_limit"),
      total: alerts.filter((a) => !a.resolved).length,
    };
  }, [alerts]);

  const resolve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("system_alerts" as any)
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq("id", id);
    if (error) {
      toast.error("Failed to resolve");
    } else {
      toast.success("Alert resolved");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            System Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stripe webhook failures, plan mapping mismatches, and outreach send-limit issues.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open alerts" value={stats.total} tone="default" />
        <StatCard label="Webhook failures" value={stats.webhook} tone="critical" />
        <StatCard label="Plan mismatches" value={stats.mismatch} tone="warning" />
        <StatCard label="Send-limit hits" value={stats.sendLimit} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="stripe_webhook_failure">Stripe webhook failures</SelectItem>
            <SelectItem value="stripe_plan_mismatch">Plan mismatches</SelectItem>
            <SelectItem value="outreach_send_limit">Send-limit hits</SelectItem>
            <SelectItem value="outreach_send_error">Send errors</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alert list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : alerts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              No alerts in this view.
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="border border-border/40 rounded-lg p-4 bg-card/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline" className={SEVERITY_BADGE[a.severity]}>
                          {a.severity}
                        </Badge>
                        <Badge variant="outline">
                          {CATEGORY_LABEL[a.category] ?? a.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                        </span>
                        {a.resolved && (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                            resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium mb-1 break-words">{a.message}</p>
                      {a.details && Object.keys(a.details).length > 0 && (
                        <pre className="text-xs text-muted-foreground bg-muted/40 rounded p-2 mt-2 overflow-x-auto">
                          {JSON.stringify(a.details, null, 2)}
                        </pre>
                      )}
                    </div>
                    {!a.resolved && (
                      <Button size="sm" variant="outline" onClick={() => resolve(a.id)}>
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "warning" | "critical";
}) {
  const color =
    tone === "critical"
      ? "text-red-400"
      : tone === "warning"
      ? "text-yellow-400"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          {value > 0 && tone !== "default" && (
            <AlertTriangle className={`h-4 w-4 ${color}`} />
          )}
        </div>
        <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
