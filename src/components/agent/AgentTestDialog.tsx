import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FlaskConical, Loader2, Check, X, AlertTriangle } from "lucide-react";

interface TestResult {
  id: string;
  label: string;
  category: string;
  subject: string;
  body: string;
  expected: string[];
  classification: string;
  confidence: number;
  reasoning: string;
  pass: boolean | null;
  action: string;
  draft: string | null;
  spam_triggers: string[];
}

const ACTION_LABELS: Record<string, string> = {
  would_send_reply: "Would send an auto-reply",
  would_send_booking_link: "Would send booking link",
  would_suppress_contact: "Would suppress contact",
  would_close_thread: "Would close thread, no reply",
  would_skip_no_reply: "Would skip, no reply",
  would_block_spam_triggers: "Blocked — spam triggers in draft",
  capability_disabled_human_review: "Capability off — human review",
  logged_for_review: "Logged for human review",
  error: "Error",
};

export function AgentTestDialog({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [custom, setCustom] = useState("");
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<{ passed: number; failed: number; graded: number } | null>(
    null
  );

  const runTest = async () => {
    setRunning(true);
    setResults(null);
    try {
      const customReplies = custom
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((body, i) => ({ label: `Custom reply ${i + 1}`, body }));

      const { data, error } = await supabase.functions.invoke("agent-test", {
        body: { customReplies },
      });
      if (error) throw error;
      const payload = data as {
        success: boolean;
        error?: string;
        results?: TestResult[];
        passed?: number;
        failed?: number;
        graded?: number;
      };
      if (!payload?.success) throw new Error(payload?.error || "Test run failed");
      setResults(payload.results ?? []);
      setSummary({
        passed: payload.passed ?? 0,
        failed: payload.failed ?? 0,
        graded: payload.graded ?? 0,
      });
      toast.success(
        `Dry run complete — ${payload.passed ?? 0}/${payload.graded ?? 0} classified as expected. Nothing was sent.`
      );
    } catch (err) {
      toast.error(
        `Test failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={disabled}>
          <FlaskConical className="w-4 h-4" />
          Test Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Test the agent (dry run)</DialogTitle>
          <DialogDescription>
            Runs your live classifier and reply generator against the four configured
            objections plus the ugly cases — out of office, "who is this", hostile, and
            unsubscribe. Nothing is sent, no contacts are touched, no actions are logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Extra replies to test (one per line, optional)</p>
            <Textarea
              rows={3}
              placeholder={`Paste real replies here, one per line`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runTest} disabled={running} className="gap-2">
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FlaskConical className="w-4 h-4" />
              )}
              {running ? "Running dry run…" : "Run test"}
            </Button>
            {summary && (
              <div className="flex items-center gap-2 text-sm">
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30">
                  {summary.passed} correct
                </Badge>
                <Badge
                  className={
                    summary.failed > 0
                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                      : "bg-muted/40 text-muted-foreground border-border"
                  }
                >
                  {summary.failed} misclassified
                </Badge>
              </div>
            )}
          </div>

          {results && (
            <Accordion type="multiple" className="space-y-2">
              {results.map((r) => (
                <AccordionItem
                  key={r.id}
                  value={r.id}
                  className="border border-border/50 rounded-lg px-3"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-3 text-left w-full pr-2">
                      {r.pass === null ? (
                        <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : r.pass ? (
                        <Check className="w-4 h-4 text-green-400 shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium flex-1">{r.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {r.classification}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 space-y-3">
                    <Card className="p-3 bg-muted/30">
                      <p className="text-xs text-muted-foreground mb-1">Reply tested</p>
                      <p className="text-sm">{r.body}</p>
                    </Card>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Expected</p>
                        <p>{r.expected.length ? r.expected.join(" / ") : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Confidence</p>
                        <p>{Math.round((r.confidence ?? 0) * 100)}%</p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Agent would</p>
                        <p>{ACTION_LABELS[r.action] ?? r.action}</p>
                      </div>
                      {r.reasoning && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-muted-foreground">Reasoning</p>
                          <p className="text-muted-foreground">{r.reasoning}</p>
                        </div>
                      )}
                    </div>
                    {r.spam_triggers.length > 0 && (
                      <p className="text-xs text-red-400">
                        Spam triggers: {r.spam_triggers.join(", ")}
                      </p>
                    )}
                    {r.draft && (
                      <Card className="p-3 border-primary/20 bg-primary/5">
                        <p className="text-xs text-muted-foreground mb-1">Draft reply</p>
                        <p className="text-sm whitespace-pre-wrap">{r.draft}</p>
                      </Card>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
