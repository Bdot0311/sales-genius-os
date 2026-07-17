import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, Loader2, X } from "lucide-react";
import { useResolveAlert } from "@/hooks/use-deliverability";
import type { DeliverabilityAlert } from "@/lib/deliverability-db";

const TYPE_LABEL: Record<DeliverabilityAlert["alert_type"], string> = {
  reputation_drop: "Reputation drop",
  blacklist: "Blacklist",
  auth_failure: "Auth failure",
  bounce_spike: "Bounce spike",
  complaint_spike: "Complaint spike",
  warmup_paused: "Warmup paused",
};

export const AlertsPanel = ({ alerts }: { alerts: DeliverabilityAlert[] }) => {
  const resolve = useResolveAlert();

  if (alerts.length === 0) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-green-500" />
          No active deliverability alerts. Accounts, domains, and blacklists are clear.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Active alerts ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => {
          const border =
            a.severity === "critical" ? "hsl(0 72% 51% / 0.4)" : a.severity === "warning" ? "hsl(45 93% 47% / 0.4)" : "hsl(var(--border))";
          const dot = a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-yellow-500" : "bg-muted-foreground";
          return (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: border }}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{TYPE_LABEL[a.alert_type]}</span>
                  {a.domain && <span className="text-xs text-muted-foreground truncate">· {a.domain}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
              </div>
              <Button
                size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                onClick={() => resolve.mutate(a.id)} disabled={resolve.isPending}
                aria-label="Dismiss alert"
              >
                {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
