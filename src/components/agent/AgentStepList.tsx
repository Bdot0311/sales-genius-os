import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { presentSteps, type StepEvent } from "../../../supabase/functions/_shared/agent-step-present";

/**
 * Finished tool steps for one assistant message.
 *
 * The title is the status. The longer note is collapsed. Consecutive rows
 * that say the same thing are one row. A failure stays a warning, not a
 * quiet check.
 */
export function AgentStepList({ events, pending = false }: { events: StepEvent[]; pending?: boolean }) {
  const steps = presentSteps(events.filter((event) => event.label || event.detail));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!steps.length && !pending) return null;

  return (
    <ul className="space-y-1">
      {steps.map((step) => {
        const warning = step.status === "error";
        const queued = step.status === "queued";
        const expanded = open[step.key] === true;
        const Icon = warning ? AlertTriangle : queued ? Clock : Check;
        return (
          <li key={step.key}>
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors",
                warning ? "text-amber-400" : "text-muted-foreground hover:bg-muted/40",
              )}
              aria-expanded={step.detail ? expanded : undefined}
              onClick={() => {
                if (!step.detail) return;
                setOpen((prev) => ({ ...prev, [step.key]: !prev[step.key] }));
              }}
            >
              <Icon className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", warning ? "" : queued ? "text-amber-500" : "text-primary")} />
              <span className="min-w-0 flex-1">
                <span className={cn("font-medium", warning ? "" : "text-foreground/80")}>
                  {step.title}
                  {step.count > 1 ? ` (${step.count})` : ""}
                </span>
              </span>
              {step.detail ? (
                <ChevronDown className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0 transition-transform", expanded && "rotate-180")} />
              ) : null}
            </button>
            {expanded && step.detail ? (
              <p className="break-words pl-7 pr-2 pb-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            ) : null}
          </li>
        );
      })}
      {pending ? (
        <li className="flex items-center gap-2 px-1.5 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
          <span>Still working…</span>
        </li>
      ) : null}
    </ul>
  );
}
