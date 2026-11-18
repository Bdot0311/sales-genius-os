import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Brain, Loader2, RefreshCw, ShieldAlert, ShieldCheck, FilePenLine, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { canDraftFromStrategy, strategyDraftRequest } from "@/lib/lead-strategy-draft";
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
  lead: { id: string; company_name: string; contact_name: string; contact_email: string | null };
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
export const LeadIntelligenceSection = ({ lead, decision, evaluating, onEvaluate }: Props) => {
  const evaluated = decision && decision.status === "ok";
  const [drafting, setDrafting] = useState(false);
  const [savedDraft, setSavedDraft] = useState<{ leadId: string; subject: string; body: string } | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const draftUsingStrategy = async () => {
    if (drafting || !canDraftFromStrategy(decision)) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again to create a draft.");
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("business_description").eq("id", auth.user.id).maybeSingle();
      if (profileError) throw new Error("Your business description could not be loaded. Try again.");
      const business = profile?.business_description?.trim();
      if (!business) throw new Error("Add an accurate Your Business description in Outreach before creating a draft.");
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: strategyDraftRequest(lead, business),
      });
      if (error) {
        let message = "The draft could not be created. Try again.";
        try { const details = await error.context?.json(); if (details?.error) message = details.error; } catch { /* retain safe fallback */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.draft_id) throw new Error("The draft was not saved. Try again.");
      const { data: draft, error: readError } = await supabase.from("email_drafts")
        .select("subject, body").eq("id", data.draft_id).eq("user_id", auth.user.id).single();
      if (readError || !draft) throw new Error("The draft was saved, but could not be opened here. Check Drafts in your Inbox.");
      setSavedDraft({ leadId: lead.id, subject: draft.subject, body: draft.body });
      await queryClient.invalidateQueries({ queryKey: ["inbox-email-drafts"] });
      toast({ title: "Strategy draft saved", description: "Ready to review in your Inbox. Nothing was sent." });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "The draft could not be created. Try again.");
    } finally {
      setDrafting(false);
    }
  };

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
                  if (!field || field.confidence < 0.55) return null;
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
                {EMAIL_STRATEGY_KEYS.every((key) => (decision.fields[key]?.confidence ?? 0) < 0.55) && (
                  <span className="text-sm text-muted-foreground">
                    Not enough to recommend an angle yet — more research would help.
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={draftUsingStrategy} disabled={drafting || evaluating || !canDraftFromStrategy(decision)}>
                  {drafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePenLine className="mr-2 h-4 w-4" />}
                  {drafting ? "Researching and drafting…" : "Draft using strategy"}
                </Button>
                <span className="text-xs text-muted-foreground">Draft only · review before sending</span>
              </div>
              {draftError && <p role="alert" className="mt-3 text-sm text-destructive">{draftError}</p>}
              {savedDraft?.leadId === lead.id && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-sm font-medium break-words">{savedDraft.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{savedDraft.body}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/dashboard/inbox")}>
                    Review in Inbox <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
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
