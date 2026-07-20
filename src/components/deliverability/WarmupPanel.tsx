import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flame, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWarmupMessages } from "@/hooks/use-deliverability";
import { runWarmupNow } from "@/lib/deliverability-api";
import type { SendingAccount } from "@/lib/deliverability-db";

export const WarmupPanel = ({ accounts }: { accounts: SendingAccount[] }) => {
  const { data: messages = [], isLoading } = useWarmupMessages(30);
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const warmingCount = accounts.filter((a) => a.warmup_enabled).length;

  const handleRun = async () => {
    setRunning(true);
    try {
      const r = await runWarmupNow();
      if (r.idle) {
        toast.info(r.note || `Idle — ${r.eligible ?? 0} eligible mailbox(es) in the pool.`);
      } else {
        toast.success(`Warmup ran: ${r.sent ?? 0} sent, ${r.replied ?? 0} replied${r.recovered ? `, ${r.recovered} recovered from spam` : ""}.`);
      }
      qc.invalidateQueries({ queryKey: ["warmup-messages"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run warmup");
    } finally {
      setRunning(false);
    }
  };

  const sent = messages.length;
  const replied = messages.filter((m) => m.replied_at).length;
  const withFolder = messages.filter((m) => m.folder_detected && m.folder_detected !== "unknown");
  const inbox = withFolder.filter((m) => m.folder_detected === "inbox").length;
  const inboxRate = withFolder.length > 0 ? Math.round((inbox / withFolder.length) * 100) : null;
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            Warmup
          </span>
          <Button size="sm" variant="outline" onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            Run now
          </Button>
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
