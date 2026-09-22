import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { maybeMask } from "@/lib/demo-mask";

interface OnlineUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  path: string | null;
  last_seen_at: string;
  started_at: string;
  page_views: number;
  is_mobile: boolean;
}

interface LiveUsage {
  online: OnlineUser[];
  active_today: number;
  active_7d: number;
  active_30d: number;
}

const areaLabel = (path: string | null) => {
  if (!path) return "—";
  const map: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/dashboard/leads": "Leads",
    "/dashboard/outreach": "Outreach",
    "/dashboard/agent": "AI SDR",
    "/dashboard/sequences": "Sequences",
    "/dashboard/settings": "Settings",
    "/dashboard/pipeline": "Pipeline",
  };
  return map[path] ?? path;
};

export const LiveUsageCard = () => {
  const { isDemoMode } = useDemoMode();
  const [usage, setUsage] = useState<LiveUsage | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_get_live_usage");
    if (error) {
      console.error("live usage", error);
      return;
    }
    setUsage(data as unknown as LiveUsage);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30_000);
    const channel = supabase
      .channel(`admin-live-usage-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_activity_sessions" },
        () => void load(),
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const online = usage?.online ?? [];

  return (
    <Panel>
      <PanelHeader className="flex-row items-center justify-between">
        <PanelTitle className="flex items-center gap-2">
          Live usage
        </PanelTitle>
        <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          {online.length} online now
        </Badge>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active today", value: usage?.active_today ?? 0 },
            { label: "Active 7 days", value: usage?.active_7d ?? 0 },
            { label: "Active 30 days", value: usage?.active_30d ?? 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <p className="text-xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        {online.length === 0 ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Nobody is in the app right now.</p>
            {/* Otherwise this reads as "nobody uses the product" when you are
                looking at it yourself from the editor preview. */}
            <p className="text-xs text-muted-foreground">
              Counts only the published app — your own preview sessions are left out, and history starts from when live
              usage was switched on.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {online.map((u) => (
              <div
                key={u.user_id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400 align-middle" />
                    {maybeMask(isDemoMode, "name", u.full_name) || maybeMask(isDemoMode, "email", u.email) || u.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {areaLabel(u.path)} · {u.page_views} page{u.page_views === 1 ? "" : "s"} this visit
                    {u.is_mobile ? " · mobile" : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNowStrict(new Date(u.started_at))} in app
                </span>
              </div>
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
};
