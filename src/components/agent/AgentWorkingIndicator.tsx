import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
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
 * Animated placeholder shown while the AI SDR turn is running. Agent turns can
 * take a while (multi-step tool chains), so this gives the user a live sense of
 * progress instead of a static "Working on it…".
 */
export const AgentWorkingIndicator = () => {
  const [phase, setPhase] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    // Slow down as the turn gets longer so the copy stays believable.
    const next = Math.min(PHASES.length - 1, Math.floor(seconds / 4));
    setPhase(next);
  }, [seconds]);

  return (
    <div className="flex gap-3">
      <div className="relative flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
        <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            key={phase}
            className="animate-fade-in bg-[linear-gradient(90deg,hsl(var(--muted-foreground))_0%,hsl(var(--foreground))_45%,hsl(var(--muted-foreground))_90%)] bg-[length:200%_auto] bg-clip-text text-sm font-medium text-transparent animate-shiny"
          >
            {PHASES[phase]}…
          </span>
          <span className="text-xs tabular-nums text-muted-foreground/60">
            {seconds}s
          </span>
        </div>

        {/* Skeleton lines that hint an answer is forming */}
        <div className="space-y-2 max-w-md">
          {[92, 74, 55].map((w, i) => (
            <div
              key={w}
              className={cn(
                "h-2.5 rounded-full bg-muted/60 animate-pulse",
              )}
              style={{ width: `${w}%`, animationDelay: `${i * 180}ms` }}
            />
          ))}
        </div>

        <div className="h-1 w-full max-w-md overflow-hidden rounded-full bg-muted/40">
          <div className="h-full rounded-full bg-primary/70 transition-all duration-1000 ease-out" style={{ width: `${Math.min(95, 12 + seconds * 6)}%` }} />
        </div>

        <p className="text-xs text-muted-foreground/70">
          The agent runs real steps on your account — enriching, scoring and drafting — so this can take a moment.
        </p>
      </div>
    </div>
  );
};
