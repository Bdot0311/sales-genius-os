import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHeader, PanelBody, EmptyState } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Estimate = { leads: number; research_calls: number; draft_calls: number; est_provider_usd: number; est_minutes: number };
type Run = {
  id: string; name: string; status: string; pause_reason: string | null; matched_count: number; max_leads: number | null;
  enqueued: number; researched: number; drafted: number; skipped: number; failed: number; estimate: Estimate;
  filters: Record<string, unknown>; do_research: boolean; do_draft: boolean; created_at: string; last_error: string | null;
  rate_limited_until: string | null;
};

const STAGES = ["new", "contacted", "no_response", "replied", "meeting_booked", "qualified"];
const STATUS_LABEL: Record<string, string> = {
  awaiting_approval: "Waiting for your approval", running: "Running", paused: "Paused", cancelled: "Cancelled", completed: "Completed",
};

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("bulk-runs", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
};

const duration = (minutes: number) =>
  minutes < 90 ? `${minutes} min` : minutes < 60 * 48 ? `${Math.round(minutes / 60)} hours` : `${Math.round(minutes / 1440)} days`;

export default function BulkRuns() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [stage, setStage] = useState("new");
  const [tier, setTier] = useState("any");
  const [doResearch, setDoResearch] = useState(true);
  const [doDraft, setDoDraft] = useState(true);
  const [preview, setPreview] = useState<{ matched: number; estimate: Estimate } | null>(null);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRuns((await call({ action: "list" })).runs ?? []); } catch { /* shown on action */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  const filters = () => ({ pipeline_stage: stage, ...(tier !== "any" ? { tier } : {}) });

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) toast({ title: done }); await load(); }
    catch (e) { toast({ title: "Could not do that", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <DashboardLayout>
      <title>Bulk Runs | OutReign</title>
      <meta name="description" content="Research and draft personalized emails for thousands of leads in the background." />
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Bulk runs" }]}
        title="Bulk runs"
        description="Research and draft for every matching lead in the background. Nothing starts until you approve the estimate. Drafts land in Drafts for review; nothing is sent."
      />
      <div className="mx-auto w-full max-w-4xl space-y-4 pt-4">
        <Panel>
          <PanelHeader title="New run" />
          <PanelBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pipeline stage</Label>
                <Select value={stage} onValueChange={(v) => { setStage(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={(v) => { setTier(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any tier</SelectItem>
                    {["A", "B", "C", "unscored"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={doResearch} onCheckedChange={(v) => { setDoResearch(!!v); setPreview(null); }} />Research each lead</label>
              <label className="flex items-center gap-2"><Checkbox checked={doDraft} onCheckedChange={(v) => { setDoDraft(!!v); setPreview(null); }} />Draft a personalized email</label>
            </div>
            <p className="text-xs text-muted-foreground">Only leads with an email address are included. Leads that already have a draft are skipped.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => act(async () => {
                const d = await call({ action: "estimate", filters: filters(), do_research: doResearch, do_draft: doDraft });
                setPreview({ matched: d.matched, estimate: d.estimate });
              })}>Estimate</Button>
              <Button disabled={busy || !preview || preview.matched === 0} onClick={() => act(async () => {
                await call({ action: "create", filters: filters(), do_research: doResearch, do_draft: doDraft, name: `Stage: ${stage}${tier !== "any" ? `, tier ${tier}` : ""}` });
                setPreview(null);
              }, "Run created. Review and approve it below.")}>Create run</Button>
            </div>
            {preview && (
              <div className="rounded-lg border border-border/50 p-3 text-sm">
                <p><strong>{preview.matched.toLocaleString()}</strong> matching leads</p>
                <p className="text-muted-foreground">
                  {preview.estimate.research_calls.toLocaleString()} research runs · {preview.estimate.draft_calls.toLocaleString()} drafts ·
                  about {duration(preview.estimate.est_minutes)} · estimated AI and research spend ${preview.estimate.est_provider_usd.toLocaleString()}
                </p>
              </div>
            )}
          </PanelBody>
        </Panel>

        {runs.length === 0 ? (
          <EmptyState title="No bulk runs yet" body="Estimate a run above to see how many leads it covers before anything starts." />
        ) : runs.map((r) => {
          const target = r.max_leads ?? r.matched_count;
          const finished = r.drafted + r.skipped + r.failed + (r.do_draft ? 0 : r.researched);
          const pct = target ? Math.min(100, Math.round((finished / target) * 100)) : 0;
          const cooling = r.rate_limited_until && new Date(r.rate_limited_until) > new Date();
          return (
            <Panel key={r.id}>
              <PanelHeader title={r.name} meta={STATUS_LABEL[r.status] ?? r.status} />
              <PanelBody className="space-y-3 text-sm">
                {r.status === "awaiting_approval" ? (
                  <>
                    <p>
                      {r.matched_count.toLocaleString()} leads · {r.estimate?.research_calls?.toLocaleString() ?? 0} research runs ·{" "}
                      {r.estimate?.draft_calls?.toLocaleString() ?? 0} drafts · about {duration(r.estimate?.est_minutes ?? 0)} · estimated spend $
                      {(r.estimate?.est_provider_usd ?? 0).toLocaleString()}
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`cap-${r.id}`}>Most leads to process</Label>
                        <Input id={`cap-${r.id}`} type="number" min={1} className="w-40" placeholder={String(r.matched_count)}
                          value={caps[r.id] ?? ""} onChange={(e) => setCaps({ ...caps, [r.id]: e.target.value })} />
                      </div>
                      <Button disabled={busy} onClick={() => act(() => call({
                        action: "approve", run_id: r.id, ...(Number(caps[r.id]) > 0 ? { max_leads: Math.floor(Number(caps[r.id])) } : {}),
                      }), "Approved. The run starts within a minute.")}>Approve and start</Button>
                      <Button variant="ghost" disabled={busy} onClick={() => act(() => call({ action: "cancel", run_id: r.id }))}>Discard</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Progress value={pct} />
                    <p className="text-muted-foreground">
                      {finished.toLocaleString()} of {target.toLocaleString()} finished · {r.researched.toLocaleString()} researched ·{" "}
                      {r.drafted.toLocaleString()} drafted · {r.skipped.toLocaleString()} skipped · {r.failed.toLocaleString()} failed
                    </p>
                    {r.pause_reason && <p>{r.pause_reason}</p>}
                    {cooling && r.status === "running" && <p className="text-muted-foreground">Slowing down briefly because a provider asked us to. It continues on its own.</p>}
                    <div className="flex gap-2">
                      {r.status === "running" && <Button variant="outline" disabled={busy} onClick={() => act(() => call({ action: "pause", run_id: r.id }))}>Pause</Button>}
                      {r.status === "paused" && <Button disabled={busy} onClick={() => act(() => call({ action: "resume", run_id: r.id }), "Resumed")}>Resume</Button>}
                      {["running", "paused"].includes(r.status) && <Button variant="ghost" disabled={busy} onClick={() => act(() => call({ action: "cancel", run_id: r.id }))}>Cancel</Button>}
                    </div>
                  </>
                )}
              </PanelBody>
            </Panel>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
