import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEmailUsage, useSequenceUsage, useEmailSendTrend } from "@/hooks/use-email-usage";
import { formatMonthlyLimit, daysUntilReset } from "@/lib/email-usage";
import { ArrowUpRight, Mail, TrendingUp, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from "recharts";
import { format } from "date-fns";

interface Props {
  variant?: "full" | "compact";
}

export function EmailUsagePanel({ variant = "full" }: Props) {
  const { data: usage, isLoading } = useEmailUsage();
  const { data: trend } = useEmailSendTrend(30);
  const { data: sequences } = useSequenceUsage();

  if (isLoading || !usage) {
    return (
      <Card className="p-4 bg-card/40 border-border/40">
        <div className="h-20 animate-pulse" />
      </Card>
    );
  }

  const unlimited = usage.monthly_limit < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((usage.monthly_sent / Math.max(1, usage.monthly_limit)) * 100));
  const nearCap = !unlimited && pct >= 80;
  const atCap = !unlimited && usage.monthly_remaining <= 0;

  if (variant === "compact") {
    return (
      <Card className="p-3 bg-card/40 border-border/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Emails this month ({usage.plan})</div>
            <div className="text-sm font-medium truncate">
              {usage.monthly_sent.toLocaleString()} / {formatMonthlyLimit(usage.monthly_limit)}
              {!unlimited && (
                <span className="text-muted-foreground"> · {usage.monthly_remaining.toLocaleString()} left</span>
              )}
            </div>
          </div>
        </div>
        {!unlimited && (
          <div className="flex items-center gap-2 shrink-0">
            <Progress value={pct} className="w-24 h-1.5" />
            {nearCap && (
              <Button asChild size="sm" variant={atCap ? "default" : "outline"}>
                <Link to="/pricing">Upgrade</Link>
              </Button>
            )}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Sent this month</span>
            <Mail className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-semibold">{usage.monthly_sent.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">
            of {formatMonthlyLimit(usage.monthly_limit)} on {usage.plan}
          </div>
          {!unlimited && <Progress value={pct} className="mt-3 h-1.5" />}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</span>
            <Badge variant={atCap ? "destructive" : nearCap ? "secondary" : "outline"}>
              {unlimited ? "∞" : `${pct}% used`}
            </Badge>
          </div>
          <div className="text-2xl font-semibold">
            {unlimited ? "Unlimited" : usage.monthly_remaining.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Today: {usage.daily_sent}/{usage.daily_limit} sent · {usage.daily_remaining} left
          </div>
          {nearCap && (
            <Button asChild size="sm" className="mt-3 w-full">
              <Link to="/pricing">Upgrade plan <ArrowUpRight className="w-3.5 h-3.5 ml-1" /></Link>
            </Button>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Resets in</span>
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <div className="text-2xl font-semibold">{daysUntilReset()} days</div>
          <div className="text-xs text-muted-foreground mt-1">
            {format(new Date(usage.monthly_reset_at), "MMM d, yyyy")} · 00:00 UTC
          </div>
        </Card>
      </div>

      {/* 30-day trend chart */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">30-day send volume</span>
          </div>
          <Badge variant="outline">{usage.plan}</Badge>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend || []}>
              <defs>
                <linearGradient id="sendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="day"
                tickFormatter={(v) => format(new Date(v), "MMM d")}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <RechartsTooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                labelFormatter={(v) => format(new Date(v), "PP")}
              />
              <Area type="monotone" dataKey="sent" stroke="hsl(var(--primary))" fill="url(#sendFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Per-sequence breakdown */}
      {sequences && sequences.length > 0 && (
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">By sequence this month</div>
          <div className="space-y-2">
            {sequences.map((s) => (
              <div key={s.sequence_id} className="flex items-center justify-between text-sm">
                <span className="truncate text-foreground">{s.sequence_name}</span>
                <Badge variant="secondary">{s.sent_this_month.toLocaleString()} sent</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
