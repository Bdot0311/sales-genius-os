import { Panel, PanelBody } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { Check, CircleSlash, PauseCircle, PlugZap, ShieldQuestion } from "lucide-react";
import { connectionSummary, type ConnectionState } from "@/lib/deliverability-verdict";
import { useConnectionHealth } from "@/hooks/use-connection-health";
import { useUpdateAccount } from "@/hooks/use-deliverability";
import type { SendingAccount } from "@/lib/deliverability-db";

/**
 * Uptime, not outcome.
 *
 * This grid answers one question: can each mailbox send right now. It says
 * nothing about whether the mail lands, and it is kept visually separate from
 * the deliverability verdicts for that reason — the rest of the category ships
 * a grid like this and markets it as deliverability. A user must never read a
 * row of green here as "my mail is reaching people".
 */

const STATE_STYLE: Record<ConnectionState, { label: string; cls: string; icon: JSX.Element }> = {
  sending:      { label: "Sending",      cls: "border-green-500/40 text-green-500",     icon: <Check className="h-3.5 w-3.5" /> },
  degraded:     { label: "Degraded",     cls: "border-yellow-500/40 text-yellow-500",   icon: <PauseCircle className="h-3.5 w-3.5" /> },
  blocked:      { label: "Blocked",      cls: "border-orange-500/40 text-orange-500",   icon: <CircleSlash className="h-3.5 w-3.5" /> },
  disconnected: { label: "Disconnected", cls: "border-destructive/40 text-destructive", icon: <PlugZap className="h-3.5 w-3.5" /> },
};

export const ConnectionHealthGrid = ({ accounts }: { accounts: SendingAccount[] }) => {
  const navigate = useNavigate();
  const { data, isLoading } = useConnectionHealth(accounts);
  const update = useUpdateAccount();

  if (accounts.length === 0) {
    return (
      <Panel>
        <PanelBody className="p-6 text-center text-sm text-muted-foreground">
          No mailboxes connected yet. Connect one to start sending.
        </PanelBody>
      </Panel>
    );
  }

  if (isLoading || !data) {
    return <div className="grid gap-3 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  const summary = connectionSummary(data.map((d) => d.diagnosis));
  const allSending = summary.sending === summary.total;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {allSending
            ? `All ${summary.total} mailboxes sending.`
            : `${summary.sending} of ${summary.total} sending.`}
        </span>
        {/* Stated every time, because a green grid here is the exact thing
            users misread as "my mail is landing". */}
        <span className="flex items-center gap-1">
          <ShieldQuestion className="h-3 w-3" />
          This is uptime, not placement — whether mail lands is above.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.map(({ account, diagnosis }) => {
          const style = STATE_STYLE[diagnosis.state];
          return (
            <Panel key={account.id}>
              <PanelBody className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{account.email}</p>
                  <Badge variant="outline" className={`shrink-0 gap-1 ${style.cls}`}>
                    {style.icon}
                    {style.label}
                  </Badge>
                </div>

                {/* Plain English, always. The raw provider error stays in logs. */}
                <p className="text-xs leading-snug text-muted-foreground">{diagnosis.explanation}</p>

                {diagnosis.fix && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={update.isPending}
                    onClick={() => {
                      if (diagnosis.fix?.kind === "reconnect") {
                        navigate("/integrations");
                        return;
                      }
                      update.mutate({ id: account.id, patch: { status: "active", paused_reason: null } });
                    }}
                  >
                    {diagnosis.fix.label}
                  </Button>
                )}
              </PanelBody>
            </Panel>
          );
        })}
      </div>
    </div>
  );
};
