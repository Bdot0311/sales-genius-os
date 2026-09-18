import { useEffect, useState } from "react";
import type { ExternalLeadFilters } from "@/hooks/use-external-leads";
import { describeFilters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";

/**
 * The field is an explicit grid rather than an auto-filling one.
 *
 * With auto-fill nothing on this side knows how many columns a screen produced,
 * so a mark's delay could not be tied to where it actually sits. The pass and
 * the lighting then ran on separate clocks and the result read as two unrelated
 * animations happening near each other. A fixed column count means a mark's
 * delay is its horizontal position, the pass crosses in exactly one cycle, and
 * a mark lights because the edge reached it.
 */
const COLUMNS = 24;
const ROWS = 12;
const MARKS = COLUMNS * ROWS;
const CYCLE_MS = 3200;

/**
 * Which marks the pass keeps.
 *
 * Deterministic, so a mark does not change its mind between renders, and
 * sparse, because that is the shape of the thing being drawn: most of a
 * population is not your customer. Coprime with the column count, so the kept
 * ones scatter instead of forming a stripe.
 */
const isKept = (i: number) => (i * 7) % 29 === 0;

/**
 * Three sizes, assigned deterministically. A field of identical marks reads as
 * a table; an uneven one reads as a crowd.
 */
const sizeOf = (i: number) => [5, 6, 7][(i * 13) % 3];

const elapsedLabel = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/**
 * The wait between asking for leads and getting them.
 *
 * It was placeholder rows: draw the results before they exist, which is what
 * every other tool in this category does, down to the pulse rate. It said
 * nothing, and a slow search looked exactly like a stuck one.
 *
 * The search is a single upstream call, so there are no intermediate stages to
 * report and no percentage that would not be invented. But there is a true
 * thing happening, and it is the interesting part of the product: a very large
 * population is being narrowed to the few people who match a sentence someone
 * typed. Nobody draws that. Everybody draws a spinner.
 *
 * So the field is the population, the edge travelling across it is the search,
 * and a mark it keeps lifts out of the plane with a bloom while the rest fall
 * away. The far rows sit dimmer and smaller than the near ones, so the field
 * reads as depth rather than as a heatmap.
 *
 * It asserts no count, no percentage and no stage — every number on this screen
 * is real, and the motion is texture over a true shape rather than a progress
 * bar pretending to know something.
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
        className="relative mt-5 overflow-hidden rounded-lg border border-border/40 bg-[radial-gradient(120%_100%_at_50%_120%,hsl(var(--primary)/0.07),transparent_70%)] px-3 py-4"
        aria-hidden
      >
        <div
          className="relative grid grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-x-1 gap-y-2"
          style={{ perspective: "600px" }}
        >
          {Array.from({ length: MARKS }).map((_, i) => {
            const column = i % COLUMNS;
            const row = Math.floor(i / COLUMNS);
            const size = sizeOf(i);
            return (
              <span
                key={i}
                className={cn(
                  "w-full justify-self-center rounded-[1.5px]",
                  isKept(i)
                    ? "bg-primary animate-sift-lock"
                    : "bg-muted-foreground animate-sift-dim",
                  "motion-reduce:animate-none motion-reduce:opacity-20",
                )}
                style={{
                  height: `${size}px`,
                  // The delay is the mark's horizontal position, so the edge
                  // reaching it and it lighting are the same event. The row
                  // offset keeps the wavefront from being a perfectly straight
                  // vertical line.
                  animationDelay: `${((column + row * 0.35) / COLUMNS) * CYCLE_MS}ms`,
                  // Far rows sit back: dimmer, so the field has depth instead of
                  // reading as a flat table of cells.
                  opacity: 0.45 + (row / ROWS) * 0.55,
                }}
              />
            );
          })}
        </div>

        {/* The pass: a bright leading edge with a long wake behind it, crossing
            in exactly one cycle so a mark lights as the edge arrives. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="h-full w-[9%] bg-[linear-gradient(90deg,transparent_0%,hsl(var(--primary)/0.04)_45%,hsl(var(--primary)/0.18)_82%,hsl(var(--primary)/0.7)_97%,transparent_100%)] animate-sweep motion-reduce:hidden" />
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
