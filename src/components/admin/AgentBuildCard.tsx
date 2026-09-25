import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelHeader, PanelTitle, PanelDescription } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

/**
 * What the deployed agent-chat can actually do.
 *
 * Merging is not deploying: edge functions ship through Lovable, so a fix can
 * sit on main for hours while the running function is older. Working that out
 * by reading chat transcripts is slow and guessy, and it has been done more
 * than once. The function reports its own markers; this shows them.
 *
 * Absence is the useful signal. A marker missing from this list is a change
 * that is merged and not running.
 */
const EXPECTED: { marker: string; what: string }[] = [
  { marker: "continues-a-promised-turn", what: "Finishes a turn that said it was starting work" },
  { marker: "releases-run-claim-on-error", what: "A failed turn stops locking the conversation" },
  { marker: "says-when-it-stops-short", what: "Says it has stopped instead of claiming it is continuing" },
  { marker: "quiet-period-on-awaiting-reply", what: "\"No response\" means silence, not a null column" },
  { marker: "refuses-delete-and-redraft", what: "Refuses to delete drafts over a duplicate block" },
  { marker: "queues-overflow-batches", what: "Queues a batch bigger than the inline limit" },
  { marker: "asks-for-the-whole-list", what: "Takes every lead in one call instead of tens" },
  { marker: "skips-leads-that-have-drafts", what: "Skips leads that already have a draft instead of overwriting them" },
  { marker: "sizes-inline-batch-to-budget", what: "Queues the batch when the turn has no time left, rather than starting drafts it will cut off" },
  { marker: "reports-real-draft-totals", what: "Reports the drafts table's own count, not one the model added up" },
  { marker: "finishes-the-whole-outstanding-set", what: "Queues any lead the model skipped, so a batch of 82 finishes as 82" },
  { marker: "one-batch-job-per-turn", what: "One progress card for the whole batch instead of one per tool call" },
];

/**
 * What each mode means for the emails going out, in one line each.
 *
 * The panel below this one shows evaluations and failures, which read the same
 * in shadow as in assist. This is the line that says whether those decisions
 * reach the email.
 */
const MODES: Record<string, { label: string; what: string; tone: string }> = {
  off: {
    label: "off",
    what: "Nothing is evaluated and nothing reaches the emails.",
    tone: "text-muted-foreground",
  },
  shadow: {
    label: "shadow",
    what: "Leads are evaluated and saved. Emails are written exactly as they would be without it.",
    tone: "text-sky-400",
  },
  assist: {
    label: "assist",
    what: "Decisions reach the email generator as strategy. This is live, not a rehearsal.",
    tone: "text-amber-400",
  },
  unknown: {
    label: "unknown",
    what: "The function could not read its own mode. Treat this as assist until you know otherwise.",
    tone: "text-destructive",
  },
};

export const AgentBuildCard = () => {
  const [mode, setMode] = useState<string | null>(null);
  const [markers, setMarkers] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("agent-chat", {
        body: { action: "build" },
      });
      if (err) {
        // supabase-js turns any non-2xx into a generic error; the real body is
        // on err.context. An older deployment has no build branch and answers
        // 400 "Missing threadId" — that is the answer, not a failure.
        const ctx = (err as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
        let body: { error?: string } | null = null;
        try {
          body = (await ctx?.json?.()) as { error?: string } | null;
        } catch {
          body = null;
        }
        if (ctx?.status === 400 && body?.error === "Missing threadId") {
          setMode(null);
          setMarkers([]);
          return;
        }
        throw new Error(body?.error || (ctx?.status ? `agent-chat returned ${ctx.status}` : err.message));
      }
      const body = data as { build?: string[]; leadIntelligence?: string } | null;
      const build = body?.build;
      setMode(typeof body?.leadIntelligence === "string" ? body.leadIntelligence : null);
      // An older deployment has no build branch at all, so it falls through to
      // the missing-threadId error. That answer is itself the answer.
      setMarkers(Array.isArray(build) ? build : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach agent-chat");
      setMarkers(null);
      setMode(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const missing = markers ? EXPECTED.filter((e) => !markers.includes(e.marker)) : [];

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Deployed agent build</PanelTitle>
        <PanelDescription>
          What the running agent-chat can do, asked of the function itself. Anything listed as
          not deployed is merged and waiting on a redeploy.
        </PanelDescription>
      </PanelHeader>
      <PanelBody className="space-y-3">
        {loading && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Asking the function…
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {markers && markers.length === 0 && !loading && (
          <p className="text-sm text-amber-400">
            This deployment does not report a build at all, so it predates the probe. Everything
            below is waiting on a redeploy of agent-chat.
          </p>
        )}

        {mode && MODES[mode] && (
          <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
            <p className="text-sm">
              Lead intelligence: <span className={MODES[mode].tone}>{MODES[mode].label}</span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{MODES[mode].what}</p>
          </div>
        )}

        {markers && (
          <ul className="space-y-1.5">
            {EXPECTED.map(({ marker, what }) => {
              const live = markers.includes(marker);
              return (
                <li key={marker} className="flex items-start justify-between gap-3 text-sm">
                  <span className={live ? "" : "text-muted-foreground"}>{what}</span>
                  <Badge variant={live ? "secondary" : "outline"} className="shrink-0">
                    {live ? "deployed" : "not deployed"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}

        {markers && missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {missing.length} change{missing.length === 1 ? "" : "s"} merged and not running. Redeploy
            agent-chat from Lovable.
          </p>
        )}

        <Button size="sm" variant="outline" onClick={check} disabled={loading}>
          Check again
        </Button>
      </PanelBody>
    </Panel>
  );
};
