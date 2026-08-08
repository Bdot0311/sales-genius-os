import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertTriangle, Clock, Gauge, RefreshCw } from "lucide-react";

type Metric = {
  id: string;
  turn_id: string;
  step_type: string;
  tool_name: string;
  duration_ms: number;
  status: string;
  detail: string | null;
  created_at: string;
};

const RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
];

function fmt(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function PerformanceTab() {
  const [rows, setRows] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24 * 7);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data } = await supabase
      .from("agent_step_metrics")
      .select("id, turn_id, step_type, tool_name, duration_ms, status, detail, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    setRows((data as Metric[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  const stats = useMemo(() => {
    const turns = rows.filter((r) => r.step_type === "turn");
    const steps = rows.filter((r) => r.step_type !== "turn");
    const turnDurations = turns.map((t) => t.duration_ms).sort((a, b) => a - b);
    const okTurns = turns.filter((t) => t.status === "success").length;

    const byTool = new Map<string, { name: string; runs: number; fails: number; durations: number[] }>();
    for (const s of steps) {
      const e = byTool.get(s.tool_name) ?? { name: s.tool_name, runs: 0, fails: 0, durations: [] };
      e.runs += 1;
      if (s.status === "error") e.fails += 1;
      e.durations.push(s.duration_ms);
      byTool.set(s.tool_name, e);
    }
    const tools = [...byTool.values()]
      .map((t) => {
        const sorted = [...t.durations].sort((a, b) => a - b);
        return {
          name: t.name,
          runs: t.runs,
          fails: t.fails,
          avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
          p95: percentile(sorted, 95),
          max: sorted[sorted.length - 1],
          total: sorted.reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      turnCount: turns.length,
      avgTurn: turnDurations.length ? turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length : 0,
      p95Turn: percentile(turnDurations, 95),
      successRate: turns.length ? Math.round((okTurns / turns.length) * 100) : null,
      stepCount: steps.length,
      failures: steps.filter((s) => s.status === "error").slice(0, 8),
      tools,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Step timing</h3>
          <p className="text-sm text-muted-foreground">
            Tool latency, turn duration and failure rate for your SDR runs.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant={hours === r.hours ? "secondary" : "ghost"}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Activity className="h-4 w-4" />} label="Runs" value={String(stats.turnCount)} hint={`${stats.stepCount} tool steps`} />
            <StatCard icon={<Clock className="h-4 w-4" />} label="Avg run time" value={fmt(stats.avgTurn)} hint={`p95 ${fmt(stats.p95Turn)}`} />
            <StatCard
              icon={<Gauge className="h-4 w-4" />}
              label="Success rate"
              value={stats.successRate === null ? "—" : `${stats.successRate}%`}
              hint="Runs finished without errors"
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Failed steps"
              value={String(stats.tools.reduce((n, t) => n + t.fails, 0))}
              hint="Tool calls that errored"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Slowest tools</CardTitle>
              <CardDescription>Ranked by total time spent — the best places to optimize.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No runs recorded in this window yet. Chat with your agent and timings will appear here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2 text-left font-medium">Tool</th>
                        <th className="py-2 text-right font-medium">Runs</th>
                        <th className="py-2 text-right font-medium">Avg</th>
                        <th className="py-2 text-right font-medium">p95</th>
                        <th className="py-2 text-right font-medium">Max</th>
                        <th className="py-2 text-right font-medium">Fails</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.tools.map((t) => (
                        <tr key={t.name} className="border-b border-border/50 last:border-0">
                          <td className="py-2 font-mono text-xs">{t.name}</td>
                          <td className="py-2 text-right">{t.runs}</td>
                          <td className="py-2 text-right">{fmt(t.avg)}</td>
                          <td className="py-2 text-right">{fmt(t.p95)}</td>
                          <td className="py-2 text-right">{fmt(t.max)}</td>
                          <td className="py-2 text-right">
                            {t.fails ? <Badge variant="destructive">{t.fails}</Badge> : <span className="text-muted-foreground">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {stats.failures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Recent failures</CardTitle>
                <CardDescription>What broke, and how long it ran before failing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stats.failures.map((f) => (
                  <div key={f.id} className="rounded-md border border-border/60 p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{f.tool_name}</span>
                      <Badge variant="outline">{fmt(f.duration_ms)}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(f.created_at).toLocaleString()}
                      </span>
                    </div>
                    {f.detail && <p className="mt-1 text-xs text-muted-foreground break-words">{f.detail}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
