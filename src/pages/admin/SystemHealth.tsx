import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edge-error";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw } from "lucide-react";
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
        <Panel>
          <PanelHeader className="pb-2">
            <PanelDescription>Broken</PanelDescription>
            <PanelTitle className="text-3xl text-destructive">{failing.length}</PanelTitle>
          </PanelHeader>
        </Panel>
        <Panel>
          <PanelHeader className="pb-2">
            <PanelDescription>Needs attention</PanelDescription>
            <PanelTitle className="text-3xl text-amber-400">{warning.length}</PanelTitle>
          </PanelHeader>
        </Panel>
        <Panel>
          <PanelHeader className="pb-2">
            <PanelDescription>Healthy</PanelDescription>
            <PanelTitle className="text-3xl text-emerald-400">{healthy.length}</PanelTitle>
          </PanelHeader>
        </Panel>
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Checks</PanelTitle>
          <PanelDescription>
            {report
              ? `Last run ${formatDistanceToNow(new Date(report.generated_at), { addSuffix: true })}`
              : "Running…"}
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-3">
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
        </PanelBody>
      </Panel>

      <SmtpCapabilityPanel />
      <IntegrationSecretsPanel />
    </div>
  );
}

/**
 * Can an edge function open an SMTP socket from here?
 *
 * The probe answering this was deployed on Oct 18 and invoked zero times,
 * because the only way to ask it was to hold the service role key — the one
 * that bypasses every RLS policy in the project — for a function that returns
 * a yes/no about a socket. Nobody was going to do that, so the question sat
 * open for twelve days.
 *
 * It is a button now. The backend runs on managed infrastructure whose
 * dashboard the people who need this answer do not log into, so a console
 * one-liner or a curl with a bearer token is not a way to ask a question
 * either. Being signed in here is.
 */
interface SecretRow {
  key: string;
  used: string;
  present: boolean;
  length: number;
  fingerprint: string | null;
  suspicious: boolean;
}

/**
 * Whether the secrets these functions read are actually set here.
 *
 * Google sending broke and stayed broken because nothing could answer that.
 * `google-oauth-init` knew — it throws when the client id is missing — and
 * turned it into the same opaque 500 as everything else, so the answer existed
 * and was unreadable. Rotating a credential over and over is what you do when
 * you cannot tell whether the last rotation landed.
 *
 * Shows presence, length and a short fingerprint, never a value. The
 * fingerprint is the useful part: it tells "nothing is set" apart from "set,
 * but not to what I just pasted".
 */
function IntegrationSecretsPanel() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<SecretRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const probe = async () => {
    setRunning(true);
    setRows(null);
    setNote(null);
    const { data, error } = await supabase.functions.invoke("integration-secrets-probe", { body: {} });
    setRunning(false);
    if (error) {
      setNote(await edgeErrorMessage(error, "Could not read the secret configuration."));
      toast.error("Secrets check failed to run");
      return;
    }
    setRows(Array.isArray(data?.secrets) ? (data.secrets as SecretRow[]) : []);
    setNote(typeof data?.note === "string" ? data.note : null);
  };

  return (
    <Panel>
      <PanelHeader className="flex-row items-start justify-between gap-4">
        <div>
          <PanelTitle>Integration secrets</PanelTitle>
          <PanelDescription>
            Which secrets the edge functions can actually see. Shows presence, length and a
            fingerprint — never a value. A missing or padded secret fails at runtime as a
            generic error, which is what makes it hard to find.
          </PanelDescription>
        </div>
        <Button variant="outline" size="sm" onClick={probe} disabled={running} className="shrink-0">
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Checking…" : "Check secrets"}
        </Button>
      </PanelHeader>
      <PanelBody>
        {rows ? (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card/50 p-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm">{r.key}</p>
                  <p className="text-xs text-muted-foreground">{r.used}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {r.present ? (
                    <span className="font-mono text-muted-foreground">
                      {r.length} chars · {r.fingerprint}
                    </span>
                  ) : null}
                  <span
                    className={
                      !r.present
                        ? "rounded border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-red-400"
                        : r.suspicious
                          ? "rounded border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-amber-400"
                          : "rounded border border-green-500/30 bg-green-500/15 px-2 py-0.5 text-green-400"
                    }
                  >
                    {!r.present ? "Missing" : r.suspicious ? "Has quotes or spaces" : "Set"}
                  </span>
                </div>
              </div>
            ))}
            {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {note ?? "Not run yet. It reports which secrets are set and a fingerprint of each, so a value that was pasted wrong can be told apart from one that was never set."}
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

function SmtpCapabilityPanel() {
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);

  const probe = async () => {
    setRunning(true);
    setVerdict(null);
    const { data, error } = await supabase.functions.invoke("smtp-capability-probe", { body: {} });
    setRunning(false);
    if (error) {
      // The reason matters more than "it failed": a 401 here means the gate,
      // a 404 means it is not deployed, and they need different answers.
      setVerdict(`Could not run the probe: ${error.message}`);
      toast.error("SMTP probe failed to run");
      return;
    }
    setVerdict(typeof data?.verdict === "string" ? data.verdict : JSON.stringify(data));
  };

  return (
    <Panel>
      <PanelHeader className="flex-row items-start justify-between gap-4">
        <div>
          <PanelTitle>SMTP capability</PanelTitle>
          <PanelDescription>
            Whether this runtime can open a mail submission socket. Decides if sending over
            SMTP is buildable here, or whether it needs a different transport.
          </PanelDescription>
        </div>
        <Button variant="outline" size="sm" onClick={probe} disabled={running} className="shrink-0">
          <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running ? "Probing…" : "Run probe"}
        </Button>
      </PanelHeader>
      <PanelBody>
        {verdict ? (
          <p className="break-words rounded-lg border border-border bg-card/50 p-4 text-sm">{verdict}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not run yet. It opens two connections to Gmail's submission endpoints and reports what
            happened — it sends nothing and reads no data.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}
