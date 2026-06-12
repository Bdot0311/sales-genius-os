import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Radio, Zap, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Tables the app subscribes to via supabase.channel(...).on('postgres_changes', ...).
// Keep this list in sync with realtime usages across the codebase.
const SUBSCRIBED_TABLES = [
  "activities",
  "admin_settings",
  "api_usage_log",
  "audit_logs",
  "blocked_ips",
  "deals",
  "feature_flags",
  "leads",
  "login_history",
  "onboarding_progress",
  "profiles",
  "rate_limit_buckets",
  "reply_threads",
  "search_transactions",
  "security_events",
  "sent_emails",
  "seo_audit_runs",
  "seo_issues",
  "signup_diagnostics",
  "stripe_webhook_events",
  "subscriptions",
  "team_activity_log",
  "user_roles",
  "webhook_deliveries",
] as const;

type ChannelStatus = "connecting" | "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

interface PublicationRow {
  table_name: string;
  in_publication: boolean;
  replica_identity: string;
}

export default function RealtimeHealth() {
  const [pubRows, setPubRows] = useState<Record<string, PublicationRow>>({});
  const [loading, setLoading] = useState(true);
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>("connecting");
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [lastEventAt, setLastEventAt] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatSentAt, setHeartbeatSentAt] = useState<number | null>(null);
  const [heartbeatLatencyMs, setHeartbeatLatencyMs] = useState<number | null>(null);
  const heartbeatSentRef = useRef<number | null>(null);

  // re-render every 5s so "last event" labels stay fresh
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(i);
  }, []);

  const loadPublicationStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_realtime_status");
    if (error) {
      toast.error("Failed to load publication status: " + error.message);
      setLoading(false);
      return;
    }
    const map: Record<string, PublicationRow> = {};
    (data as PublicationRow[] | null)?.forEach((row) => {
      map[row.table_name] = row;
    });
    setPubRows(map);
    setLoading(false);
  };

  useEffect(() => {
    loadPublicationStatus();
  }, []);

  // One combined channel that listens on every subscribed table.
  useEffect(() => {
    setChannelStatus("connecting");
    setEventCounts({});
    setLastEventAt({});

    let channel = supabase.channel("admin-realtime-health");

    SUBSCRIBED_TABLES.forEach((table) => {
      channel = channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        (() => {
          setEventCounts((c) => ({ ...c, [table]: (c[table] ?? 0) + 1 }));
          const now = Date.now();
          setLastEventAt((l) => ({ ...l, [table]: now }));

          // capture heartbeat round-trip latency
          if (table === "admin_settings" && heartbeatSentRef.current) {
            setHeartbeatLatencyMs(now - heartbeatSentRef.current);
            heartbeatSentRef.current = null;
          }
        }) as never,
      );
    });

    channel.subscribe((status) => {
      setChannelStatus(status as ChannelStatus);
      if (status === "CHANNEL_ERROR") {
        toast.error("Realtime channel error — check publication & RLS policies");
      } else if (status === "TIMED_OUT") {
        toast.error("Realtime channel timed out");
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const runHeartbeat = async () => {
    setHeartbeatLoading(true);
    setHeartbeatLatencyMs(null);
    const sentAt = Date.now();
    heartbeatSentRef.current = sentAt;
    setHeartbeatSentAt(sentAt);

    const { error } = await supabase.rpc("admin_realtime_heartbeat");
    if (error) {
      toast.error("Heartbeat write failed: " + error.message);
      heartbeatSentRef.current = null;
    } else {
      toast.success("Heartbeat written — waiting for echo…");
      // safety timeout
      setTimeout(() => {
        if (heartbeatSentRef.current === sentAt) {
          heartbeatSentRef.current = null;
          toast.error("No realtime event received within 10s for admin_settings");
        }
      }, 10_000);
    }
    setHeartbeatLoading(false);
  };

  const rows = useMemo(() => {
    return SUBSCRIBED_TABLES.map((t) => {
      const pub = pubRows[t];
      return {
        table: t,
        inPublication: pub?.in_publication ?? false,
        replica: pub?.replica_identity ?? "?",
        events: eventCounts[t] ?? 0,
        lastAt: lastEventAt[t] ?? 0,
      };
    });
  }, [pubRows, eventCounts, lastEventAt, tick]);

  const missingCount = rows.filter((r) => !r.inPublication).length;
  const totalEvents = rows.reduce((s, r) => s + r.events, 0);

  const statusBadge = (() => {
    switch (channelStatus) {
      case "SUBSCRIBED":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" />Live</Badge>;
      case "connecting":
        return <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 gap-1"><Radio className="h-3 w-3 animate-pulse" />Connecting</Badge>;
      case "CHANNEL_ERROR":
        return <Badge className="bg-destructive/20 text-destructive border border-destructive/30 gap-1"><XCircle className="h-3 w-3" />Error</Badge>;
      case "TIMED_OUT":
        return <Badge className="bg-destructive/20 text-destructive border border-destructive/30 gap-1"><AlertTriangle className="h-3 w-3" />Timed Out</Badge>;
      case "CLOSED":
        return <Badge variant="outline">Closed</Badge>;
    }
  })();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Realtime Health
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Verifies every subscribed table is broadcasting live updates end-to-end.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadPublicationStatus} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={runHeartbeat} disabled={heartbeatLoading || channelStatus !== "SUBSCRIBED"}>
            <Zap className="h-4 w-4 mr-2" />
            Run Heartbeat
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Channel Status</CardDescription>
          </CardHeader>
          <CardContent>{statusBadge}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Subscribed Tables</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{SUBSCRIBED_TABLES.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Missing from Publication</CardDescription>
          </CardHeader>
          <CardContent className={`text-2xl font-bold ${missingCount > 0 ? "text-destructive" : "text-emerald-400"}`}>
            {missingCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Events This Session</CardDescription>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{totalEvents}</CardContent>
        </Card>
      </div>

      {heartbeatSentAt && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Last Heartbeat
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-muted-foreground">
              Sent: <span className="text-foreground">{new Date(heartbeatSentAt).toLocaleTimeString()}</span>
            </span>
            <span className="text-muted-foreground">
              Round-trip:{" "}
              {heartbeatLatencyMs !== null ? (
                <span className={heartbeatLatencyMs < 2000 ? "text-emerald-400 font-medium" : "text-amber-400 font-medium"}>
                  {heartbeatLatencyMs}ms
                </span>
              ) : (
                <span className="text-muted-foreground">waiting…</span>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Table Status</CardTitle>
          <CardDescription>
            "In Publication" must be true for realtime to deliver events. REPLICA IDENTITY FULL is recommended so
            UPDATE/DELETE payloads include the full row.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>In Publication</TableHead>
                <TableHead>Replica Identity</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Last Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.table}>
                  <TableCell className="font-mono text-xs">{r.table}</TableCell>
                  <TableCell>
                    {r.inPublication ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 gap-1">
                        <CheckCircle2 className="h-3 w-3" />Yes
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/20 text-destructive border border-destructive/30 gap-1">
                        <XCircle className="h-3 w-3" />Missing
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={r.replica === "full" ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}
                    >
                      {r.replica}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.events}</TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {r.lastAt ? formatDistanceToNow(r.lastAt, { addSuffix: true }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {missingCount > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Fix Required
            </CardTitle>
            <CardDescription>
              These tables are subscribed by the app but are NOT in the <code>supabase_realtime</code> publication.
              Add them via a migration:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted/40 p-3 rounded-md overflow-x-auto">
{rows
  .filter((r) => !r.inPublication)
  .map((r) => `ALTER PUBLICATION supabase_realtime ADD TABLE public.${r.table};`)
  .join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
