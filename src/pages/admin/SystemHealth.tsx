import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type CheckStatus = "pass" | "warn" | "fail" | "unknown";

interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  severity: "critical" | "warning";
}

interface HealthReport {
  generated_at: string;
  checks: HealthCheck[];
}

const statusMeta: Record<CheckStatus, { icon: typeof CheckCircle2; badge: string; label: string }> = {
  pass: { icon: CheckCircle2, badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Healthy" },
  warn: { icon: AlertTriangle, badge: "bg-amber-500/15 text-amber-400 border-amber-500/30", label: "Attention" },
  fail: { icon: XCircle, badge: "bg-destructive/15 text-destructive border-destructive/30", label: "Broken" },
  unknown: { icon: HelpCircle, badge: "bg-muted text-muted-foreground border-border", label: "Unknown" },
};

export default function SystemHealth() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async (showToast = false) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_system_healthcheck");
    setLoading(false);

    if (error) {
      toast.error("Health check failed", { description: error.message });
      return;
    }

    const parsed = data as unknown as HealthReport;
    setReport(parsed);

    if (showToast) {
      const broken = parsed.checks.filter((c) => c.status === "fail").length;
      broken === 0
        ? toast.success("All systems healthy")
        : toast.error(`${broken} check${broken === 1 ? "" : "s"} failing`);
    }
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const checks = report?.checks ?? [];
  const failing = checks.filter((c) => c.status === "fail");
  const warning = checks.filter((c) => c.status === "warn");
  const healthy = checks.filter((c) => c.status === "pass");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
          <p className="text-sm text-muted-foreground">
            Continuous checks for the failure modes that have broken this app before — missing database fields,
            unreachable tables, failed scheduled jobs and email delivery.
          </p>
        </div>
        <Button onClick={() => run(true)} disabled={loading} className="shrink-0">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Run checks
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Broken</CardDescription>
            <CardTitle className="text-3xl text-destructive">{failing.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Needs attention</CardDescription>
            <CardTitle className="text-3xl text-amber-400">{warning.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Healthy</CardDescription>
            <CardTitle className="text-3xl text-emerald-400">{healthy.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Checks
          </CardTitle>
          <CardDescription>
            {report
              ? `Last run ${formatDistanceToNow(new Date(report.generated_at), { addSuffix: true })}`
              : "Running…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {checks.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">No results yet. Run the checks to see current status.</p>
          )}
          {checks.map((check) => {
            const meta = statusMeta[check.status] ?? statusMeta.unknown;
            const Icon = meta.icon;
            return (
              <div
                key={check.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-medium">{check.label}</p>
                    <p className="break-words text-sm text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 self-start sm:self-center ${meta.badge}`}>
                  {meta.label}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
