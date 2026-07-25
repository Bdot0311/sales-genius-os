import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, RefreshCw, RotateCw, MinusCircle, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type LogStatus = "success" | "error" | "retry" | "skipped";

interface SyncLog {
  id: string;
  direction: "outbound" | "inbound";
  action: string;
  status: LogStatus;
  attempt: number;
  http_status: number | null;
  google_event_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_META: Record<LogStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  success: { icon: CheckCircle2, className: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30", label: "Success" },
  error: { icon: XCircle, className: "text-destructive bg-destructive/10 border-destructive/30", label: "Error" },
  retry: { icon: RotateCw, className: "text-amber-500 bg-amber-500/10 border-amber-500/30", label: "Retry" },
  skipped: { icon: MinusCircle, className: "text-muted-foreground bg-muted border-border", label: "Skipped" },
};

export function CalendarSyncLogPanel() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | LogStatus>("all");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("calendar_sync_logs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (!error && data) setLogs(data as unknown as SyncLog[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const errorCount = logs.filter((l) => l.status === "error").length;
  const retryCount = logs.filter((l) => l.status === "retry").length;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-muted-foreground shrink-0" />
          <h3 className="font-semibold text-sm sm:text-base">Sync history</h3>
          {!loading && (
            <div className="flex items-center gap-1.5 ml-2">
              {errorCount > 0 && (
                <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10 h-5 text-[10px]">
                  {errorCount} error{errorCount === 1 ? "" : "s"}
                </Badge>
              )}
              {retryCount > 0 && (
                <Badge variant="outline" className="text-amber-500 border-amber-500/40 bg-amber-500/10 h-5 text-[10px]">
                  {retryCount} retr{retryCount === 1 ? "y" : "ies"}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="retry">Retry</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Loading sync history...</div>
      ) : logs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No sync activity yet. Schedule a meeting or refresh events to see logs here.
        </div>
      ) : (
        <ScrollArea className="h-[360px]">
          <div className="space-y-2 pr-3">
            {logs.map((log) => {
              const meta = STATUS_META[log.status];
              const Icon = meta.icon;
              return (
                <div
                  key={log.id}
                  className={`rounded-md border p-2.5 flex items-start gap-3 ${meta.className}`}
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className="font-medium text-foreground">
                        {log.direction === "outbound" ? "Push" : "Pull"} · {log.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                      {log.attempt > 1 && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-background/40">
                          attempt {log.attempt}
                        </Badge>
                      )}
                      {log.http_status && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px] bg-background/40">
                          HTTP {log.http_status}
                        </Badge>
                      )}
                    </div>
                    {log.error_message && (
                      <div className="mt-1 text-xs text-foreground/90 break-words">
                        {log.error_code && (
                          <span className="font-mono text-[10px] mr-1.5 opacity-70">
                            {log.error_code}
                          </span>
                        )}
                        {log.error_message}
                      </div>
                    )}
                    {log.google_event_id && log.status === "success" && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground font-mono truncate">
                        event: {log.google_event_id}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}
