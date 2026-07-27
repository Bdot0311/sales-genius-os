import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FlaskConical, Loader2, Check, X, AlertTriangle, Mail, Send, Inbox } from "lucide-react";


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
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [custom, setCustom] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [includeRealReplies, setIncludeRealReplies] = useState(true);
  const [sent, setSent] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<{ passed: number; failed: number; graded: number } | null>(
    null
  );

  const [mailboxes, setMailboxes] = useState<
    { integrationId: string; email: string; status: string }[]
  >([]);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("sending_accounts")
        .select("integration_id, email, status, updated_at")
        .in("provider", ["google", "gmail"])
        .not("integration_id", "is", null)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      const list = (data ?? []).map((a) => ({
        integrationId: a.integration_id as string,
        email: a.email as string,
        status: (a.status as string) ?? "active",
      }));
      setMailboxes(list);
      setSelectedMailbox((prev) => {
        if (prev && list.some((m) => m.integrationId === prev)) return prev;
        const active = list.find((m) => m.status !== "paused" && m.status !== "disabled");
        return active?.integrationId ?? list[0]?.integrationId ?? "";
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const invokeTest = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("agent-test", {
      body: selectedMailbox ? { ...body, integrationRowId: selectedMailbox } : body,
    });

    if (error) throw error;
    const payload = data as {
      success: boolean;
      error?: string;
      code?: string | null;
      sendingAccountId?: string | null;
      results?: TestResult[];
      passed?: number;
      failed?: number;
      graded?: number;
      realReplies?: number;
      syncError?: string | null;
      subject?: string;
      body?: string;
      to?: string;
    };
    if (!payload?.success) {
      const err = new Error(payload?.error || "Request failed") as Error & {
        code?: string | null;
        sendingAccountId?: string | null;
      };
      err.code = payload?.code ?? null;
      err.sendingAccountId = payload?.sendingAccountId ?? null;
      throw err;
    }
    return payload;
  };

  const runTest = async () => {
    setRunning(true);
    setResults(null);
    try {
      const customReplies = custom
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((body, i) => ({ label: `Custom reply ${i + 1}`, body }));

      const payload = await invokeTest({ mode: "dry_run", customReplies, includeRealReplies });
      setResults(payload.results ?? []);
      setSummary({
        passed: payload.passed ?? 0,
        failed: payload.failed ?? 0,
        graded: payload.graded ?? 0,
      });
      if (payload.syncError) {
        toast.warning(`Live inbox couldn't be read: ${payload.syncError}`);
      }
      toast.success(
        `Test complete — ${payload.passed ?? 0}/${payload.graded ?? 0} classified as expected, ${payload.realReplies ?? 0} real replies analyzed. Nothing was sent.`
      );
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunning(false);
    }
  };

  const resumeMailbox = async (accountId: string) => {
    const { error } = await supabase
      .from("sending_accounts")
      .update({ status: "active", paused_reason: null })
      .eq("id", accountId);
    if (error) {
      toast.error(`Couldn't resume mailbox: ${error.message}`);
      return;
    }
    toast.success("Mailbox resumed. Try sending the test email again.");
  };

  const sendLive = async () => {
    setSending(true);
    try {
      const payload = await invokeTest({ mode: "live_send", testEmail: testEmail.trim() });
      setSent({ to: payload.to ?? testEmail, subject: payload.subject ?? "", body: payload.body ?? "" });
      toast.success(`Real email sent to ${payload.to}. Reply to it, then run "Check my replies".`);
    } catch (err) {
      const e = err as Error & { code?: string | null; sendingAccountId?: string | null };
      const message = e instanceof Error ? e.message : "Unknown error";
      if (e?.code === "account_paused" && e.sendingAccountId) {
        const accountId = e.sendingAccountId;
        toast.error(`Send failed: ${message}`, {
          action: { label: "Resume mailbox", onClick: () => resumeMailbox(accountId) },
          duration: 10000,
        });
      } else {
        toast.error(`Send failed: ${message}`);
      }
    } finally {
      setSending(false);
    }
  };


  const checkReplies = async () => {
    setChecking(true);
    setResults(null);
    try {
      const payload = await invokeTest({ mode: "live_check", testEmail: testEmail.trim() });
      setResults(payload.results ?? []);
      setSummary(null);
      toast.success(`${payload.realReplies ?? 0} real replies from ${testEmail} analyzed. Nothing was sent.`);
    } catch (err) {
      toast.error(`Check failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setChecking(false);
    }
  };

  const busy = running || sending || checking;

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
          <DialogTitle>Test the agent</DialogTitle>
          <DialogDescription>
            Runs your live classifier and reply generator against your saved configuration —
            your real objection responses, persona, value props and capability switches. You can
            also send a real campaign email to a burner inbox you control and have the agent
            analyze your actual replies. Nothing is auto-sent to prospects.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-4 space-y-3 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium">Live test to your own inbox (burner address)</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Sends a real first-touch email generated from your agent configuration, from your
              connected Gmail. Reply to it with each objection word for word, then check the
              replies to see how the agent classifies and responds.
            </p>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Send from</p>
              <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={mailboxes.length ? "Choose a mailbox" : "No connected mailboxes"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {mailboxes.map((m) => (
                    <SelectItem key={m.integrationId} value={m.integrationId}>
                      {m.email}
                      {m.status === "paused" || m.status === "disabled" ? ` (${m.status})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">

              <Input
                type="email"
                placeholder="burner@yourdomain.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <Button onClick={sendLive} disabled={busy || !testEmail.trim()} className="gap-2 shrink-0">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send real email
              </Button>
              <Button
                variant="outline"
                onClick={checkReplies}
                disabled={busy || !testEmail.trim()}
                className="gap-2 shrink-0"
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Inbox className="w-4 h-4" />}
                Check my replies
              </Button>
            </div>
            {sent && (
              <Card className="p-3 bg-background/60">
                <p className="text-xs text-muted-foreground mb-1">Sent to {sent.to}</p>
                <p className="text-sm font-medium">{sent.subject}</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground mt-1">{sent.body}</p>
              </Card>
            )}
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-medium">Extra replies to test (one per line, optional)</p>
            <Textarea
              rows={3}
              placeholder={`Paste real replies here, one per line`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={includeRealReplies}
                onCheckedChange={(v) => setIncludeRealReplies(v === true)}
              />
              Also pull real unread replies from my connected inbox
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={runTest} disabled={busy} className="gap-2">
              {running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FlaskConical className="w-4 h-4" />
              )}
              {running ? "Running test…" : "Run test"}
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
