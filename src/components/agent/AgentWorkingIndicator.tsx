import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { labelForTool, type AgentRunStep } from "@/hooks/use-agent-run-steps";

/**
 * A heading and a footer note per kind of request. The first matching rule
 * wins.
 *
 * These used to carry a step list too, which the card animated on a timer as
 * though it were progress. The steps now come from the tools that actually
 * ran; what survives here is only the framing around them.
 */
const TASK_RULES: {
  test: RegExp;
  label: string;
  /** Footer line describing this specific kind of work. */
  note: string;
}[] = [
  {
    test: /\b(delete|remove|clear|wipe|discard|trash)\b/i,
    label: "Deleting what you asked for",
    note: "Only the records you named get removed — nothing else is touched.",
  },
  {
    test: /\b(schedule|send later|9\s?am|tomorrow|queue)\b/i,
    label: "Scheduling your emails",
    note: "Send times are set in your timezone, so nothing goes out at odd hours.",
  },
  {
    test: /\b(send|blast|fire off|email them|reply)\b/i,
    label: "Sending your emails",
    note: "Each send is checked against the mailbox and logged as it goes out.",
  },
  {
    test: /\b(draft|write|compose|rewrite|personali[sz]e)\b/i,
    label: "Writing your emails",
    note: "Each draft is grounded in real lead context — no invented numbers.",
  },
  {
    test: /\b(find|search|source|prospect|leads?|companies|company)\b/i,
    label: "Finding leads",
    note: "Anyone already in your account is skipped, so results stay fresh.",
  },
  {
    test: /\b(enrich|verify|email address|phone|score|scoring)\b/i,
    label: "Enriching your leads",
    note: "Contact details are verified before they are saved to a lead.",
  },
  {
    test: /\b(update|change|set|label|stage|tag|move)\b/i,
    label: "Updating your records",
    note: "Changes are applied record by record, then confirmed back to you.",
  },
  {
    test: /\b(how many|report|stats|analytics|open rate|reply rate|performance|show|list)\b/i,
    label: "Pulling your numbers",
    note: "Figures come straight from your account data, not estimates.",
  },
];

const summarize = (request?: string | null) => {
  if (!request) return null;
  const clean = request.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > 90 ? `${clean.slice(0, 90)}…` : clean;
};

interface AgentWorkingIndicatorProps {
  /** The request the agent is currently working on. */
  request?: string | null;
  /** 0 for the first pass, >0 while auto-continuing a long batch. */
  pass?: number;
  /**
   * Tools that have actually finished this run, oldest first.
   *
   * When this has anything in it, it is what the card shows. The guessed
   * checklist below is only the first few seconds, before the first tool has
   * returned and there is genuinely nothing to report yet.
   */
  steps?: AgentRunStep[];
}

/**
 * Live status card shown while the AI SDR turn is running. Agent turns can take
 * a while (multi-step tool chains), so this shows a real step checklist with
 * elapsed time instead of a static "Working on it…".
 */
export const AgentWorkingIndicator = ({
  request,
  pass = 0,
  steps = [],
}: AgentWorkingIndicatorProps) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // The rule still supplies a heading and a footer note, which describe the
  // KIND of request. The step list it used to supply is gone: those steps are
  // read from what actually ran.
  const { heading, note } = useMemo(() => {
    const rule = request
      ? TASK_RULES.find((r) => r.test.test(request))
      : undefined;
    return {
      heading: rule?.label ?? "Working on it",
      note:
        rule?.note ??
        "Reading the request, pulling the records it needs, then acting on them.",
    };
  }, [request]);

  const summary = summarize(request);

  // Advances on completed steps, easing forward with time so a long single
  // step still looks alive. Never reaches 100 while the turn is running.
  const progress = Math.min(95, 10 + steps.length * 18 + Math.min(seconds, 20));


  return (
    <div className="flex gap-3">
      <div className="relative flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-primary/25 animate-ping" />
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-card/60 p-3.5 backdrop-blur-sm sm:p-4">
          {/* soft moving sheen */}
          <div className="pointer-events-none absolute -inset-px bg-[linear-gradient(115deg,transparent_35%,hsl(var(--primary)/0.08)_50%,transparent_65%)] bg-[length:250%_100%] animate-shiny" />

          <div className="relative space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate bg-[linear-gradient(90deg,hsl(var(--muted-foreground))_0%,hsl(var(--foreground))_45%,hsl(var(--muted-foreground))_90%)] bg-[length:200%_auto] bg-clip-text text-sm font-semibold text-transparent animate-shiny">
                {pass > 0 ? `${heading} — continuing` : heading}
              </span>
              <span className="flex-shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {seconds}s
              </span>
            </div>

            {summary && (
              <p className="rounded-md border border-border/50 bg-muted/30 px-2 py-1.5 text-[11px] italic leading-snug text-muted-foreground">
                “{summary}”
              </p>
            )}

            {steps.length > 0 ? (
              /* Real work. Each row is a tool that has finished, with what it
                 reported. The last three keep the card compact on mobile. */
              <ul className="space-y-1.5">
                {steps.slice(-3).map((step) => {
                  const failed = step.status === "error";
                  return (
                    <li key={step.id} className="flex items-start gap-2 text-xs">
                      {failed ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                      ) : (
                        <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                      )}
                      <span className="min-w-0">
                        <span className={failed ? "text-destructive" : "text-foreground"}>
                          {labelForTool(step.toolName)}
                        </span>
                        {step.detail && (
                          <span className="block truncate text-muted-foreground/70">
                            {step.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
                  <span className="truncate">Still working…</span>
                </li>
              </ul>
            ) : (
              /* Nothing has finished yet, so there is nothing real to show. */
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2 text-xs text-foreground">
                  <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
                  <span className="truncate">Reading your request…</span>
                </li>
              </ul>
            )}

            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground/70">
              {steps.length > 0
                ? `${steps.length} step${steps.length === 1 ? "" : "s"} done${pass > 0 ? " — continuing from where the last pass stopped" : ""}.`
                : pass > 0
                  ? `${note} Continuing from where the last pass stopped.`
                  : note}
            </p>

          </div>
        </div>
      </div>
    </div>
  );
};
