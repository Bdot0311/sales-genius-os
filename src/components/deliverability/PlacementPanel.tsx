import { useEffect, useRef, useState } from "react";
import { Panel, PanelBody } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Inbox, Ban, FolderOpen, HelpCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { startPlacementTest, collectPlacementTest } from "@/lib/deliverability-api";
import type { SendingAccount } from "@/lib/deliverability-db";

type Gmail = "inbox" | "spam" | "promotions" | "missing" | "pending";

const gmailBadge = (p: Gmail) => {
  switch (p) {
    case "inbox": return { icon: <Inbox className="h-3.5 w-3.5" />, cls: "border-green-500/40 text-green-500", label: "Inbox" };
    case "promotions": return { icon: <FolderOpen className="h-3.5 w-3.5" />, cls: "border-yellow-500/40 text-yellow-500", label: "Promotions" };
    case "spam": return { icon: <Ban className="h-3.5 w-3.5" />, cls: "border-destructive/40 text-destructive", label: "Spam" };
    case "missing": return { icon: <HelpCircle className="h-3.5 w-3.5" />, cls: "border-border text-muted-foreground", label: "Not delivered yet" };
    default: return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, cls: "border-border text-muted-foreground", label: "Checking…" };
  }
};

export const PlacementPanel = ({ accounts }: { accounts: SendingAccount[] }) => {
  const active = accounts.filter((a) => a.status === "active");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "not_found" | "unconfigured" | "error">("idle");
  const [gmail, setGmail] = useState<Gmail>("pending");
  const [testId, setTestId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  // Which inbox this test measures against. The function has always returned
  // it and nothing showed it, so the user watched a test run with no idea what
  // it was measuring — and when the seed failed, the whole feature read as
  // broken rather than one mailbox being unreadable.
  const [seedEmail, setSeedEmail] = useState<string>("");
  // A revoked seed token answers identically every time. Offering "Check
  // again" against it is offering a button that cannot work.
  const [terminal, setTerminal] = useState(false);


  // Guard against setState after unmount and clean up the pending auto-check
  // timer — a timeout firing on an unmounted panel is what could blank the page.
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const selected = active.find((a) => a.id === accountId) ?? active[0];

  const run = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await startPlacementTest(selected.id);
      if (!mounted.current) return;
      setTestId(res.testId);
      setGmail("pending");
      setErrorMsg("");
      setSeedEmail(res.seedEmail ?? "");
      setTerminal(false);
      setStatus("running");

      toast.success("Test email sent to the seed inbox. Checking placement…");
      // Poll until the message shows up, or until we have waited long enough to
      // say so honestly.
      //
      // This used to be a single check at ten seconds. Gmail has almost never
      // delivered AND indexed a message that fast, so the check came back
      // "pending", nothing rescheduled it, and the panel sat on "checking"
      // forever — the test had actually sent, and only the reading was stuck.
      if (timer.current) clearTimeout(timer.current);
      scheduleNextCheck(res.testId, 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Placement test failed";
      if (!mounted.current) return;
      if (msg.includes("seed_not_configured") || msg.toLowerCase().includes("seed inbox")) {
        // Render what the function actually said. The canned paragraph this
        // replaced told the reader to "add the seed inbox credentials", which
        // is an operator instruction about a secret they have no access to —
        // and it was shown for every seed problem, including ones they could
        // have fixed by connecting a second mailbox.
        setErrorMsg(msg);
        setStatus("unconfigured");
      } else {
        toast.error(msg);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // Backing off rather than hammering: delivery usually lands inside a minute,
  // but indexing can lag, and a fixed fast interval would spend a dozen reads
  // on the seed inbox to learn nothing. Totals roughly three minutes, after
  // which "we could not find it" is the honest answer.
  const CHECK_DELAYS_MS = [15_000, 20_000, 30_000, 45_000, 60_000];

  const scheduleNextCheck = (id: string, attempt: number) => {
    if (attempt >= CHECK_DELAYS_MS.length) {
      // Out of attempts and still nothing. Say so instead of spinning: the
      // send worked, the read did not, and the user can retry deliberately.
      if (mounted.current) setStatus("not_found");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => collect(id, true, attempt), CHECK_DELAYS_MS[attempt]);
  };

  const collect = async (id: string, silent = false, attempt: number | null = null) => {
    if (mounted.current) setBusy(true);
    try {
      const res = await collectPlacementTest(id);
      if (!mounted.current) return;
      setGmail(res.gmail);
      if (res.seedEmail) setSeedEmail(res.seedEmail);

      if (res.gmail !== "pending" && res.gmail !== "missing") {
        setStatus("done");
        if (timer.current) clearTimeout(timer.current);
        return;
      }

      // Still nothing. Keep polling only if this was an automatic check —
      // a manual "Check again" is one look, not the start of a new loop.
      if (attempt !== null) scheduleNextCheck(id, attempt + 1);
      else if (mounted.current) setStatus("not_found");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not read placement";
      if (!mounted.current) return;
      // A read we can never perform (seed mailbox unreadable / disconnected) is
      // terminal: retrying it just leaves the badge spinning forever, which is
      // exactly the bug this replaced. Surface it and stop.
      const unreadable = /could not be read|could not search|seed_unavailable|not configured|reconnect/i.test(msg);
      if (unreadable) {
        if (timer.current) clearTimeout(timer.current);
        setErrorMsg(msg);
        setStatus("error");
        setGmail("missing");
        setTerminal(true);
        if (!silent) toast.error(msg);
        return;
      }
      if (!silent) toast.error(msg);
      // A transient failure is not a verdict — keep the schedule alive.
      if (attempt !== null) scheduleNextCheck(id, attempt + 1);
    } finally {
      if (mounted.current) setBusy(false);
    }

  };

  return (
    <Panel>
      <PanelBody className="space-y-4">
        {status === "unconfigured" ? (
          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
            {errorMsg ||
              "Placement testing needs a second Gmail inbox to measure against, and there isn't one available. No results are shown rather than a made-up number. Outlook and Yahoo need their own seed accounts."}
          </p>
        ) : active.length === 0 ? (
          <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">No active sending account to test from.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {active.length > 1 && (
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {active.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              )}
              <Button size="sm" onClick={run} disabled={busy || status === "running"}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Run test
              </Button>
              {/* Hidden once the seed is unreadable for good: re-checking a
                  revoked token returns the identical error every time, so the
                  button was an invitation to watch nothing happen. */}
              {testId && !terminal && (
                <Button size="sm" variant="outline" onClick={() => collect(testId)} disabled={busy}>
                  Check again
                </Button>
              )}
            </div>

            {status === "not_found" && (
              <p className="text-sm text-amber-500">
                The test email sent, but it has not appeared in the seed inbox yet. That usually means
                delivery is slow rather than blocked — give it a minute and press Check again. If it
                never arrives, the message was most likely rejected before delivery.
              </p>
            )}

            {status === "error" && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}


            {seedEmail && status !== "idle" && (
              <p className="text-xs text-muted-foreground">
                Measuring against <span className="text-foreground">{seedEmail}</span>.
              </p>
            )}

            {status !== "idle" && (
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const b = gmailBadge(gmail);
                  return <Badge variant="outline" className={`gap-1 ${b.cls}`}>{b.icon} Gmail: {b.label}</Badge>;
                })()}
                <Badge variant="outline" className="gap-1 border-border text-muted-foreground" title="No Outlook seed inbox configured">Outlook: unsupported</Badge>
                <Badge variant="outline" className="gap-1 border-border text-muted-foreground" title="No Yahoo seed inbox configured">Yahoo: unsupported</Badge>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Sends a tagged test email to a seed inbox and reports where it landed. Gmail placement is
              real; Outlook/Yahoo require seed accounts on those providers.
            </p>
          </>
        )}
      </PanelBody>
    </Panel>
  );
};
