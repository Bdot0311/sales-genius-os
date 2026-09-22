import { useCallback, useEffect, useState } from "react";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";

/**
 * Admin-only observability for the decision layer: how often it is asked, how
 * often it answers, how confident it is, how it classifies the book of leads,
 * and whether its classes actually correlate with replies. Nothing here is
 * customer-facing, and no raw provider payload is exposed.
 */

type Stats = {
  evaluations?: number;
  failures?: number;
  cached_reuses?: number;
  avg_latency_ms?: number | null;
  p95_latency_ms?: number | null;
  avg_confidence?: number | null;
  priority_distribution?: Record<string, number>;
  send_distribution?: Record<string, number>;
  review_distribution?: Record<string, number>;
  icp_distribution?: Record<string, number>;
  intent_distribution?: Record<string, number>;
  error_kinds?: Record<string, number>;
};

type Outcome = {
  dimension: string;
  bucket: string;
  leads: number;
  emails_sent: number;
  replies: number;
};

const label = (v: string) => v.replace(/_/g, " ");

function Distribution({ title, data }: { title: string; data?: Record<string, number> }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <Badge key={k} variant="outline" className="capitalize">
                {label(k)} · {v}
              </Badge>
            ))}
        </div>
      )}
    </div>
  );
}

export function LeadIntelligencePanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, outcomeRes] = await Promise.all([
      supabase.rpc("admin_get_lead_intelligence_stats", { _days: 30 }),
      supabase.rpc("admin_get_lead_intelligence_outcomes"),
    ]);
    if (statsRes.error || outcomeRes.error) {
      toast({
        title: "Could not load intelligence stats",
        description: statsRes.error?.message ?? outcomeRes.error?.message,
        variant: "destructive",
      });
    }
    setStats((statsRes.data as Stats) ?? null);
    setOutcomes(((outcomeRes.data as Outcome[]) ?? []).filter((r) => r.leads > 0));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const failureRate =
    stats?.evaluations && stats.evaluations > 0
      ? Math.round(((stats.failures ?? 0) / stats.evaluations) * 100)
      : 0;

  return (
    <Panel>
      <PanelHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <PanelTitle className="flex items-center gap-2">
            Lead intelligence (debug)
          </PanelTitle>
          <PanelDescription>
            Decision-layer activity over the last 30 days, plus how each decision class performs.
          </PanelDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </PanelHeader>
      <PanelBody className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Evaluations", stats?.evaluations ?? 0],
            ["Failures", `${stats?.failures ?? 0} (${failureRate}%)`],
            ["Cache reuses", stats?.cached_reuses ?? 0],
            ["Avg latency", stats?.avg_latency_ms ? `${stats.avg_latency_ms} ms` : "—"],
            ["p95 latency", stats?.p95_latency_ms ? `${stats.p95_latency_ms} ms` : "—"],
            ["Avg confidence", stats?.avg_confidence != null ? stats.avg_confidence : "—"],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className="text-lg font-semibold">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Distribution title="Email priority" data={stats?.priority_distribution} />
          <Distribution title="Recommended next step" data={stats?.send_distribution} />
          <Distribution title="ICP fit" data={stats?.icp_distribution} />
          <Distribution title="Buying intent" data={stats?.intent_distribution} />
          <Distribution title="Automation review" data={stats?.review_distribution} />
          <Distribution title="Failure kinds" data={stats?.error_kinds} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reply rate by decision class
          </p>
          {outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sends against evaluated leads yet, so there is nothing to compare.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Reply rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outcomes.map((row) => (
                  <TableRow key={`${row.dimension}-${row.bucket}`}>
                    <TableCell className="capitalize">{label(row.dimension)}</TableCell>
                    <TableCell className="capitalize">{label(row.bucket)}</TableCell>
                    <TableCell className="text-right">{row.leads}</TableCell>
                    <TableCell className="text-right">{row.emails_sent}</TableCell>
                    <TableCell className="text-right">{row.replies}</TableCell>
                    <TableCell className="text-right">
                      {row.emails_sent > 0 ? `${Math.round((row.replies / row.emails_sent) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}
