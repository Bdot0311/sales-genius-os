import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, Mail, Globe } from "lucide-react";
import { reputationDisplay } from "@/lib/reputation";
import type { SendingAccount, DeliverabilityAlert, SendingDomain } from "@/lib/deliverability-db";
import { aggregateHealth } from "@/hooks/use-deliverability";

interface Props {
  accounts: SendingAccount[];
  alerts: DeliverabilityAlert[];
  domains: SendingDomain[];
}

export const HealthOverview = ({ accounts, alerts, domains }: Props) => {
  const { score, scored } = aggregateHealth(accounts);
  const display = reputationDisplay(score);
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const authIssues = domains.filter(
    (d) => d.spf_status === "fail" || d.dkim_status === "fail" || d.dmarc_status === "fail",
  ).length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Aggregate health */}
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              {score !== null && (
                <circle
                  cx="18" cy="18" r="15.5" fill="none" stroke={display.hsl} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 97.4} 97.4`}
                />
              )}
            </svg>
            <span className="absolute text-lg font-bold tabular-nums">{score ?? "—"}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Aggregate health</p>
            <p className={`text-sm font-semibold ${display.color}`}>{display.label}</p>
            <p className="text-xs text-muted-foreground">{scored} of {accounts.length} scored</p>
          </div>
        </CardContent>
      </Card>

      <StatCard icon={<Mail className="h-5 w-5" />} label="Sending accounts" value={String(accounts.length)}
        sub={`${accounts.filter((a) => a.status === "active").length} active`} />

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
        value={authIssues > 0 ? `${authIssues} failing` : `${domains.length} ok`}
        sub={`${domains.length} domain${domains.length === 1 ? "" : "s"}`}
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
