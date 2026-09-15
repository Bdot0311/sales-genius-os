import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Mail, Pause, Play, Loader2 } from "lucide-react";
import { reputationDisplay, MIN_VOLUME_FOR_SCORE } from "@/lib/reputation";
import { useUpdateAccount, useToggleWarmup } from "@/hooks/use-deliverability";
import { ReputationTrend } from "./ReputationTrend";
import { SendingControlsDialog } from "./SendingControlsDialog";
import type { SendingAccount, ReputationSnapshot, LiveStats } from "@/lib/deliverability-db";

interface Props {
  accounts: SendingAccount[];
  snapshots: ReputationSnapshot[];
  stats?: LiveStats[];
}

export const AccountHealthGrid = ({ accounts, snapshots, stats = [] }: Props) => {
  if (accounts.length === 0) {
    return (
      <EmptyState
        title="No sending accounts yet"
        body="Connect a mailbox on the Integrations page. It appears here automatically and starts building a reputation once you send."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {accounts.map((acct) => (
        <AccountCard
          key={acct.id}
          account={acct}
          snapshots={snapshots.filter((s) => s.sending_account_id === acct.id)}
          stats={stats.find((s) => s.sending_account_id === acct.id)}
        />
      ))}
    </div>
  );
};

const AccountCard = ({ account, snapshots, stats }: {
  account: SendingAccount;
  snapshots: ReputationSnapshot[];
  stats?: LiveStats;
}) => {
  const update = useUpdateAccount();
  const toggleWarmup = useToggleWarmup();
  // Live stats win over the nightly persisted score: they include warmup volume
  // and move the instant a send lands, which is what the rest of the page shows.
  const score = stats ? stats.reputation_score : account.reputation_score;
  const display = reputationDisplay(score);
  const volume = stats?.volume ?? snapshots[snapshots.length - 1]?.volume ?? 0;
  const isPaused = account.status === "paused";

  const togglePause = () => {
    update.mutate({
      id: account.id,
      patch: isPaused
        ? { status: "active", paused_reason: null }
        : { status: "paused", paused_reason: "Paused manually" },
    });
  };

  return (
    <Panel>
      <PanelHeader
        title={<span className="flex min-w-0 items-center gap-2">
          <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{account.email}</span>
        </span>}
        actions={
          <Badge
            variant="outline"
            className={
              account.status === "active"
                ? "border-green-500/40 text-green-500"
                : account.status === "paused"
                  ? "border-yellow-500/40 text-yellow-500"
                  : "border-border text-muted-foreground"
            }
          >
            {account.status}
          </Badge>
        }
      />
      <PanelBody className="space-y-4">
        {/* Score + rates */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-baseline gap-2">
              <span className={`text-xl font-semibold tabular-nums ${display.color}`}>{score ?? "—"}</span>
              <span className="text-[0.75rem] text-muted-foreground">{display.label}</span>
            </p>
            <p className="mt-0.5 text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground/60">
              Reputation
            </p>
          </div>
          {stats && (
            <div className="space-y-0.5 text-right text-[0.6875rem] text-muted-foreground">
              <div className="tabular-nums text-foreground/85">{volume} sent in 30 days</div>
              <div className="tabular-nums">{stats.outreach_sent} outreach · {stats.warmup_sent} warmup</div>
              <div className="tabular-nums">{stats.bounce_rate ?? 0}% bounce · {stats.open_rate ?? 0}% open</div>
            </div>
          )}
        </div>

        {score === null && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/60"
                style={{ width: `${Math.min(100, (volume / MIN_VOLUME_FOR_SCORE) * 100)}%` }}
              />
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
              {volume} of {MIN_VOLUME_FOR_SCORE} sends needed before a reputation score can be calculated.
              Outreach and warmup both count. The rates above are live either way.
            </p>
          </div>
        )}

        <ReputationTrend snapshots={snapshots} />

        {account.status === "paused" && account.paused_reason && (
          <p className="text-[0.6875rem] leading-relaxed text-amber-400">{account.paused_reason}</p>
        )}

        {/* Daily usage */}
        <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
          <span>
            {account.sent_today_date === new Date().toISOString().slice(0, 10) ? account.sent_today : 0}
            {" / "}{account.daily_limit} sent today
          </span>
          <span>
            {account.last_sent_at
              ? `Last sent ${new Date(account.last_sent_at).toLocaleDateString()}`
              : "No sends yet"}
          </span>
        </div>


        {/* Controls */}
        <div className="flex items-center justify-between border-t border-border/50 pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={account.warmup_enabled}
              disabled={toggleWarmup.isPending}
              onCheckedChange={(v) =>
                toggleWarmup.mutate({
                  account: { id: account.id, user_id: account.user_id, email: account.email },
                  enabled: v,
                })
              }
              aria-label="Toggle warmup"
            />
            <span className="text-[0.6875rem] text-muted-foreground">Warmup</span>
          </div>
          <div className="flex items-center gap-1">
            <SendingControlsDialog account={account} />
            <Button size="sm" variant="outline" onClick={togglePause} disabled={update.isPending}>
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isPaused ? (
                <><Play className="mr-1 h-3.5 w-3.5" /> Resume</>
              ) : (
                <><Pause className="mr-1 h-3.5 w-3.5" /> Pause</>
              )}
            </Button>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
};
