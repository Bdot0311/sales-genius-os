import { EmptyState, Panel, PanelFooter, PanelHeader } from "@/components/dashboard/Panel";
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
      <EmptyState
        title="No mailboxes connected"
        body="Connect one on the Integrations page and it appears here automatically."
      />
    );
  }

  if (isLoading || !data) {
    // Rows in the shape the rows will take, so the panel does not reflow from
    // a two-column grid into a list the moment the data lands.
    return (
      <Panel>
        <PanelHeader title="Mailboxes" />
        <div>
          {[0, 1].map((i) => (
            <div key={i} className="border-b border-border/30 px-4 py-3 last:border-b-0 sm:px-5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-full max-w-md" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  const summary = connectionSummary(data.map((d) => d.diagnosis));
  const allSending = summary.sending === summary.total;

  return (
    /* One panel of rows, not a grid of small cards.
       Each mailbox carried an address, a state and one sentence — a row's worth
       of content given a border, a shadow and its own padding — and at six
       mailboxes the grid made you read in two directions to answer one
       question. */
    <Panel>
      <PanelHeader
        title="Mailboxes"
        meta={allSending ? `all ${summary.total} sending` : `${summary.sending} of ${summary.total} sending`}
      />
      <div>
        {data.map(({ account, diagnosis }) => {
          const style = STATE_STYLE[diagnosis.state];
          return (
            <div
              key={account.id}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border/30 px-4 py-3 last:border-b-0 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="truncate text-[0.8125rem] text-foreground">{account.email}</p>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[0.625rem] ${style.cls}`}>
                    {style.icon}
                    {style.label}
                  </span>
                </div>
                {/* Plain English, always. The raw provider error stays in logs. */}
                <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-relaxed text-muted-foreground">
                  {diagnosis.explanation}
                </p>
              </div>

              {diagnosis.fix && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-[0.6875rem]"
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
            </div>
          );
        })}
      </div>

      {/* Said on the panel itself, because a column of green ticks here is the
          exact thing people misread as "my mail is landing". */}
      <PanelFooter>
        <span className="inline-flex items-center gap-1.5">
          <ShieldQuestion className="h-3 w-3" />
          This is uptime, not placement. Whether mail reaches an inbox is measured above.
        </span>
      </PanelFooter>
    </Panel>
  );
};
