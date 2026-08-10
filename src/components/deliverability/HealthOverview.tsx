import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, Send, Globe } from "lucide-react";
import { reputationDisplay, MIN_VOLUME_FOR_SCORE } from "@/lib/reputation";
import { totalStats, type SendingAccount, type DeliverabilityAlert, type SendingDomain, type ReputationSnapshot, type LiveStats } from "@/lib/deliverability-db";
import { aggregateHealth } from "@/hooks/use-deliverability";

interface Props {
  accounts: SendingAccount[];
  alerts: DeliverabilityAlert[];
  domains: SendingDomain[];
  snapshots?: ReputationSnapshot[];
  stats?: LiveStats[];
}

/** Latest snapshot per account — compute-reputation writes a rolling 30-day row daily. */
export function latestSnapshotByAccount(snapshots: ReputationSnapshot[]): Map<string, ReputationSnapshot> {
  const map = new Map<string, ReputationSnapshot>();
  for (const s of snapshots) {
    const prev = map.get(s.sending_account_id);
    if (!prev || s.snapshot_date >= prev.snapshot_date) map.set(s.sending_account_id, s);
  }
  return map;
}

export const HealthOverview = ({ accounts, alerts, domains, stats = [] }: Props) => {
  const { score, scored } = aggregateHealth(accounts, stats);
  const display = reputationDisplay(score);
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const authIssues = domains.filter(
    (d) => d.spf_status === "fail" || d.dkim_status === "fail" || d.dmarc_status === "fail",
  ).length;

  // Live 30-day activity across the user's mailboxes — same source as the
  // mailbox cards and the warmup panel, so all three always reconcile.
  const t = totalStats(stats);
  const volume = t.volume;
  const bounceRate = t.bounceRate;
  const remaining = Math.max(0, MIN_VOLUME_FOR_SCORE - volume);

  const healthSub =
    score !== null
      ? `${scored} of ${accounts.length} scored`
      : accounts.length === 0
        ? "No mailboxes connected"
        : `${remaining} more sends to score`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Aggregate health */}
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none"
                stroke={score !== null ? display.hsl : "hsl(var(--primary))"}
                strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${
                  (score !== null
                    ? score / 100
                    : Math.min(1, volume / MIN_VOLUME_FOR_SCORE)) * 97.4
                } 97.4`}
                opacity={score !== null ? 1 : 0.5}
              />
            </svg>
            <span className="absolute text-lg font-bold tabular-nums">{score ?? "—"}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Aggregate health</p>
            <p className={`text-sm font-semibold ${display.color}`}>{display.label}</p>
            <p className="text-xs text-muted-foreground">{healthSub}</p>
          </div>
        </CardContent>
      </Card>

      <StatCard
        icon={<Send className="h-5 w-5" />}
        label="Sent (30 days)"
        value={String(volume)}
        sub={
          volume === 0
            ? `${accounts.length} mailbox${accounts.length === 1 ? "" : "es"} connected`
            : `${t.outreach} outreach · ${t.warmup} warmup${
                bounceRate !== null ? ` · ${bounceRate.toFixed(1)}% bounce` : ""
              }`
        }
        tone={bounceRate === null ? undefined : bounceRate >= 5 ? "bad" : bounceRate >= 2 ? "warn" : "good"}
      />

      <StatCard
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Active alerts"
        value={String(alerts.length)}
        sub={criticalAlerts > 0 ? `${criticalAlerts} critical` : "none critical"}
        tone={alerts.length > 0 ? (criticalAlerts > 0 ? "bad" : "warn") : "good"}
      />

      <StatCard
        icon={authIssues > 0 ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
        label="Domain auth"
        value={domains.length === 0 ? "—" : authIssues > 0 ? `${authIssues} failing` : `${domains.length} ok`}
        sub={domains.length === 0 ? "Add a domain below" : `${domains.length} domain${domains.length === 1 ? "" : "s"}`}
        tone={authIssues > 0 ? "bad" : domains.length > 0 ? "good" : undefined}
        secondaryIcon={<Globe className="h-3.5 w-3.5" />}
      />
    </div>
  );
};


const StatCard = ({
  icon, label, value, sub, tone, secondaryIcon,
}: {
  icon: ReactNode; label: string; value: string; sub?: string;
  tone?: "good" | "warn" | "bad"; secondaryIcon?: ReactNode;
}) => {
  const toneColor = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-yellow-500" : tone === "good" ? "text-green-500" : "text-foreground";
  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          {secondaryIcon ?? icon}
          <span className="text-xs">{label}</span>
        </div>
        <p className={`text-2xl font-bold tabular-nums ${toneColor}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
};
