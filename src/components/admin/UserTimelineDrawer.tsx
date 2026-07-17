import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { UserPlus, ShieldCheck, Search, UserCheck, Link2, Send, LogIn, Activity } from "lucide-react";

interface Props {
  userId: string | null;
  email: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface TimelineEvent {
  event_at: string;
  event_type: string;
  description: string;
  meta: any;
}

const ICONS: Record<string, any> = {
  signup: UserPlus,
  email_verified: ShieldCheck,
  search: Search,
  lead_saved: UserCheck,
  integration: Link2,
  email_sent: Send,
  login: LogIn,
};

const COLORS: Record<string, string> = {
  signup: "text-primary",
  email_verified: "text-emerald-400",
  search: "text-blue-400",
  lead_saved: "text-purple-400",
  integration: "text-yellow-400",
  email_sent: "text-pink-400",
  login: "text-muted-foreground",
};

export function UserTimelineDrawer({ userId, email, open, onOpenChange }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    supabase.rpc("admin_get_user_timeline", { _user_id: userId }).then(({ data, error }) => {
      if (error) console.error(error);
      setEvents((data ?? []) as TimelineEvent[]);
      setLoading(false);
    });
  }, [open, userId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity timeline
          </SheetTitle>
          <SheetDescription>{email ?? userId}</SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events recorded yet.</div>
          ) : (
            <div className="space-y-4">
              {events.map((e, idx) => {
                const Icon = ICONS[e.event_type] ?? Activity;
                const color = COLORS[e.event_type] ?? "text-muted-foreground";
                return (
                  <div key={idx} className="flex gap-3 pb-4 border-b border-border last:border-0">
                    <div className={`mt-1 shrink-0 ${color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{e.event_type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(e.event_at), "MMM d, yyyy · h:mm a")}
                        </span>
                      </div>
                      <div className="text-sm mt-1 break-words">{e.description}</div>
                      {e.meta && Object.keys(e.meta).length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                          {Object.entries(e.meta)
                            .filter(([, v]) => v !== null && v !== undefined && v !== "")
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
