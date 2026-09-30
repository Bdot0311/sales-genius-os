import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHeader, EmptyState } from "@/components/dashboard/Panel";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_LABELS, type ChangelogTag } from "@/lib/changelog";
import { useChangelog } from "@/hooks/use-changelog";
import { useWhatsNew } from "@/hooks/use-whats-new";

/**
 * Tag colour carries meaning here, so it is the one place on this page with
 * more than one hue. Billing is the loudest because a change to what somebody
 * is charged is the one thing they must not scroll past.
 */
const TAG_STYLES: Record<ChangelogTag, string> = {
  billing: "border-amber-400/40 bg-amber-400/10 text-amber-400",
  new: "border-primary/40 bg-primary/10 text-primary",
  improved: "border-border/60 bg-muted/40 text-muted-foreground",
  fixed: "border-border/60 bg-muted/40 text-muted-foreground",
};

const ROADMAP_STATUS: Record<string, { label: string; className: string }> = {
  building: { label: "Building now", className: "text-primary" },
  next: { label: "Up next", className: "text-foreground/70" },
  exploring: { label: "Exploring", className: "text-muted-foreground/70" },
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

type Filter = "all" | ChangelogTag;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "new", label: "New" },
  { value: "improved", label: "Improved" },
  { value: "fixed", label: "Fixed" },
  { value: "billing", label: "Billing" },
];

/**
 * What's new.
 *
 * The first version was a stack of cards, one per merged branch, in date order,
 * with no way to filter and no mention of what was coming — which is the half
 * people open a changelog to find. Three changes:
 *
 * "Coming next" is pinned above the history, because a customer checking
 * whether the thing they asked for is being worked on should not have to read
 * six weeks of releases to find out.
 *
 * The filter exists because this list only grows. At five entries you scroll
 * it; at fifty you need to be able to ask "what changed about billing".
 *
 * And an entry the customer has not seen is marked as such. The header dot told
 * them something was new and then the page gave them no way to tell which part.
 */
const WhatsNew = () => {
  const { markSeen, seenDate } = useWhatsNew();
  const { entries: published, roadmap, latestDate } = useChangelog();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  // Captured once, when the first real answer arrives — not on mount, when the
  // list is still the fallback, and not after markSeen, which would clear the
  // marks in the same frame the reader is looking for them.
  const [unreadAtArrival, setUnreadAtArrival] = useState<number | null>(null);
  // The date they had read up to when they arrived. Marks are compared by date
  // rather than row position, so filtering the list cannot move them onto the
  // wrong entries.
  const [seenAtArrival, setSeenAtArrival] = useState<string | null>(null);
  useEffect(() => {
    if (unreadAtArrival === null && published.length > 0) {
      setUnreadAtArrival(published.filter((e) => e.date > seenDate).length);
      setSeenAtArrival(seenDate);
    }
  }, [published, seenDate, unreadAtArrival]);

  // Marked read against what is actually on the page. Stamping the file's date
  // would mark entries read that had not been published yet.
  useEffect(() => {
    if (latestDate) markSeen(latestDate);
  }, [markSeen, latestDate]);

  const entries = useMemo(() => {
    if (filter === "all") return published;
    return published
      .map((entry) => ({ ...entry, items: entry.items.filter((i) => i.tag === filter) }))
      .filter((entry) => entry.items.length > 0);
  }, [filter, published]);

  return (
    <DashboardLayout>
      <title>What's New | OutReign</title>
      <meta
        name="description"
        content="Everything we've shipped in OutReign recently, plus what's coming next."
      />

      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "What's new" }]}
        title="What's new"
        description="Everything we've shipped, newest first, and what's being built next."
      />

      <div className="mx-auto w-full max-w-3xl space-y-4 pt-4">
        {/* Pinned above the history on purpose. */}
        <Panel>
          <PanelHeader title="Coming next" meta="no dates, on purpose" />
          <div>
            {roadmap.map((item, i) => {
              const status = ROADMAP_STATUS[item.status] ?? ROADMAP_STATUS.exploring;
              return (
                <div
                  key={item.title}
                  className={cn("px-4 py-3.5 sm:px-5", i > 0 && "border-t border-border/30")}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <p className="text-[0.8125rem] font-medium text-foreground">{item.title}</p>
                    <span className={cn("text-[0.625rem] uppercase tracking-[0.1em]", status.className)}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Panel>

        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-[0.6875rem] transition-colors",
                filter === f.value
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {entries.length === 0 ? (
          <EmptyState
            title="Nothing under that filter yet"
            body="Try another one, or read everything."
          />
        ) : (
          entries.map((entry) => (
            <Panel key={entry.id} id={entry.id}>
              <div className="border-b border-border/30 px-4 py-3 sm:px-5">
                <h2 className="text-[0.875rem] font-medium leading-snug text-foreground">{entry.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[0.6875rem] text-muted-foreground">{formatDate(entry.date)}</span>
                  {seenAtArrival !== null && entry.date > seenAtArrival && (
                    <span className="text-[0.625rem] uppercase tracking-[0.1em] text-primary">New to you</span>
                  )}
                </div>
              </div>
              <p className="px-4 py-3 text-[0.8125rem] leading-relaxed text-muted-foreground sm:px-5">
                {entry.summary}
              </p>
              <div className="border-t border-border/30">
                {entry.items.map((item, i) => {
                  const body = (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <p className="text-[0.8125rem] font-medium text-foreground">{item.title}</p>
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-px text-[0.5625rem] uppercase tracking-[0.08em]",
                            TAG_STYLES[item.tag],
                          )}
                        >
                          {TAG_LABELS[item.tag]}
                        </span>
                      </div>
                      <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </>
                  );
                  const rowClass = cn("px-4 py-3 sm:px-5", i > 0 && "border-t border-border/30");
                  // An entry you cannot click is an announcement, not a feature.
                  return item.href ? (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => navigate(item.href!)}
                      className={cn(rowClass, "group flex w-full items-start gap-3 text-left transition-colors hover:bg-primary/5")}
                    >
                      <span className="min-w-0 flex-1">{body}</span>
                      <ArrowRight
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div key={item.title} className={rowClass}>
                      {body}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))
        )}
      </div>
    </DashboardLayout>
  );
};

export default WhatsNew;
