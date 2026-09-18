import { useEffect, useState } from "react";
import type { ExternalLeadFilters } from "@/hooks/use-external-leads";
import { describeFilters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";

/**
 * How many candidate marks the field carries, and how wide the wave is.
 *
 * The wave period is a count of marks rather than a column count: the grid
 * auto-fills, so nothing here knows how many columns a given screen produced.
 * A period that does not divide the row length is what makes the pass read as a
 * diagonal sweep across the field instead of a row of blinking lights, and it
 * lands differently on every screen width, which is the point.
 */
const MARKS = 156;
const WAVE = 23;
const WAVE_MS = 2400;

/**
 * Which marks the pass keeps.
 *
 * Deterministic, so a mark does not change its mind between renders, and
 * sparse, because that is the shape of the thing being drawn: most of a
 * population is not your customer.
 */
const isKept = (i: number) => (i * 7) % 11 === 0;

const elapsedLabel = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/**
 * The wait between asking for leads and getting them.
 *
 * It was five identical grey rows, then four. Both were the same idea — draw
 * the results before they exist — and that idea is what every other tool in
 * this category does, down to the pulse rate. It also says nothing: a slow
 * search looks exactly like a stuck one.
 *
 * The search is a single upstream call, so there are no intermediate stages to
 * report and no percentage that would not be invented. But there is a true
 * thing happening, and it is the interesting part of the product: a very large
 * population is being narrowed to the few people who match a sentence someone
 * typed. Nobody draws that. Everybody draws a spinner.
 *
 * So the field is the population, the pass travelling across it is the search,
 * and the marks that stand up and hold are the ones it keeps. It asserts no
 * count, no percentage and no stage — every number on this screen is real, and
 * the animation is texture over a true shape rather than a progress bar
 * pretending to know something.
 *
 * Above it, the criteria: the parser's reading of the sentence that was typed,
 * known on this side before the request leaves. That is how someone catches a
 * query that came out broader than they meant while it is still running, rather
 * than after the credit is spent. The clock counts real elapsed time.
 */
export const SearchingResults = ({ filters }: { filters: ExternalLeadFilters }) => {
  const criteria = describeFilters(filters);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div role="status" aria-label="Searching for leads">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[0.8125rem] font-medium text-foreground">
          {criteria.length > 0 ? "Searching for" : "Searching"}
        </p>
        <span
          className="shrink-0 tabular-nums text-[0.6875rem] text-muted-foreground/70"
          aria-hidden
        >
          {elapsedLabel(seconds)}
        </span>
      </div>

      {criteria.length > 0 && (
        <dl className="mt-2.5 space-y-1.5">
          {criteria.map((row) => (
            <div key={row.label} className="flex gap-3 text-[0.75rem] leading-relaxed">
              <dt className="w-[5.25rem] shrink-0 text-muted-foreground/60">{row.label}</dt>
              <dd className="min-w-0 flex-1 text-foreground/90">{row.values.join(", ")}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* The population, and the pass going through it. */}
      <div
        className="relative mt-5 min-h-[8.5rem] overflow-hidden rounded-lg border border-border/40 bg-background/40 p-3"
        aria-hidden
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(0.5rem,1fr))] gap-x-1.5 gap-y-2">
          {Array.from({ length: MARKS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-full origin-bottom rounded-[1px]",
                isKept(i)
                  ? "bg-primary animate-sift-lock"
                  : "bg-muted-foreground animate-sift-dim",
                "motion-reduce:animate-none motion-reduce:opacity-25",
              )}
              style={{ animationDelay: `${((i % WAVE) / WAVE) * WAVE_MS}ms` }}
            />
          ))}
        </div>

        {/* The pass itself, travelling over the field rather than under it. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="h-full w-16 bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.14),transparent)] animate-sweep motion-reduce:hidden" />
        </div>
      </div>

      <p className="mt-2.5 text-[0.6875rem] text-muted-foreground/70">
        {seconds >= 15
          ? "Still narrowing. Broad searches take longer than narrow ones."
          : "Narrowing to the people who match."}
      </p>
    </div>
  );
};
