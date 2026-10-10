import { useMemo } from "react";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { CANNOT_AUTOFIX } from "@/lib/email-quality-fixes";
import {
  auditEmail,
  type Finding,
  type Severity,
} from "../../../supabase/functions/_shared/email-audit";
import { deliverabilityReport } from "../../../supabase/functions/_shared/email-deliverability";

/**
 * The live quality card — now a view of the rules rather than a second set.
 *
 * It used to re-implement them. Its own banned-phrase list held 11 entries
 * against the server's 79, so "We help companies like yours build the lead
 * sourcing and campaign infrastructure" cleared this card at 83/100 and went
 * to a prospect, while the same text was a warning on the server and would
 * have been held by agent-run. Its word ceiling was 75/130 where the server's
 * is 50/90/140, and it counted question marks where the server counts asks —
 * so "Let me know" was an ask to one and silence to the other.
 *
 * Both rule sets now come from _shared: the writing rules from email-audit.ts,
 * the deliverability rules from email-deliverability.ts. This file decides how
 * to show them and what the score means, and owns no rule of its own.
 *
 * ── Why the score is a deduction, not an average ─────────────────────────
 *
 * The old overall was the mean of the check scores. With fourteen checks, one
 * at 20 and the rest at 100 averages to 94 — green, sends. A blocker could not
 * fail a draft, and every check added diluted the next one further. It is now
 * 100 minus a penalty per finding, so one blocker is visible in the number,
 * and the send gate keys on blockers rather than on where the mean landed.
 */

interface EmailQualityCheckerProps {
  subject: string;
  body: string;
  isFirstTouch?: boolean;
  onFix?: (checkLabel: string) => Promise<void>;
  fixingCheck?: string | null;
}

export interface CheckResult {
  label: string;
  status: "green" | "yellow" | "red";
  message: string;
  score: number;
  /** The rule findings behind this row, so a fix can quote the evidence. */
  findings: Finding[];
}

/**
 * The rows, and which rules feed each.
 *
 * Every rule either appears here or is deliberately absent. A rule nobody
 * shows is a rule that silently stops mattering, which is how the panel came
 * to miss seventy of the server's banned phrases without anyone noticing.
 */
const ROWS: Array<{ label: string; rules: string[]; clean: string }> = [
  { label: "Placeholders", rules: ["unfilled_placeholder"], clean: "No unresolved merge fields" },
  { label: "Sender", rules: ["sender_stand_in"], clean: "Signed by a real person" },
  { label: "Name match", rules: ["name_mismatch"], clean: "Names match the lead record" },
  { label: "Credibility", rules: ["unverified_claim"], clean: "Claims look restrained" },
  { label: "Length", rules: ["too_long", "over_length", "under_length"], clean: "In the 50-90 word range" },
  { label: "CTA", rules: ["two_asks", "no_ask", "value_touch_has_ask", "first_touch_big_ask"], clean: "One clear, low-friction ask" },
  { label: "CTA position", rules: ["cta_buried"], clean: "The ask is on the closing line" },
  { label: "Banned Phrases", rules: ["banned_phrase"], clean: "No dead outbound phrases" },
  { label: "Pitch", rules: ["touch_one_pitch"], clean: "Earns a reply instead of selling" },
  { label: "Mechanism", rules: ["signal_without_mechanism"], clean: "The signal is bridged to a problem" },
  { label: "Naturalness", rules: ["mirror_analogy", "heavy_punctuation", "all_caps", "manufactured_urgency"], clean: "Reads like a person wrote it" },
  { label: "You-focus", rules: ["self_focused"], clean: "Written from their side" },
  { label: "Subject", rules: ["long_subject", "headline_subject"], clean: "Reads like a personal subject" },
  { label: "Spam Risk", rules: ["spam_trigger"], clean: "No spam-trigger wording" },
  { label: "Readability", rules: ["reading_grade"], clean: "Easy to scan" },
  { label: "Links", rules: ["link_count", "attachment_mention"], clean: "No links or attachments" },
  { label: "Images", rules: ["image_in_email"], clean: "No images" },
  { label: "Signature", rules: ["oversized_signature"], clean: "Signature looks proportional" },
];

const STATUS_OF: Record<Severity, "red" | "yellow"> = { blocker: "red", warning: "red", note: "yellow" };
const ROW_SCORE: Record<Severity, number> = { blocker: 0, warning: 40, note: 70 };
/** What a finding costs the overall. Blockers have to be visible in the number. */
const PENALTY: Record<Severity, number> = { blocker: 35, warning: 15, note: 5 };

const worst = (findings: Finding[]): Severity | null =>
  findings.some((f) => f.severity === "blocker") ? "blocker"
  : findings.some((f) => f.severity === "warning") ? "warning"
  : findings.some((f) => f.severity === "note") ? "note"
  : null;

const StatusIcon = ({ status }: { status: "green" | "yellow" | "red" }) => {
  if (status === "green") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (status === "yellow") return <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
  return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
};

export interface QualityScore {
  checks: CheckResult[];
  overallScore: number;
  overallStatus: "green" | "yellow" | "red";
  wordCount: number;
  /** Every finding, both rule sets, for a caller that wants the detail. */
  findings: Finding[];
  /** The ones that must not be sent. Empty means the gate is open. */
  blockers: Finding[];
}

export const scoreEmailQuality = (
  subject: string,
  body: string,
  isFirstTouch = true,
  lead?: { company?: string | null; contactName?: string | null },
  verifiedProof?: string,
): QualityScore => {
  const writing = auditEmail({
    subject,
    body,
    position: isFirstTouch ? 1 : undefined,
    lead,
    verifiedProof,
  });
  const { findings: deliverability, metrics } = deliverabilityReport({ subject, body, isFirstTouch });
  const findings = [...writing, ...deliverability];

  const shown = new Set(ROWS.flatMap((r) => r.rules));
  const checks: CheckResult[] = ROWS.map(({ label, rules, clean }) => {
    const hits = findings.filter((f) => rules.includes(f.rule));
    const severity = worst(hits);
    if (!severity) return { label, status: "green", message: clean, score: 100, findings: [] };
    return {
      label,
      status: STATUS_OF[severity],
      message: hits.map((f) => f.evidence).filter(Boolean).join(" · ") || hits[0].why,
      score: ROW_SCORE[severity],
      findings: hits,
    };
  });

  // A rule added to _shared and not given a row would otherwise be invisible
  // here while still blocking the send, which is the failure this file had.
  const orphans = findings.filter((f) => !shown.has(f.rule));
  for (const f of orphans) {
    checks.push({
      label: f.rule.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      status: STATUS_OF[f.severity],
      message: f.evidence || f.why,
      score: ROW_SCORE[f.severity],
      findings: [f],
    });
  }

  const penalty = findings.reduce((sum, f) => sum + PENALTY[f.severity], 0);
  const overallScore = Math.max(0, Math.min(100, 100 - penalty));
  const blockers = findings.filter((f) => f.severity === "blocker");
  const overallStatus: "green" | "yellow" | "red" =
    blockers.length > 0 ? "red"
    : findings.some((f) => f.severity === "warning") || overallScore < 75 ? "yellow"
    : "green";

  return { checks, overallScore, overallStatus, wordCount: metrics.words, findings, blockers };
};

/** The sentence a refused send shows, naming what to fix rather than a score. */
export const blockerSummary = (blockers: Finding[]): string =>
  blockers.map((f) => `${f.rule.replace(/_/g, " ")}: ${f.evidence}`).join("; ");

export const EmailQualityChecker = ({ subject, body, isFirstTouch = true, onFix, fixingCheck }: EmailQualityCheckerProps) => {
  const { checks, overallScore, overallStatus, wordCount, blockers } = useMemo(
    () => scoreEmailQuality(subject, body, isFirstTouch),
    [subject, body, isFirstTouch]
  );

  const wordCountColor = wordCount >= 50 && wordCount <= 90 ? "text-green-500" : wordCount <= 140 ? "text-yellow-500" : "text-destructive";

  return (
    <Panel className="border-border/50">
      <PanelHeader className="pb-3 pt-4 px-4">
        <PanelTitle className="font-medium flex items-center gap-2">
          <StatusIcon status={overallStatus} />
          Outbound Quality Check
          <span className="ml-auto text-xs font-normal text-muted-foreground">{overallScore}/100</span>
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-muted/40">
          <span className="text-xs text-muted-foreground font-medium">Word Count</span>
          <span className={`text-xs font-semibold tabular-nums ${wordCountColor}`}>
            {wordCount} {wordCount >= 50 && wordCount <= 90 ? "✓" : wordCount < 50 ? "↓" : "↑"}
          </span>
        </div>
        {checks.map((check) => (
          <div key={check.label} className="flex items-start gap-2">
            <StatusIcon status={check.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{check.label}</span>
                {onFix && check.status !== 'green' && !CANNOT_AUTOFIX.has(check.label) && (
                  <button
                    onClick={() => onFix(check.label)}
                    disabled={fixingCheck !== null && fixingCheck !== undefined}
                    className="text-[10px] text-primary hover:text-primary/80 font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 ml-2 shrink-0"
                  >
                    {fixingCheck === check.label ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Fixing...
                      </>
                    ) : (
                      'Fix this'
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{check.message}</p>
            </div>
          </div>
        ))}

        <Progress value={overallScore} className="h-1.5 mt-2" />

        {blockers.length > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">
              This draft cannot be sent until these are fixed: {blockerSummary(blockers)}.
            </p>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
};
