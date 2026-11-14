import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";

type Sent = { id: string; to_email: string | null; subject: string | null; status: string | null; sent_at: string | null; created_at: string; opened_at: string | null; replied_at: string | null };
type LeadRow = { tier: string | null; pipeline_stage: string | null };

const SENT_STATES = new Set(["sent", "delivered", "opened", "replied", "clicked"]);
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

/** Real-data panels for the Overview: outreach results, lead quality, recent mail. */
export const OverviewInsights = ({ refreshKey }: { refreshKey?: number }) => {
  const navigate = useNavigate();
  const [sent, setSent] = useState<Sent[]>([]);
  const [recent, setRecent] = useState<Sent[]>([]);
  const [drafts, setDrafts] = useState(0);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const [s, r, d, l] = await Promise.all([
        supabase.from("sent_emails").select("id,to_email,subject,status,sent_at,created_at,opened_at,replied_at").eq("user_id", user.id).gte("created_at", since).limit(5000),
        supabase.from("sent_emails").select("id,to_email,subject,status,sent_at,created_at,opened_at,replied_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
        supabase.from("email_drafts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("leads").select("tier,pipeline_stage").eq("user_id", user.id).limit(100000),
      ]);
      setSent((s.data as Sent[]) ?? []);
      setRecent((r.data as Sent[]) ?? []);
      setDrafts(d.count ?? 0);
      setLeads((l.data as LeadRow[]) ?? []);
    })().catch((e) => console.error("Overview insights failed", e));
  }, [refreshKey]);

  const delivered = sent.filter((e) => e.sent_at || SENT_STATES.has(e.status ?? ""));
  const opened = delivered.filter((e) => e.opened_at).length;
  const replied = delivered.filter((e) => e.replied_at).length;
  const scheduled = sent.filter((e) => !e.sent_at && (e.status === "scheduled" || e.status === "queued")).length;

  const outreach = [
    { label: "Sent", value: delivered.length.toLocaleString(), note: "last 30 days" },
    { label: "Open rate", value: pct(opened, delivered.length), note: `${opened} opened` },
    { label: "Reply rate", value: pct(replied, delivered.length), note: `${replied} replied` },
    { label: "Waiting", value: (drafts + scheduled).toLocaleString(), note: `${drafts} drafts · ${scheduled} scheduled` },
  ];

  const tiers = ["A", "B", "C"].map((t) => ({ t, n: leads.filter((l) => (l.tier ?? "").toUpperCase() === t).length }));
  const unscored = leads.length - tiers.reduce((a, b) => a + b.n, 0);
  const max = Math.max(1, ...tiers.map((x) => x.n), unscored);
  const rows = [...tiers.map((x) => ({ label: `Tier ${x.t}`, n: x.n })), { label: "Not scored", n: unscored }];

  const stages = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      const k = l.pipeline_stage || "new";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Outreach" meta="last 30 days" actions={
          <Button variant="ghost" size="sm" className="h-7 text-[0.6875rem]" onClick={() => navigate("/dashboard/inbox")}>Open inbox <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
        } />
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {outreach.map((m, i) => (
            <div key={m.label} className={`px-4 py-4 sm:px-5 ${i > 0 ? "lg:border-l" : ""} ${i % 2 ? "border-l lg:border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} border-border/30`}>
              <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{m.value}</p>
              <p className="mt-1 text-[0.6875rem] text-muted-foreground">{m.note}</p>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.3fr]">
        <Panel>
          <PanelHeader title="Lead quality" meta={`${leads.length} saved`} />
          <div className="space-y-3 px-4 py-4 sm:px-5">
            {rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex justify-between text-[0.6875rem]"><span className="text-muted-foreground">{r.label}</span><span className="tabular-nums text-foreground">{r.n}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Lead stages" meta="top 5" />
          <div className="px-4 py-2 sm:px-5">
            {stages.length === 0 && <p className="py-3 text-[0.6875rem] text-muted-foreground">No leads yet.</p>}
            {stages.map(([k, n], i) => (
              <div key={k} className={`flex justify-between py-2.5 text-[0.8125rem] ${i ? "border-t border-border/30" : ""}`}>
                <span className="capitalize text-foreground">{k.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Recent emails" meta={recent.length ? `${recent.length} latest` : undefined} />
          <div>
            {recent.length === 0 && <p className="px-5 py-4 text-[0.6875rem] text-muted-foreground">No emails yet. Drafts and sends from Outreach, the AI agent, the API and MCP show up here.</p>}
            {recent.map((e, i) => (
              <button key={e.id} type="button" onClick={() => navigate("/dashboard/inbox")} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-primary/5 sm:px-5 ${i ? "border-t border-border/30" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] text-foreground">{e.subject || "(no subject)"}</p>
                  <p className="truncate text-[0.6875rem] text-muted-foreground">{e.to_email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{e.replied_at ? "replied" : e.opened_at ? "opened" : e.status}</p>
                  <p className="text-[0.625rem] text-muted-foreground">{ago(e.sent_at ?? e.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
};
