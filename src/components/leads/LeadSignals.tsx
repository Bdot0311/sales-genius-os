/**
 * Five signals, five shapes.
 *
 * Every score on a Saved Leads row was a pill: tier, ICP fit, intent, AI
 * priority, next step. Seven of twelve columns looked identical, so the eye had
 * to read each one to learn what it was, and nothing read as more important
 * than anything else. That is most of why the page looked machine-made.
 *
 * The fix is not fewer signals. All five are used. It is that a grade, a
 * proportion, a score, an ordinal and a recommendation are five different kinds
 * of thing, and giving them one shape throws the difference away. Each gets the
 * encoding its data actually has:
 *
 *   grade          -> a letterform      (read as rank)
 *   proportion     -> a bar             (read by comparing down the column)
 *   score          -> tabular figures   (read as a number, aligned)
 *   ordinal        -> a stepped mark    (read as level, without words)
 *   recommendation -> quiet text        (read as a sentence, because it is one)
 *
 * One accent colour across all five. Nothing competes, because nothing shares
 * a shape.
 */

/** Tier: a grade. Leads the row like a rank, typographic, never a chip. */
export const TierMark = ({ tier }: { tier?: string | null }) => {
  const t = (tier ?? "").trim().toUpperCase();
  if (!t) {
    // Unscored is a real state, and reads as absence rather than a fourth grade.
    return (
      <span className="font-mono text-sm text-muted-foreground/30" title="Not scored yet" aria-label="Not scored yet">
        &ndash;
      </span>
    );
  }
  // Weight carries the grade, not hue: A alone gets the accent, so a screen of
  // B and C rows stays quiet instead of glowing at you.
  const strong = t === "A";
  return (
    <span
      title={`Tier ${t}`}
      className={`font-mono text-sm tabular-nums ${
        strong ? "font-semibold text-primary" : "font-medium text-foreground/70"
      }`}
    >
      {t}
    </span>
  );
};

/**
 * ICP fit: a proportion.
 *
 * A number in a box tells you one lead's fit. A bar, aligned in a column, tells
 * you this lead's fit against every other lead on screen without reading any of
 * them. That comparison is the job, so the bar is the encoding.
 */
export const FitBar = ({ score }: { score?: number | null }) => {
  if (score === null || score === undefined) {
    return <span className="text-xs text-muted-foreground/30" aria-label="No fit score">&ndash;</span>;
  }
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div className="flex items-center gap-2" title={`ICP fit ${pct}%`}>
      <div
        className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10"
        role="img"
        aria-label={`ICP fit ${pct} percent`}
      >
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-7 text-right font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
        {pct}
      </span>
    </div>
  );
};

/**
 * Intent: a score with a heat word.
 *
 * Right-aligned tabular figures, so a column of them compares vertically. That
 * is most of what makes a dense table fast and it costs nothing. The word only
 * appears once it means something: "Warm" on every row is a column saying the
 * same thing to everyone, which is the Enriched column's mistake.
 */
export const INTENT_HOT_THRESHOLD = 70;

export const IntentScore = ({
  score,
  label,
}: {
  score?: number | null;
  label?: string | null;
}) => {
  if (score === null || score === undefined) {
    return <span className="text-xs text-muted-foreground/30" aria-label="No intent score">&ndash;</span>;
  }
  const n = Math.round(score);
  const hot = n >= INTENT_HOT_THRESHOLD;
  return (
    <span
      className="flex items-baseline justify-end gap-1.5"
      title={label ? `Intent ${n} (${label})` : `Intent ${n}`}
    >
      <span
        className={`font-mono text-xs tabular-nums ${
          hot ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
      >
        {n}
      </span>
      {hot && label ? (
        <span className="text-[0.625rem] uppercase tracking-wide text-primary">{label}</span>
      ) : null}
    </span>
  );
};

/**
 * AI priority: an ordinal.
 *
 * Low, medium, high is a level, and a level reads faster as height than as a
 * word. Three steps filled to the value: legible at a glance, and it does not
 * widen the row by the length of the longest label.
 */
const PRIORITY_STEPS: Record<string, number> = { low: 1, medium: 2, high: 3 };

export const PriorityMark = ({ priority }: { priority?: string | null }) => {
  const key = (priority ?? "").trim().toLowerCase();
  const filled = PRIORITY_STEPS[key] ?? 0;
  if (!filled) {
    return (
      <span className="text-xs text-muted-foreground/30" title="Not evaluated yet" aria-label="Not evaluated yet">
        &ndash;
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-end gap-px"
      role="img"
      aria-label={`${key} priority`}
      title={`${key.charAt(0).toUpperCase()}${key.slice(1)} priority`}
    >
      {[1, 2, 3].map((step) => (
        <span
          key={step}
          className={`w-[3px] rounded-[1px] ${step <= filled ? "bg-primary/80" : "bg-foreground/10"}`}
          style={{ height: `${3 + step * 2}px` }}
        />
      ))}
    </span>
  );
};

/**
 * Next step: a recommendation.
 *
 * A sentence, so it is set as one. Making it a badge is what turned the
 * evaluation's actual output into one more thing to decode.
 */
export const NextStep = ({ step }: { step?: string | null }) => {
  const s = (step ?? "").trim();
  if (!s) {
    return <span className="text-xs text-muted-foreground/30" aria-label="No recommendation">&ndash;</span>;
  }
  const readable = s.replace(/_/g, " ");
  return (
    <span className="line-clamp-1 text-xs text-muted-foreground" title={readable}>
      {readable.charAt(0).toUpperCase()}
      {readable.slice(1)}
    </span>
  );
};

/**
 * Enrichment, by its absence.
 *
 * There was a column reading "Enriched" on every single row. A column whose
 * every value is identical carries no information and costs its width. The
 * information is in the exception, so only the exception is drawn.
 */
export const EnrichmentGap = ({ status }: { status?: string | null }) => {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "enriched" || s === "completed" || s === "success") return null;
  return (
    <span
      className="rounded border border-foreground/10 px-1 py-px text-[0.625rem] text-muted-foreground"
      title="This lead has not been enriched yet"
    >
      not enriched
    </span>
  );
};
