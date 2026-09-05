import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  auditEmail,
  type Finding,
  type Severity,
} from "../../../supabase/functions/_shared/email-audit";

/**
 * The mechanical audit, in the studio.
 *
 * The rules it runs are not new — banned openers, unbacked result claims,
 * unfilled merge fields, length, the one-ask rule — but until now they only
 * ever fired inside generate-email, on copy the model had just written. An
 * email you typed here yourself, or pasted in from somewhere else, went
 * through none of them.
 *
 * It imports the same module the agent's audit_email tool calls, so the studio
 * and the chat cannot drift into disagreeing about whether an email is
 * sendable. That has happened before with the writing rules, which existed in
 * three places at once.
 *
 * Deterministic and instant: no request, no credit, no waiting. The rubric
 * panel above buys a model's opinion on whether the email is any good; this
 * answers the narrower question of whether it breaks a rule, which is the one
 * that has a right answer.
 */

const ICON: Record<Severity, typeof ShieldAlert> = {
  blocker: ShieldAlert,
  warning: AlertTriangle,
  note: Info,
};

const TONE: Record<Severity, string> = {
  blocker: "text-destructive",
  warning: "text-amber-500",
  note: "text-muted-foreground",
};

export function EmailAuditPanel({
  subject,
  body,
  position,
  verifiedProof,
}: {
  subject: string;
  body: string;
  /** Which touch in a sequence, when the studio knows. */
  position?: number;
  verifiedProof?: string;
}) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    // Synchronous, but the flash of state makes it obvious something happened
    // on a re-run that returns the same result.
    setTimeout(() => {
      setFindings(auditEmail({ subject, body, position, verifiedProof }));
      setRunning(false);
    }, 0);
  };

  const blockers = findings?.filter((f) => f.severity === "blocker").length ?? 0;
  const warnings = findings?.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" />
          Rule audit
          {findings && findings.length === 0 && (
            <Badge variant="outline" className="text-[10px]">clean</Badge>
          )}
          {blockers > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {blockers} blocker{blockers === 1 ? "" : "s"}
            </Badge>
          )}
          {blockers === 0 && warnings > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {warnings} warning{warnings === 1 ? "" : "s"}
            </Badge>
          )}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={run} disabled={running || !body.trim()}>
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {findings ? "Re-run" : "Audit"}
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {!findings && (
          <p className="text-xs text-muted-foreground">
            Checks merge fields, unbacked claims, banned openers, length, and the
            one-call-to-action rule. Instant, and costs nothing.
          </p>
        )}
        {findings && findings.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No rule violations. This says nothing about whether the email is
            <em> good</em> — that is the score above — only that it breaks none of
            the mechanical rules.
          </p>
        )}
        {findings && findings.length > 0 && (
          <ul className="space-y-3">
            {findings.map((f, i) => {
              const Icon = ICON[f.severity];
              return (
                <li key={`${f.rule}-${i}`} className="flex gap-2.5">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${TONE[f.severity]}`} />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">
                      {f.evidence}
                    </p>
                    <p className="text-xs text-muted-foreground">{f.why}</p>
                    <p className="text-xs">
                      <span className="text-muted-foreground">Fix: </span>
                      {f.fix}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
