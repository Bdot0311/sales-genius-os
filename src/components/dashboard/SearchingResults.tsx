import { useEffect, useState } from "react";
import type { ExternalLeadFilters } from "@/hooks/use-external-leads";
import { describeFilters } from "@/lib/lead-filters";
import { cn } from "@/lib/utils";

/**
 * Placeholder rows, each a different shape.
 *
 * Written out rather than generated, because Tailwind reads class names out of
 * the source and cannot see one assembled at runtime. Uneven widths are the
 * point: five identically proportioned rows read as a graphic, not as records
 * about to arrive.
 */
const ROWS: { name: string; detail: string }[] = [
  { name: "w-[38%]", detail: "w-[64%]" },
  { name: "w-[52%]", detail: "w-[43%]" },
  { name: "w-[31%]", detail: "w-[71%]" },
  { name: "w-[47%]", detail: "w-[56%]" },
];

/**
 * A travelling highlight rather than an opacity pulse.
 *
 * `bg-muted` at 4% lightness against a near-black page is a rectangle you can
 * barely see, and `animate-pulse` fades every row in unison, so the whole block
 * reads as one static object breathing. A highlight crossing each row on its
 * own offset reads as work in progress.
 */
const SHIMMER =
  "rounded bg-[linear-gradient(90deg,hsl(var(--muted))_0%,hsl(var(--muted-foreground)/0.22)_50%,hsl(var(--muted))_100%)] bg-[length:200%_100%] animate-shimmer motion-reduce:animate-none";

const elapsedLabel = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/**
 * The wait between asking for leads and getting them.
 *
 * It was five identical grey rows. Nothing to read, nothing to check, and no
 * way to tell a slow search from a stuck one — on a phone, where this is most
 * of the screen, it was the longest stretch of the product and the emptiest.
 *
 * The search is a single upstream call, so there are no intermediate stages to
 * report and no percentage that would not be invented. What there is, honestly,
 * is the criteria: the parser's reading of the sentence that was typed, known
 * on this side before the request leaves. Reading it back is how someone
 * catches a query that came out broader than they meant, while it is still
 * running rather than after the credit is spent. The clock counts real elapsed
 * time and claims nothing about what is left.
 *
 * The placeholder rows stay underneath, because the results still have to land
 * without the page jumping.
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
      {/* Indeterminate on purpose: one upstream call, no progress to report. */}
      <div className="relative h-px overflow-hidden rounded-full bg-border/40">
        <div
          className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-primary animate-sweep motion-reduce:hidden"
          aria-hidden
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <p className="text-[0.8125rem] font-medium text-foreground">
          {criteria.length > 0 ? "Searching for" : "Searching"}
        </p>
        <span className="shrink-0 tabular-nums text-[0.6875rem] text-muted-foreground/70" aria-hidden>
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

      {seconds >= 15 && (
        <p className="mt-3 text-[0.6875rem] text-muted-foreground/70">
          Still going. Broad searches take longer than narrow ones.
        </p>
      )}

      <div className="mt-5 space-y-2" aria-hidden>
        {ROWS.map((row, i) => (
          /* The delay goes on the shimmering elements themselves, never on the
             row: a delay set on something that runs no animation is dead CSS
             that reads as intent. Each row starts its pass a beat after the one
             above, so the block resolves top to bottom. */
          <div key={row.name} className="flex items-center gap-3 rounded-lg border border-border/40 p-3">
            <div className={cn("h-9 w-9 shrink-0 rounded-full", SHIMMER)} style={{ animationDelay: `${i * 160}ms` }} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={cn("h-3.5", row.name, SHIMMER)} style={{ animationDelay: `${i * 160}ms` }} />
              <div className={cn("h-3", row.detail, SHIMMER)} style={{ animationDelay: `${i * 160 + 80}ms` }} />
            </div>
            <div className={cn("hidden h-8 w-16 shrink-0 sm:block", SHIMMER)} style={{ animationDelay: `${i * 160}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
};
