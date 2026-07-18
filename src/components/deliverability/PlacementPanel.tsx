import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [status, setStatus] = useState<"idle" | "running" | "done" | "unconfigured">("idle");
  const [gmail, setGmail] = useState<Gmail>("pending");
  const [testId, setTestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setStatus("running");
      toast.success("Test email sent to the seed inbox. Checking placement…");
      // Give it a moment to arrive, then auto-check once (silently — the manual
      // "Check again" button surfaces errors; the background check shouldn't).
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => collect(res.testId, true), 10000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Placement test failed";
      if (!mounted.current) return;
      if (msg.includes("seed_not_configured") || msg.toLowerCase().includes("seed inbox")) {
        setStatus("unconfigured");
      } else {
        toast.error(msg);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const collect = async (id: string, silent = false) => {
    if (mounted.current) setBusy(true);
    try {
      const res = await collectPlacementTest(id);
      if (!mounted.current) return;
      setGmail(res.gmail);
      if (res.gmail !== "pending" && res.gmail !== "missing") setStatus("done");
    } catch (e) {
      if (mounted.current && !silent) toast.error(e instanceof Error ? e.message : "Could not read placement");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Inbox placement test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "unconfigured" ? (
          <p className="text-sm text-muted-foreground">
            Placement testing needs a Gmail seed inbox to measure against. It isn't configured yet, so
            no results are shown (rather than a made-up number). Add the seed inbox credentials to
            enable real Gmail placement; Outlook and Yahoo need their own seed accounts.
          </p>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sending account to test from.</p>
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
              {testId && (
                <Button size="sm" variant="outline" onClick={() => collect(testId)} disabled={busy}>
                  Check again
                </Button>
              )}
            </div>

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
      </CardContent>
    </Card>
  );
};
