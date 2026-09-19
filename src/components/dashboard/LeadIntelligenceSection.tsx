import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Brain, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DECISION_LABELS,
  EMAIL_STRATEGY_KEYS,
  confidenceLabel,
  decisionTone,
  formatPercent,
  type DecisionKey,
  type LeadDecision,
} from "@/lib/lead-intelligence";

interface Props {
  decision?: LeadDecision;
  evaluating: boolean;
  onEvaluate: () => void;
}

const HEADLINE_KEYS: DecisionKey[] = ["icp_fit", "buying_intent", "email_priority", "send_recommendation"];

const Chip = ({ decisionKey, decision }: { decisionKey: DecisionKey; decision: LeadDecision }) => {
  const field = decision.fields[decisionKey];
  if (!field) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
        {DECISION_LABELS[decisionKey].title}
      </p>
      <span
        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${decisionTone(decisionKey, field.value)} ${field.actionable ? "" : "opacity-60"}`}
      >
        {field.actionable ? field.label : "Not sure"}
      </span>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {confidenceLabel(field.confidence)} · {formatPercent(field.confidence)}
      </p>
    </div>
  );
};

/**
 * What the evaluation concluded about this lead, and what it means for the
 * email. Low-confidence answers are shown as "Not sure" rather than dressed up
 * as findings — an honest unknown is more useful than a confident guess.
 */
export const LeadIntelligenceSection = ({ decision, evaluating, onEvaluate }: Props) => {
  const evaluated = decision && decision.status === "ok";

  return (
    <>
      <Separator />
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4" />AI Intelligence
          </h3>
          <Button variant="outline" size="sm" onClick={onEvaluate} disabled={evaluating}>
            {evaluating ? (
              <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Evaluating…</>
            ) : evaluated ? (
              <><RefreshCw className="w-3.5 h-3.5 mr-2" />Re-evaluate</>
            ) : (
              <>Evaluate lead</>
            )}
          </Button>
        </div>

        {!evaluated ? (
          <p className="text-sm text-muted-foreground">
            {decision?.error_message
              ? decision.error_message
              : "Evaluate this lead to see how well it fits, whether there's buying intent, and how the email should be written."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HEADLINE_KEYS.map((key) => (
                <Chip key={key} decisionKey={key} decision={decision} />
              ))}
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Email strategy
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EMAIL_STRATEGY_KEYS.map((key) => {
                  const field = decision.fields[key];
                  if (!field || !field.actionable) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      title={`${DECISION_LABELS[key].title} · ${confidenceLabel(field.confidence)}`}
                    >
                      {field.label}
                    </span>
                  );
                })}
                {EMAIL_STRATEGY_KEYS.every((key) => !decision.fields[key]?.actionable) && (
                  <span className="text-sm text-muted-foreground">
                    Not enough to recommend an angle yet — more research would help.
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 p-3">
              {decision.automation_allowed ? (
                <ShieldCheck className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {decision.automation_allowed ? "Your agent can send this one" : "Needs your eyes first"}
                </p>
                <p className="text-xs text-muted-foreground">{decision.automation_reason}</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Evaluated {formatDistanceToNow(new Date(decision.evaluated_at), { addSuffix: true })} · average
              confidence {formatPercent(decision.average_confidence)}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
