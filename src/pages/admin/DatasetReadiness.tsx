import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MetricStrip, Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  THIN_BAND,
  bindingConstraint,
  discrimination,
  formatRate,
  isThin,
  projectedReadyDate,
  readinessFraction,
  remaining,
  type BreakdownRow,
  type Readiness,
} from "@/lib/dataset-readiness";

interface ReadinessResponse {
  readiness: Readiness;
  totals: {
    finalized: number; positives: number; positive_rate: number | null;
    negative_reply: number; no_reply: number; bounced: number; unsubscribed: number;
    claude_labels: number; human_labels: number; pending: number;
  };
  per_user: { user_id: string; finalized: number; positives: number; positive_rate: number | null }[];
  breakdowns: Record<string, BreakdownRow[]>;
  history: { as_of: string; finalized: number; positives: number; positive_rate: number | null; pending: number }[];
}

/** The order the questions are worth asking in, not alphabetical. */
const DIMENSIONS: { key: string; label: string; note?: string }[] = [
  {
    key: "send_recommendation",
    label: "Lead Intelligence recommendation",
    note: "A flat rate here means the recommendation predicts nothing yet.",
  },
  { key: "email_priority", label: "Priority" },
  { key: "strongest_signal_type", label: "Strongest signal" },
  { key: "personalization_type", label: "Personalisation" },
  { key: "seniority", label: "Seniority" },
  { key: "company_size_band", label: "Company size" },
];

export default function DatasetReadiness() {
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    const { data: res, error } = await supabase.functions.invoke("admin-dataset-readiness", { body: {} });
    if (error) {
      toast.error("Could not read the dataset", { description: error.message });
      setLoading(false);
      return;
    }
    setData(res as ReadinessResponse);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("admin-dataset-readiness", {
        body: { format: "csv" },
      });
      if (error) throw error;
      // The function returns text/csv, so this is the file itself.
      const blob = new Blob([typeof res === "string" ? res : String(res)], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `training-examples-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Could not build the export", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Reading the dataset…</p>;
  if (!data) return <p className="text-sm text-muted-foreground">No dataset yet.</p>;

  const { readiness, totals, breakdowns, per_user, history } = data;
  const fraction = readinessFraction(readiness);
  const binding = bindingConstraint(readiness);
  const need = remaining(readiness);
  const projected = projectedReadyDate(history, readiness);

  return (
    <div className="space-y-6">
      <MetricStrip
        metrics={[
          {
            label: "Finished examples",
            value: totals.finalized.toLocaleString(),
            note: `of ${readiness.target_examples.toLocaleString()} needed`,
          },
          {
            label: "Positive replies",
            value: totals.positives.toLocaleString(),
            note: `of ${readiness.target_positives.toLocaleString()} needed — the scarce half`,
          },
          {
            label: "Positive rate",
            value: formatRate(totals.positive_rate),
            note: "across every finished example",
          },
          {
            label: "Still open",
            value: totals.pending.toLocaleString(),
            note: "no outcome yet, so not exported",
          },
        ]}
      />

      <Panel>
        <PanelHeader>
          <PanelTitle>Ready to train a scoring model?</PanelTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {exporting ? "Building…" : "Export finished rows"}
          </Button>
        </PanelHeader>
        <PanelBody className="space-y-3">
          {/*
            One bar, showing the worse of the two ratios. Two bars side by side
            read as "mostly there" when one of them is near zero, which is the
            misreading this page exists to prevent.
          */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${(fraction * 100).toFixed(1)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progress toward a trainable dataset"
            />
          </div>
          <p className="text-sm">
            {readiness.ready ? (
              <span className="font-medium text-emerald-400">
                Both thresholds met: {readiness.finalized.toLocaleString()} finished examples and{" "}
                {readiness.positives.toLocaleString()} positives.
              </span>
            ) : (
              <>
                <span className="font-medium">{(fraction * 100).toFixed(0)}% of the way.</span>{" "}
                {readiness.finalized.toLocaleString()} of {readiness.target_examples.toLocaleString()} examples,{" "}
                {readiness.positives.toLocaleString()} of {readiness.target_positives.toLocaleString()} positives.
              </>
            )}
          </p>
          {!readiness.ready && (
            <p className="text-xs text-muted-foreground">
              {/* Naming the binding constraint, because "60% there" does not say what to do. */}
              {binding === "positives"
                ? `Positives are the constraint: ${need.positives.toLocaleString()} more needed. More volume alone will not fix that.`
                : `Volume is the constraint: ${need.examples.toLocaleString()} more finished examples needed.`}
              {projected
                ? ` At the recent rate, around ${format(projected, "d MMM yyyy")}.`
                : " Not enough history yet to project a date."}
            </p>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Does the scoring predict a reply?</PanelTitle>
        </PanelHeader>
        <PanelBody className="space-y-6">
          <p className="text-xs text-muted-foreground">
            Positive rate per band, finished examples only. Bands under {THIN_BAND} examples are marked
            thin: their rate is arithmetic rather than evidence.
          </p>
          {DIMENSIONS.map(({ key, label, note }) => {
            const rows = breakdowns[key] ?? [];
            const spread = discrimination(rows);
            return (
              <div key={key} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-sm font-medium">{label}</h3>
                  {spread === null ? (
                    <Badge variant="outline" className="text-[0.625rem]">
                      Too few bands to compare
                    </Badge>
                  ) : (
                    <Badge
                      variant={spread >= 0.05 ? "default" : "outline"}
                      className="text-[0.625rem]"
                      title="Difference between the best and worst band, thin bands excluded"
                    >
                      Spread {formatRate(spread)}
                    </Badge>
                  )}
                </div>
                {note && <p className="text-[0.6875rem] text-muted-foreground">{note}</p>}
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No finished examples yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{label}</TableHead>
                        <TableHead className="text-right">Examples</TableHead>
                        <TableHead className="text-right">Positives</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.value} className={isThin(row) ? "opacity-60" : undefined}>
                          <TableCell className="font-mono text-xs">{row.value}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.finalized.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.positives.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {isThin(row) ? (
                              <span className="text-muted-foreground" title={`Under ${THIN_BAND} examples`}>
                                thin
                              </span>
                            ) : (
                              formatRate(row.positive_rate)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Outcomes and labels</PanelTitle>
        </PanelHeader>
        <PanelBody>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Positive", totals.positives],
              ["Negative reply", totals.negative_reply],
              ["No reply", totals.no_reply],
              ["Bounced", totals.bounced],
              ["Unsubscribed", totals.unsubscribed],
              ["Still open", totals.pending],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="tabular-nums">{Number(value).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {/* The gold-label share: a set labelled only by the classifier is worth less. */}
            {totals.human_labels.toLocaleString()} labels set by a person,{" "}
            {totals.claude_labels.toLocaleString()} by the classifier.
          </p>
        </PanelBody>
      </Panel>

      {per_user.length > 1 && (
        <Panel>
          <PanelHeader>
            <PanelTitle>Per account</PanelTitle>
          </PanelHeader>
          <PanelBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Examples</TableHead>
                  <TableHead className="text-right">Positives</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {per_user.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-mono text-xs">{u.user_id.slice(0, 8)}…</TableCell>
                    <TableCell className="text-right tabular-nums">{u.finalized.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.positives.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRate(u.positive_rate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
