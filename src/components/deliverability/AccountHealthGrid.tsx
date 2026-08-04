import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Mail, Pause, Play, Loader2 } from "lucide-react";
import { reputationDisplay, MIN_VOLUME_FOR_SCORE } from "@/lib/reputation";
import { useUpdateAccount, useToggleWarmup } from "@/hooks/use-deliverability";
import { ReputationTrend } from "./ReputationTrend";
import { SendingControlsDialog } from "./SendingControlsDialog";
import type { SendingAccount, ReputationSnapshot } from "@/lib/deliverability-db";

interface Props {
  accounts: SendingAccount[];
  snapshots: ReputationSnapshot[];
}

export const AccountHealthGrid = ({ accounts, snapshots }: Props) => {
  if (accounts.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No sending accounts yet. Connect a mailbox on the Integrations page — it appears here
          automatically and starts building a reputation once you send.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {accounts.map((acct) => (
        <AccountCard
          key={acct.id}
          account={acct}
          snapshots={snapshots.filter((s) => s.sending_account_id === acct.id)}
        />
      ))}
    </div>
  );
};

const AccountCard = ({ account, snapshots }: { account: SendingAccount; snapshots: ReputationSnapshot[] }) => {
  const update = useUpdateAccount();
  const toggleWarmup = useToggleWarmup();
  const display = reputationDisplay(account.reputation_score);
  const latest = snapshots[snapshots.length - 1];
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
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{account.email}</span>
          </span>
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
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score + rates */}
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-3xl font-bold tabular-nums ${display.color}`}>
              {account.reputation_score ?? "—"}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">{display.label}</span>
          </div>
          {latest && (
            <div className="text-right text-xs text-muted-foreground">
              <div>{latest.volume} sent / 30d</div>
              <div>{latest.bounce_rate}% bounce · {latest.complaint_rate}% complaint</div>
              <div>{latest.open_rate}% open</div>
            </div>
          )}
        </div>

        {account.reputation_score === null && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/60"
                style={{ width: `${Math.min(100, ((latest?.volume ?? 0) / MIN_VOLUME_FOR_SCORE) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {latest?.volume ?? 0} of {MIN_VOLUME_FOR_SCORE} sends needed before a reputation score is
              calculated. Rates above are live; the score unlocks at meaningful volume.
            </p>
          </div>
        )}

        <ReputationTrend snapshots={snapshots} />

        {account.status === "paused" && account.paused_reason && (
          <p className="text-xs text-yellow-500">{account.paused_reason}</p>
        )}

        {/* Daily usage */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
            <span className="text-xs text-muted-foreground">Warmup</span>
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
      </CardContent>
    </Card>
  );
};
