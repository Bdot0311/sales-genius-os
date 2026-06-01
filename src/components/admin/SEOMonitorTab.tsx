import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, AlertTriangle, CheckCircle2, Play, ExternalLink, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

interface SeoIssue {
  id: string;
  fingerprint: string;
  category: string;
  severity: "low" | "mid" | "high" | "critical";
  url: string | null;
  title: string;
  description: string | null;
  details: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
  acknowledged_at: string | null;
}

interface SeoRun {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  pages_checked: number;
  issues_found: number;
  new_issues: number;
  resolved_issues: number;
  summary: Record<string, unknown>;
  error: string | null;
}

interface Dashboard {
  open_issues: SeoIssue[];
  recent_runs: SeoRun[];
  counts: {
    open_total: number;
    open_critical: number;
    open_high: number;
    unacknowledged: number;
  };
}

const sevColor: Record<string, string> = {
  critical: "bg-red-500/15 text-red-500 border-red-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  mid: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  low: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

export const SEOMonitorTab = () => {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data: result, error } = await supabase.rpc("admin_get_seo_dashboard");
    if (error) {
      toast.error("Failed to load SEO dashboard", { description: error.message });
    } else {
      setData(result as unknown as Dashboard);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("seo-monitor-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_issues" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "seo_audit_runs" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const runNow = async (mode: "perf" | "crawl" | "both") => {
    setRunning(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("run-seo-audit", { body: { mode } });
      if (error) throw error;
      toast.success(`Audit complete`, {
        description: `${result?.issues_found ?? 0} issues · ${result?.new_issues ?? 0} new · ${result?.resolved_issues ?? 0} resolved`,
      });
      await load();
    } catch (e) {
      toast.error("Audit failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  };

  const acknowledge = async (id: string) => {
    const { error } = await supabase
      .from("seo_issues")
      .update({ acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Failed to acknowledge", { description: error.message });
    } else {
      toast.success("Issue acknowledged");
      load();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const counts = data?.counts ?? { open_total: 0, open_critical: 0, open_high: 0, unacknowledged: 0 };
  const openIssues = data?.open_issues ?? [];
  const recentRuns = data?.recent_runs ?? [];

  // Build 30-day trend from recent_runs
  const trendData = recentRuns
    .slice()
    .reverse()
    .map((r) => ({
      date: new Date(r.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      issues: r.issues_found,
      new: r.new_issues,
    }));

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">SEO Monitor</h2>
          <p className="text-sm text-muted-foreground">
            Daily PageSpeed audit · Weekly full crawl + GSC pull · Email digest Mondays
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={running}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => runNow("perf")} disabled={running}>
            <Play className="h-4 w-4 mr-2" /> Run perf
          </Button>
          <Button size="sm" onClick={() => runNow("both")} disabled={running}>
            <Play className="h-4 w-4 mr-2" /> Run full audit
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open issues</CardDescription>
            <CardTitle className="text-3xl">{counts.open_total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Critical</CardDescription>
            <CardTitle className="text-3xl text-red-500">{counts.open_critical}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>High</CardDescription>
            <CardTitle className="text-3xl text-orange-500">{counts.open_high}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unacknowledged</CardDescription>
            <CardTitle className="text-3xl text-primary">{counts.unacknowledged}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Trend */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Issue trend
            </CardTitle>
            <CardDescription>Issues found per audit run</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line type="monotone" dataKey="issues" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Total issues" />
                <Line type="monotone" dataKey="new" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="New issues" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="issues">
        <TabsList>
          <TabsTrigger value="issues">Open issues ({openIssues.length})</TabsTrigger>
          <TabsTrigger value="runs">Audit history ({recentRuns.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="space-y-2">
          {openIssues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
                No open SEO issues. Last audit looks clean.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>First seen</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openIssues.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Badge variant="outline" className={sevColor[i.severity] || sevColor.low}>
                          {i.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{i.title}</div>
                        {i.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{i.description}</div>
                        )}
                        {i.url && (
                          <a
                            href={i.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            {new URL(i.url).pathname} <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{i.category.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(i.first_seen_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {i.acknowledged_at ? (
                          <Badge variant="outline" className="text-xs">ack'd</Badge>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => acknowledge(i.id)}>
                            Acknowledge
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Pages</TableHead>
                  <TableHead className="text-right">Issues</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Resolved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.started_at).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{r.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === "success" ? (
                        <Badge variant="outline" className="bg-green-500/15 text-green-500 border-green-500/30 text-xs">success</Badge>
                      ) : r.status === "failed" ? (
                        <Badge variant="outline" className="bg-red-500/15 text-red-500 border-red-500/30 text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />failed
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{r.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">{r.pages_checked}</TableCell>
                    <TableCell className="text-right text-sm">{r.issues_found}</TableCell>
                    <TableCell className="text-right text-sm text-orange-500">{r.new_issues}</TableCell>
                    <TableCell className="text-right text-sm text-green-500">{r.resolved_issues}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
