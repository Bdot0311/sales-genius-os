import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, CartesianGrid, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ExternalLink, RefreshCw, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface InsightsPayload {
  configured: boolean;
  reason?: string;
  error?: string;
  details?: string;
  cached?: boolean;
  range?: string;
  generated_at?: string;
  posthog_url?: string;
  replays_url?: string;
  totals?: {
    pageviews: number;
    visitors: number;
    sessions: number;
    bounce_rate: number;
    avg_session_seconds: number;
  };
  trend?: { bucket: string; visitors: number; pageviews: number }[];
  top_pages?: { path: string; views: number; visitors: number }[];
  top_referrers?: { referrer: string; visitors: number }[];
  funnel?: { step: string; people: number }[];
  top_events?: { event: string; total: number }[];
}

const chartConfig = {
  visitors: { label: "Visitors", color: "hsl(var(--chart-1))" },
  pageviews: { label: "Pageviews", color: "hsl(var(--chart-2))" },
};

const formatDuration = (seconds: number) => {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatBucket = (bucket: string, range: string) => {
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  return range === "24h"
    ? d.toLocaleTimeString([], { hour: "numeric" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const ProductAnalyticsTab = () => {
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("posthog-insights", {
        body: { range },
      });
      if (fnError) {
        const details =
          fnError instanceof FunctionsHttpError ? await fnError.context.text() : fnError.message;
        setError(details);
        setData(null);
        return;
      }
      const payload = result as InsightsPayload;
      if (payload?.error) {
        setError(payload.details ? `${payload.error}: ${payload.details}` : payload.error);
      }
      setData(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-[320px]" />
      </div>
    );
  }

  if (data && data.configured === false) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Product analytics needs one more key</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Event tracking is already live — the app is sending pageviews, signups, billing and AI SDR
            events to PostHog. To read that data back into this dashboard, a PostHog{" "}
            <strong>personal API key</strong> (starts with <code>phx_</code>) is required, because the
            connector only provides the write-only project token.
          </p>
          <p className="text-muted-foreground">
            {data.reason === "missing_project_id"
              ? "The PostHog project ID is missing — reconnect PostHog in project settings."
              : "Create a read-scoped personal API key in PostHog under Settings → Personal API keys, then save it as POSTHOG_PERSONAL_API_KEY."}
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  const totals = data?.totals;
  const activeRange = data?.range ?? range;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          {data?.cached && <Badge variant="secondary">Cached</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {data?.replays_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={data.replays_url} target="_blank" rel="noreferrer noopener">
                <Video className="mr-2 h-4 w-4" />
                Session replays
              </a>
            </Button>
          )}
          {data?.posthog_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={data.posthog_url} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open PostHog
              </a>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load PostHog data</AlertTitle>
          <AlertDescription className="break-words">{error}</AlertDescription>
        </Alert>
      )}

      {totals && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Visitors</CardDescription>
              <CardTitle className="text-2xl">{totals.visitors.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pageviews</CardDescription>
              <CardTitle className="text-2xl">{totals.pageviews.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sessions</CardDescription>
              <CardTitle className="text-2xl">{totals.sessions.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bounce rate</CardDescription>
              <CardTitle className="text-2xl">{totals.bounce_rate}%</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg. session</CardDescription>
              <CardTitle className="text-2xl">{formatDuration(totals.avg_session_seconds)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {!!data?.trend?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Traffic</CardTitle>
            <CardDescription>Visitors and pageviews from PostHog</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px]">
              <AreaChart
                data={data.trend.map((p) => ({ ...p, label: formatBucket(p.bucket, activeRange) }))}
              >
                <defs>
                  <linearGradient id="fillPhVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="visitors"
                  name="Visitors"
                  stroke="hsl(var(--chart-1))"
                  fill="url(#fillPhVisitors)"
                />
                <Area
                  type="monotone"
                  dataKey="pageviews"
                  name="Pageviews"
                  stroke="hsl(var(--chart-2))"
                  fillOpacity={0}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {!!data?.funnel?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Activation funnel</CardTitle>
            <CardDescription>Unique people reaching each milestone in this window</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(() => {
              const top = Math.max(...data.funnel.map((f) => f.people), 1);
              return data.funnel.map((step, i) => {
                const prev = i === 0 ? null : data.funnel![i - 1].people;
                const conversion = prev && prev > 0 ? Math.round((step.people / prev) * 100) : null;
                return (
                  <div key={step.step} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{step.step}</span>
                      <span className="text-muted-foreground">
                        {step.people.toLocaleString()}
                        {conversion !== null && ` · ${conversion}% of previous`}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.max((step.people / top) * 100, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {!!data?.top_pages?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Top pages</CardTitle>
              <CardDescription>Most viewed paths</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_pages.map((p) => (
                <div key={p.path} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-3 font-mono text-xs">{p.path}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.views.toLocaleString()} views · {p.visitors.toLocaleString()} people
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!!data?.top_referrers?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Top referrers</CardTitle>
              <CardDescription>Where visitors came from</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.top_referrers.map((r) => (
                <div key={r.referrer} className="flex items-center justify-between text-sm">
                  <span className="truncate pr-3">{r.referrer}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {r.visitors.toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {!!data?.top_events?.length && (
        <Card>
          <CardHeader>
            <CardTitle>Top product events</CardTitle>
            <CardDescription>Custom events captured from the app and backend</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {data.top_events.map((e) => (
              <div key={e.event} className="flex items-center justify-between text-sm">
                <span className="truncate pr-3 font-mono text-xs">{e.event}</span>
                <span className="shrink-0 text-muted-foreground">{e.total.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
