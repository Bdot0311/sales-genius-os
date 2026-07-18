import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { useWarmupMessages } from "@/hooks/use-deliverability";
import type { SendingAccount } from "@/lib/deliverability-db";

export const WarmupPanel = ({ accounts }: { accounts: SendingAccount[] }) => {
  const { data: messages = [], isLoading } = useWarmupMessages(30);
  const warmingCount = accounts.filter((a) => a.warmup_enabled).length;

  const sent = messages.length;
  const replied = messages.filter((m) => m.replied_at).length;
  const withFolder = messages.filter((m) => m.folder_detected && m.folder_detected !== "unknown");
  const inbox = withFolder.filter((m) => m.folder_detected === "inbox").length;
  const inboxRate = withFolder.length > 0 ? Math.round((inbox / withFolder.length) * 100) : null;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Flame className="h-4 w-4 text-orange-400" />
          Warmup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {warmingCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Warmup is off for all accounts. Turn on the Warmup switch on an account above to join the
            shared warmup pool. Mailboxes in the pool exchange light, natural email to build sender
            reputation.
          </p>
        ) : sent === 0 && warmingCount < 2 ? (
          <p className="text-sm text-muted-foreground">
            1 mailbox in the pool. Warmup needs at least two active mailboxes to run, so it stays idle
            by design (no filler traffic) until a second mailbox joins.
          </p>
        ) : sent === 0 ? (
          <p className="text-sm text-muted-foreground">
            {warmingCount} mailboxes in the pool and ready to warm. The worker runs hourly, so activity
            will start showing up here after its next run.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Warmup sends" value={String(sent)} sub="last 30 days" />
              <Stat label="Reply rate" value={replyRate === null ? "—" : `${replyRate}%`} sub={`${replied} replies`} />
              <Stat
                label="Inbox placement"
                value={inboxRate === null ? "—" : `${inboxRate}%`}
                sub={withFolder.length > 0 ? `${inbox}/${withFolder.length} landed` : "measuring"}
                tone={inboxRate === null ? undefined : inboxRate >= 90 ? "good" : inboxRate >= 70 ? "warn" : "bad"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Messages that land in spam are automatically moved to the inbox to aid recovery. Placement
              is measured only on messages the worker could classify.
            </p>
          </>
        )}
        {isLoading && <p className="text-xs text-muted-foreground">Loading warmup activity…</p>}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) => {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-yellow-500" : tone === "good" ? "text-green-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
};
