import { useEffect, useState } from "react";
import { Bot, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASES = [
  "Reading your request",
  "Pulling up your leads",
  "Checking enrichment and scores",
  "Writing in your voice",
  "Double-checking the details",
  "Almost there",
];

/**
 * Live status card shown while the AI SDR turn is running. Agent turns can take
 * a while (multi-step tool chains), so this shows a real step checklist with
 * elapsed time instead of a static "Working on it…".
 */
export const AgentWorkingIndicator = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  // Slow, believable step progression.
  const phase = Math.min(PHASES.length - 1, Math.floor(seconds / 4));
  const progress = Math.min(95, 8 + seconds * 5);

  // Show the current step plus the two before it so the card stays compact.
  const visible = PHASES.slice(Math.max(0, phase - 2), phase + 1);
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
              <span className="bg-[linear-gradient(90deg,hsl(var(--muted-foreground))_0%,hsl(var(--foreground))_45%,hsl(var(--muted-foreground))_90%)] bg-[length:200%_auto] bg-clip-text text-sm font-semibold text-transparent animate-shiny">
                Working on it
              </span>
              <span className="flex-shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                {seconds}s
              </span>
            </div>

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
              Running real steps on your account — enriching, scoring and
              drafting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
