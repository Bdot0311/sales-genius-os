import { Panel, PanelBody } from "@/components/dashboard/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck } from "lucide-react";
import { useQuarantineLog } from "@/hooks/use-deliverability-timeline";

/**
 * The save.
 *
 * Nobody credits software for a problem they never saw. A mailbox that was
 * pulled before it burned the domain, and the sends that were moved to healthy
 * mailboxes instead of being lost, are invisible by definition — so they are
 * counted here.
 *
 * It reads the log and nothing else. Until containment has actually fired there
 * is no number to show, and the empty state says that rather than showing a
 * zero dressed up as an achievement.
 */
export const RecoveryLedger = ({ days = 30 }: { days?: number }) => {
  const { data, isLoading } = useQuarantineLog(days);

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const entries = data ?? [];
  const automatic = entries.filter((e) => e.automatic);
  const sendsSaved = automatic.reduce((sum, e) => sum + (e.volume_redistributed ?? 0), 0);

  if (automatic.length === 0) {
    return (
      <Panel>
        <PanelBody className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            Nothing has needed containing in the last {days} days. If a mailbox's reputation
            falls below your threshold it gets pulled from rotation automatically, its remaining
            sends move to healthy mailboxes, and every action shows up here.
          </p>
        </PanelBody>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelBody className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm">
            <span className="text-lg font-bold tabular-nums">{automatic.length}</span>{" "}
            <span className="text-muted-foreground">
              mailbox{automatic.length === 1 ? "" : "es"} contained automatically
            </span>
          </p>
          {sendsSaved > 0 && (
            <p className="text-sm">
              <span className="text-lg font-bold tabular-nums">{sendsSaved}</span>{" "}
              <span className="text-muted-foreground">sends kept moving</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          {entries.slice(0, 5).map((entry) => (
            <div key={entry.id} className="text-xs">
              <span className="font-medium">{entry.mailbox_email}</span>{" "}
              <span className="text-muted-foreground">{entry.reason}</span>
              {entry.volume_redistributed ? (
                <span className="text-muted-foreground">
                  {" "}{entry.volume_redistributed} sends moved.
                </span>
              ) : null}
              {!entry.automatic && <span className="text-muted-foreground"> (done by you)</span>}
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
};
