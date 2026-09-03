import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Gauge, Mail, MailX, PauseCircle, PlayCircle, ShieldAlert,
  ShieldCheck, Siren, Thermometer, TestTube,
} from "lucide-react";
import type { JSX } from "react";
import { useDeliverabilityEvents } from "@/hooks/use-deliverability-timeline";

/**
 * What changed, and when.
 *
 * A trend line on its own is a shape: the user watches placement fall away and
 * has to remember what they did that week. With the changes marked, the drop
 * starts on the day the daily limit tripled and the cause is on screen instead
 * of in their memory. This is the piece that turns a chart into an explanation.
 */

const EVENT_STYLE: Record<string, { icon: JSX.Element; tone: string; label: string }> = {
  mailbox_added:        { icon: <Mail className="h-3.5 w-3.5" />,          tone: "text-muted-foreground", label: "Mailbox" },
  mailbox_removed:      { icon: <MailX className="h-3.5 w-3.5" />,         tone: "text-muted-foreground", label: "Mailbox" },
  mailbox_paused:       { icon: <PauseCircle className="h-3.5 w-3.5" />,   tone: "text-orange-500",       label: "Paused" },
  mailbox_resumed:      { icon: <PlayCircle className="h-3.5 w-3.5" />,    tone: "text-green-500",        label: "Resumed" },
  warmup_started:       { icon: <Thermometer className="h-3.5 w-3.5" />,   tone: "text-muted-foreground", label: "Warmup" },
  warmup_completed:     { icon: <Thermometer className="h-3.5 w-3.5" />,   tone: "text-muted-foreground", label: "Warmup" },
  auth_record_changed:  { icon: <ShieldAlert className="h-3.5 w-3.5" />,   tone: "text-yellow-500",       label: "DNS" },
  dns_changed:          { icon: <ShieldCheck className="h-3.5 w-3.5" />,   tone: "text-yellow-500",       label: "DNS" },
  limit_changed:        { icon: <Gauge className="h-3.5 w-3.5" />,         tone: "text-yellow-500",       label: "Volume" },
  quarantined:          { icon: <Siren className="h-3.5 w-3.5" />,         tone: "text-destructive",      label: "Contained" },
  quarantine_released:  { icon: <PlayCircle className="h-3.5 w-3.5" />,    tone: "text-green-500",        label: "Released" },
  placement_test:       { icon: <TestTube className="h-3.5 w-3.5" />,      tone: "text-muted-foreground", label: "Test" },
  blacklist_listed:     { icon: <ShieldAlert className="h-3.5 w-3.5" />,   tone: "text-destructive",      label: "Blacklist" },
  blacklist_cleared:    { icon: <ShieldCheck className="h-3.5 w-3.5" />,   tone: "text-green-500",        label: "Blacklist" },
  copy_edited:          { icon: <Mail className="h-3.5 w-3.5" />,          tone: "text-muted-foreground", label: "Copy" },
  campaign_launched:    { icon: <Mail className="h-3.5 w-3.5" />,          tone: "text-muted-foreground", label: "Campaign" },
};

const FALLBACK = { icon: <Mail className="h-3.5 w-3.5" />, tone: "text-muted-foreground", label: "Change" };

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const EventTimeline = ({ days = 30 }: { days?: number }) => {
  const { data, isLoading } = useDeliverabilityEvents(days);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (!data || data.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nothing has changed in the last {days} days — no mailboxes added or paused, no limits
          moved, no DNS edits. Changes appear here as they happen, so a shift in the numbers
          above can be traced to what caused it.
        </CardContent>
      </Card>
    );
  }

  // Grouped by day: what matters is which changes share a day with a shift in
  // the chart, not the minute each one happened.
  const byDay = new Map<string, typeof data>();
  for (const event of data) {
    const key = event.occurred_at.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  }

  return (
    <Card className="border-border/50">
      <CardContent className="space-y-4 p-5">
        {[...byDay.entries()].map(([day, events]) => (
          <div key={day} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">{dayLabel(day)}</p>
            <div className="space-y-2 border-l border-border/60 pl-3">
              {events.map((event) => {
                const style = EVENT_STYLE[event.event_type] ?? FALLBACK;
                return (
                  <div key={event.id} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 ${style.tone}`}>{style.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm leading-snug">{event.title}</p>
                        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                          {style.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {timeLabel(event.occurred_at)}
                        </span>
                      </div>
                      {event.detail && (
                        <p className="text-xs leading-snug text-muted-foreground">{event.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
