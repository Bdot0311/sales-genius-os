import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const GENERIC_PHASES = [
  "Reading your request",
  "Pulling the records it needs",
  "Working through the details",
  "Double-checking the result",
];

/**
 * Task-shaped step lists. The first matching rule wins, so the checklist
 * describes the work the user actually asked for instead of a generic script.
 */
const TASK_RULES: { test: RegExp; label: string; phases: string[] }[] = [
  {
    test: /\b(delete|remove|clear|wipe|discard|trash)\b/i,
    label: "Deleting what you asked for",
    phases: [
      "Reading your delete request",
      "Finding the matching records",
      "Deleting them",
      "Confirming they're gone",
    ],
  },
  {
    test: /\b(schedule|send later|9\s?am|tomorrow|queue)\b/i,
    label: "Scheduling your emails",
    phases: [
      "Reading your schedule request",
      "Picking the right drafts",
      "Setting send times in your timezone",
      "Confirming the queue",
    ],
  },
  {
    test: /\b(send|blast|fire off|email them|reply)\b/i,
    label: "Sending your emails",
    phases: [
      "Reading your send request",
      "Choosing the mailbox to send from",
      "Checking the drafts before send",
      "Sending and logging each one",
    ],
  },
  {
    test: /\b(draft|write|compose|rewrite|personali[sz]e)\b/i,
    label: "Writing your emails",
    phases: [
      "Reading your brief",
      "Pulling lead and company context",
      "Writing in your voice",
      "Checking quality and details",
    ],
  },
  {
    test: /\b(find|search|source|prospect|leads?|companies|company)\b/i,
    label: "Finding leads",
    phases: [
      "Reading your search criteria",
      "Searching the lead network",
      "Filtering against your ICP",
      "Saving the matches",
    ],
  },
  {
    test: /\b(enrich|verify|email address|phone|score|scoring)\b/i,
    label: "Enriching your leads",
    phases: [
      "Reading your enrichment request",
      "Looking up each contact",
      "Verifying emails",
      "Scoring against your ICP",
    ],
  },
  {
    test: /\b(update|change|set|label|stage|tag|move)\b/i,
    label: "Updating your records",
    phases: [
      "Reading your update request",
      "Finding the records to change",
      "Applying the changes",
      "Confirming what changed",
    ],
  },
  {
    test: /\b(how many|report|stats|analytics|open rate|reply rate|performance|show|list)\b/i,
    label: "Pulling your numbers",
    phases: [
      "Reading your question",
      "Querying your account data",
      "Crunching the numbers",
      "Writing up the answer",
    ],
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
}

/**
 * Live status card shown while the AI SDR turn is running. Agent turns can take
 * a while (multi-step tool chains), so this shows a real step checklist with
 * elapsed time instead of a static "Working on it…".
 */
export const AgentWorkingIndicator = ({
  request,
  pass = 0,
}: AgentWorkingIndicatorProps) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const { heading, phases } = useMemo(() => {
    const rule = request
      ? TASK_RULES.find((r) => r.test.test(request))
      : undefined;
    return {
      heading: rule?.label ?? "Working on it",
      phases: [...(rule?.phases ?? GENERIC_PHASES), "Wrapping up"],
    };
  }, [request]);

  const summary = summarize(request);

  // Slow, believable step progression.
  const phase = Math.min(phases.length - 1, Math.floor(seconds / 4));
  const progress = Math.min(95, 8 + seconds * 5);

  // Show the current step plus the two before it so the card stays compact.
  const visible = phases.slice(Math.max(0, phase - 2), phase + 1);
  const firstVisibleIndex = Math.max(0, phase - 2);

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

            <ul className="space-y-1.5">
              {visible.map((label, i) => {
                const index = firstVisibleIndex + i;
                const isCurrent = index === phase;
                return (
                  <li
                    key={label}
                    className={cn(
                      "flex items-center gap-2 text-xs transition-opacity",
                      isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground/70",
                    )}
                  >
                    {isCurrent ? (
                      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
                    ) : (
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                    )}
                    <span className="truncate">
                      {label}
                      {isCurrent ? "…" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <p className="text-[11px] leading-snug text-muted-foreground/70">
              {pass > 0
                ? "Big batch — picking up where the last pass stopped."
                : "Running real steps on your account, not a canned animation."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
