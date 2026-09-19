import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  confidenceLabel,
  decisionTone,
  formatPercent,
  type LeadDecision,
} from "@/lib/lead-intelligence";

/**
 * The compact read of an evaluation, for a table row. Deliberately quiet: one
 * priority chip, with the rest on hover. An unevaluated lead shows nothing at
 * all rather than an empty placeholder.
 */
export const LeadIntelligenceBadge = ({ decision }: { decision?: LeadDecision }) => {
  if (!decision || decision.status !== "ok") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const priority = decision.fields.email_priority;
  const fit = decision.fields.icp_fit;
  const next = decision.fields.send_recommendation;
  const primary = priority ?? fit;
  if (!primary) return <span className="text-xs text-muted-foreground">—</span>;

  const key = priority ? "email_priority" : "icp_fit";
  const uncertain = !primary.actionable;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${decisionTone(key, primary.value)} ${uncertain ? "opacity-60" : ""}`}
        >
          {uncertain ? "Not sure" : primary.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs space-y-1">
        {fit && <p className="text-xs">{fit.label} · {confidenceLabel(fit.confidence)}</p>}
        {decision.fields.buying_intent && (
          <p className="text-xs">{decision.fields.buying_intent.label}</p>
        )}
        {next && <p className="text-xs">{next.label}</p>}
        <p className="text-[11px] text-muted-foreground">
          Average confidence {formatPercent(decision.average_confidence)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
};
