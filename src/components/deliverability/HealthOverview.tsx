import { Panel } from "@/components/dashboard/Panel";
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
    /**
     * The gauge and the three numbers on one surface.
     *
     * These were four separately bordered, separately shadowed tiles, each with
     * its own icon in its own colour — the shape that made every dashboard page
     * open with a rainbow of unrelated figures. The gauge keeps its weight
     * because it is the summary; the rest are hairline-divided readings of it.
     */
    <Panel className="grid sm:grid-cols-2 lg:grid-cols-[minmax(0,1.15fr)_repeat(3,minmax(0,1fr))]">
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
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
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
            Aggregate health
          </p>
          <p className={`mt-1 text-[0.8125rem] font-semibold ${display.color}`}>{display.label}</p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">{healthSub}</p>
        </div>
      </div>

      <Reading
        position="first"
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

      <Reading
        label="Active alerts"
        value={String(alerts.length)}
        sub={criticalAlerts > 0 ? `${criticalAlerts} critical` : "None critical"}
        tone={alerts.length > 0 ? (criticalAlerts > 0 ? "bad" : "warn") : "good"}
      />

      <Reading
        position="last"
        label="Domain auth"
        value={domains.length === 0 ? "—" : authIssues > 0 ? `${authIssues} failing` : `${domains.length} ok`}
        sub={domains.length === 0 ? "Add a domain below" : `${domains.length} domain${domains.length === 1 ? "" : "s"}`}
        tone={authIssues > 0 ? "bad" : domains.length > 0 ? "good" : undefined}
      />
    </Panel>
  );
};

/**
 * One reading in the strip.
 *
 * No icon: a paper plane beside "Sent (30 days)" and a shield beside "Domain
 * auth" illustrate the label they sit next to, and three of them in three
 * colours turn a row of facts into a legend. Tone is carried by the number
 * itself, which is the part that changes.
 */
const Reading = ({
  label,
  value,
  sub,
  tone,
  position = "middle",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
  /** Where this reading sits once the row wraps to two columns. */
  position?: "first" | "middle" | "last";
}) => {
  const toneColor =
    tone === "bad"
      ? "text-destructive"
      : tone === "warn"
        ? "text-yellow-500"
        : tone === "good"
          ? "text-green-500"
          : "text-foreground";
  return (
    // The rules that divide the strip depend on where the row wraps, so each
    // reading is told its own position. Selecting them by their index in the
    // group instead would have to be correct at every breakpoint at once, and
    // the wrap point moves between two columns and four.
    <div
      className={`border-t border-border/30 px-4 py-4 sm:px-5 lg:border-l lg:border-t-0 ${
        position === "first" ? "sm:border-l sm:border-t-0" : "sm:border-l-0"
      } ${position === "last" ? "sm:border-l" : ""}`}
    >
      <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${toneColor}`}>{value}</p>
      {sub && <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">{sub}</p>}
    </div>
  );
};
