import { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The dashboard's surfaces, in one place.
 *
 * Every page had built its own. The same region appeared as a shadcn `Card` on
 * one page, a hand-rolled `rounded-lg border` on the next, and a tinted
 * `border-primary/20 bg-primary/5` box on a third, with padding ranging from
 * p-3 to p-6 and type running from text-xs to text-2xl for the same job. That
 * is what reads as assembled rather than designed: not any one page being
 * wrong, but no two agreeing.
 *
 * These are the shapes the lead search settled on:
 *
 *   Panel        one bordered surface, optionally with a header strip and a
 *                meta strip along the bottom edge
 *   SplitPanes   two to four regions sharing one surface, divided by hairlines
 *                rather than floating as separate cards
 *   MetricStrip  numbers in that same split, with room for what each means
 *
 * The type scale is fixed here too, because a scale only exists if everything
 * uses it: 16 for content, 13 for a title, 11 for chrome, 10 for a section
 * label. Flat type at generous spacing is the other half of what makes a page
 * read as a form rather than a tool.
 */

const SURFACE = "overflow-hidden rounded-xl border border-border/50 bg-card";
const ELEVATION = "shadow-[0_18px_44px_-30px_hsl(0_0%_0%/0.9)]";

export const Panel = ({
  children,
  className,
  flat,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  /** Drop the shadow for a panel that sits inside another region. */
  flat?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) => (
  // The rest of a div's attributes pass through, so a panel that reports a
  // changing state can carry role="status" and aria-live without that having to
  // become a prop here for every attribute a page turns out to need.
  <div className={cn(SURFACE, !flat && ELEVATION, className)} {...rest}>
    {children}
  </div>
);

/**
 * A panel's header strip.
 *
 * Titles sit at 13px, not 18 or 24: a panel heading is a label for what is
 * below it, and competing with the content it labels is what made pages read as
 * a stack of announcements.
 */
export const PanelHeader = ({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  /** A count, a timestamp, a state — sits beside the title, quieter. */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/40 px-4 py-2.5 sm:px-5",
      className,
    )}
  >
    <div className="flex min-w-0 items-baseline gap-2.5">
      <h2 className="truncate text-[0.8125rem] font-medium text-foreground">{title}</h2>
      {meta ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{meta}</span> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

export const PanelBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("p-4 sm:p-5", className)}>{children}</div>
);

/**
 * The strip along a panel's bottom edge.
 *
 * For the state that belongs to the panel but is not its content: an
 * allowance, a last-checked time, a count. On the lead search this is where the
 * credit meter went, on the theory that the screen which spends something
 * should be the screen that shows it.
 */
export const PanelFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      "flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/40 bg-muted/15 px-4 py-2 text-[0.6875rem] text-muted-foreground sm:px-5",
      className,
    )}
  >
    {children}
  </div>
);

/**
 * Regions sharing one surface, divided by hairlines.
 *
 * The alternative everything reached for was a grid of same-sized cards, each
 * with an icon, a heading and a line of text. Three of those in a row is the
 * single most recognisable generated-interface shape there is, and it costs a
 * border and a shadow per item to say less than one divided surface does.
 */
export const SplitPanes = ({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode[];
  columns?: 2 | 3 | 4;
  className?: string;
}) => {
  // Written out rather than interpolated: Tailwind only ships the classes it
  // can see in the source, so building the class name by interpolating the
  // count into it compiles to no CSS at all and the grid silently stays 1-up.
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={cn("grid overflow-hidden rounded-xl border border-border/30", cols, className)}>
      {children.map((child, i) => (
        <div
          key={i}
          className={cn(
            "px-4 py-3.5 sm:px-5 sm:py-4",
            // Hairlines between, never around: the outer border is the group's.
            i > 0 && "border-t border-border/30 sm:border-l sm:border-t-0",
            // At four across the wrap point differs, so the top rule comes back
            // for the second row.
            columns === 4 && i > 0 && "sm:border-t-0",
            columns === 4 && i >= 2 && "lg:border-t-0",
            columns === 4 && i === 2 && "sm:border-l-0 sm:border-t lg:border-l lg:border-t-0",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

export interface Metric {
  label: string;
  value: ReactNode;
  /** What the number means or what to do about it. A number alone is trivia. */
  note?: ReactNode;
  onClick?: () => void;
}

/**
 * Numbers across one divided surface.
 *
 * Deliberately not the hero-metric template — no gradient, no accent chip, no
 * coloured icon per tile. Four differently-coloured icons is decoration chosen
 * because the tiles looked bare, and it makes four unrelated numbers look like
 * a rainbow legend. The room goes to `note` instead, so each number can say
 * what it means.
 */
export const MetricStrip = ({
  metrics,
  columns = 4,
  className,
}: {
  metrics: Metric[];
  /** How many sit across the strip once there is room. */
  columns?: 3 | 4 | 5;
  className?: string;
}) => (
  <div
    className={cn(
      "grid grid-cols-2 overflow-hidden rounded-xl border border-border/30",
      // Written out, never interpolated: Tailwind ships only the classes it can
      // see in the source, so a class name built from the count compiles to no
      // CSS at all and the strip silently stays 2-up.
      { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[columns],
      className,
    )}
  >
    {metrics.map((m, i) => {
      const inner = (
        <>
          <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
            {m.label}
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">{m.value}</p>
          {m.note ? <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">{m.note}</p> : null}
        </>
      );
      const border = cn(
        // Two across until there is room: rule down the middle, rule between
        // rows.
        i % 2 === 1 && "border-l border-border/30",
        i >= 2 && "border-t border-border/30",
        // In one row it is rules between neighbours and nothing else.
        "lg:border-t-0",
        i > 0 && "lg:border-l lg:border-border/30",
      );
      return m.onClick ? (
        <button
          key={m.label}
          type="button"
          onClick={m.onClick}
          className={cn("px-4 py-3.5 text-left transition-colors hover:bg-primary/5 sm:px-5 sm:py-4", border)}
        >
          {inner}
        </button>
      ) : (
        <div key={m.label} className={cn("px-4 py-3.5 sm:px-5 sm:py-4", border)}>
          {inner}
        </div>
      );
    })}
  </div>
);

/**
 * The three states that are not content: gated, empty, broken.
 *
 * Every page built its own, and they converged on the same shape without ever
 * agreeing on it: a 48px icon, or a 32px icon inside a tinted circle, centred
 * over a heading and a paragraph, on a dashed border or a solid one, at py-8 or
 * py-10 or py-12. The icon is the part worth dropping — a padlock over "this is
 * a Growth feature" and an inbox over "no conversations yet" illustrate the
 * sentence directly beneath them, which is decoration standing in for an
 * answer.
 *
 * What the reader needs is what state they are in, why, and what to do. That is
 * three pieces of text and at most one button.
 */
export const EmptyState = ({
  title,
  body,
  action,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <Panel className={className}>
    <div className="px-5 py-10 text-center">
      <p className="text-[0.8125rem] font-medium text-foreground">{title}</p>
      {body ? (
        <p className="mx-auto mt-1.5 max-w-md text-[0.6875rem] leading-relaxed text-muted-foreground">{body}</p>
      ) : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  </Panel>
);

/**
 * The label above a region that is not itself a panel.
 *
 * One size, one weight, one tracking, everywhere — the same label was appearing
 * as text-[11px] uppercase tracking-widest on one page and text-sm font-medium
 * on the next.
 */
export const SectionLabel = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p
    className={cn(
      "text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60",
      className,
    )}
  >
    {children}
  </p>
);
