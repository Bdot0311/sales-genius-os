import { useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/Panel";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { analyzeSpamRisk, type SpamSeverity } from "@/lib/spam-score";

const severityIcon = (s: SpamSeverity) =>
  s === "high" ? <XCircle className="h-4 w-4 text-destructive" />
    : s === "medium" ? <AlertTriangle className="h-4 w-4 text-yellow-500" />
      : <AlertTriangle className="h-4 w-4 text-muted-foreground" />;

export const SpamCheckerPanel = () => {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const result = useMemo(() => analyzeSpamRisk(subject, body), [subject, body]);
  const hasContent = subject.trim().length > 0 || body.trim().length > 0;

  const scoreColor =
    result.rating === "excellent" ? "text-green-500"
      : result.rating === "good" ? "text-emerald-400"
        : result.rating === "risky" ? "text-yellow-500" : "text-destructive";

  return (
    <Panel>
      <PanelHeader
        title="Your draft"
        actions={
          hasContent ? (
            <span className={`flex items-center gap-1.5 text-[0.8125rem] font-semibold tabular-nums ${scoreColor}`}>
              {result.rating === "excellent" && <CheckCircle2 className="h-3.5 w-3.5" />}
              {result.score}/100
            </span>
          ) : undefined
        }
      />
      <PanelBody className="space-y-3">
        <Input placeholder="Subject line" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          placeholder="Paste your email body (HTML or plain text) to score its inbox-placement risk…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="resize-y"
        />

        {hasContent && (
          <>
            <Progress value={result.score} className="h-1.5" />

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{result.stats.words} words</span>
              <span>{result.stats.links} links</span>
              <span>{result.stats.images} images</span>
              {result.stats.exclamations > 0 && <span>{result.stats.exclamations} exclamations</span>}
            </div>

            {result.issues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md bg-green-500/10 p-2.5 text-xs text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                No placement risks detected. This reads like a clean 1:1 email.
              </div>
            ) : (
              <div className="space-y-2">
                {result.issues.map((issue) => (
                  <div key={issue.id} className="flex items-start gap-2 rounded-md border border-border/50 p-2.5">
                    {severityIcon(issue.severity)}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{issue.label}</p>
                      <p className="text-xs text-muted-foreground">{issue.message}</p>
                      <p className="mt-0.5 text-xs text-primary/80">{issue.fix}</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">-{issue.penalty}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </PanelBody>
    </Panel>
  );
};
