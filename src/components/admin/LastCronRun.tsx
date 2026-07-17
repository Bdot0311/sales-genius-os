import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Row {
  jobname: string;
  last_success: string | null;
  last_run: string | null;
  last_status: string | null;
}

/**
 * Compact badge showing the last cron run for one or more pg_cron jobs.
 * Auto-refreshes every 60s alongside the rest of the admin panel.
 */
export function LastCronRun({ jobs, label }: { jobs: string[]; label?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.rpc("admin_get_cron_runs", { jobnames: jobs });
    if (!error && data) setRows(data as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jobs.join(",")]);
  useAutoRefresh(load, 60_000);

  if (loading && rows.length === 0) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <Clock className="h-3 w-3 mr-1 animate-pulse" /> Checking cron…
      </Badge>
    );
  }

  if (rows.length === 0) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        <Clock className="h-3 w-3 mr-1" /> No cron history
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {label && <span className="text-xs text-muted-foreground self-center">{label}</span>}
      {rows.map((r) => {
        const ok = r.last_status === "succeeded";
        const when = r.last_success ?? r.last_run;
        return (
          <Badge
            key={r.jobname}
            variant="outline"
            className={
              ok
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs"
                : "bg-red-500/10 text-red-400 border-red-500/30 text-xs"
            }
            title={`${r.jobname} — last status: ${r.last_status ?? "n/a"}`}
          >
            {ok ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
            {r.jobname}: {when ? formatDistanceToNow(new Date(when), { addSuffix: true }) : "never"}
          </Badge>
        );
      })}
    </div>
  );
}
