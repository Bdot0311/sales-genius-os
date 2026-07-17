import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, TrendingDown, Zap, Snowflake, Flame } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { UserTimelineDrawer } from "@/components/admin/UserTimelineDrawer";

interface FunnelData {
  range_days: number;
  funnel: {
    signed_up: number;
    verified_email: number;
    completed_onboarding: number;
    first_search: number;
    first_lead_saved: number;
    mailbox_connected: number;
    first_email_sent: number;
  };
  cohorts: {
    tire_kicker: number;
    explorer: number;
    active: number;
    power: number;
  };
}

interface ActivationUser {
  user_id: string;
  email: string | null;
  full_name: string | null;
  signed_up_at: string;
  cohort: string;
  current_stage: string;
  milestones_hit: number;
  verified_email_at: string | null;
  completed_onboarding_at: string | null;
  first_search_at: string | null;
  first_lead_saved_at: string | null;
  mailbox_connected_at: string | null;
  first_email_sent_at: string | null;
  plan: string;
  days_since_signup: number;
}

const FUNNEL_STEPS = [
  { key: "signed_up", label: "Signed up" },
  { key: "verified_email", label: "Verified email" },
  { key: "completed_onboarding", label: "Onboarded" },
  { key: "first_search", label: "First search" },
  { key: "first_lead_saved", label: "First lead saved" },
  { key: "mailbox_connected", label: "Mailbox connected" },
  { key: "first_email_sent", label: "First email sent" },
] as const;

const COHORT_META: Record<string, { label: string; cls: string; Icon: any }> = {
  tire_kicker: { label: "Tire-kicker", cls: "bg-muted text-muted-foreground border-border", Icon: Snowflake },
  explorer: { label: "Explorer", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", Icon: Users },
  active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: Zap },
  power: { label: "Power user", cls: "bg-primary/15 text-primary border-primary/30", Icon: Flame },
};

const STAGE_LABELS: Record<string, string> = {
  signed_up: "Signed up",
  verified_email: "Verified email",
  completed_onboarding: "Onboarded",
  first_search: "First search",
  first_lead_saved: "First lead saved",
  mailbox_connected: "Mailbox connected",
  first_email_sent: "First email sent",
};

const AdminActivation = () => {
  const [days, setDays] = useState<number>(30);
  const [cohort, setCohort] = useState<string>("all");
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [users, setUsers] = useState<ActivationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [openUserEmail, setOpenUserEmail] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: fData, error: fErr }, { data: uData, error: uErr }] = await Promise.all([
      supabase.rpc("admin_get_activation_funnel", { _days: days }),
      supabase.rpc("admin_list_activation_users", {
        _days: days,
        _cohort: cohort === "all" ? null : cohort,
        _limit: 500,
      }),
    ]);
    if (fErr) toast.error(fErr.message);
    if (uErr) toast.error(uErr.message);
    setFunnel(fData as any);
    setUsers((uData ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [days, cohort]);
  useAutoRefresh(load, 60_000);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.email || "").toLowerCase().includes(q) || (u.full_name || "").toLowerCase().includes(q);
  });

  const total = funnel?.funnel.signed_up || 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Signup Activation</h2>
          <p className="text-sm text-muted-foreground">
            Track where new signups drop off and who's likely to convert.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cohort tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["tire_kicker", "explorer", "active", "power"] as const).map((k) => {
          const meta = COHORT_META[k];
          const count = funnel?.cohorts[k] ?? 0;
          const p = pct(count);
          return (
            <Card key={k} className={cohort === k ? "border-primary" : ""}>
              <CardContent className="pt-6">
                <button
                  className="w-full text-left"
                  onClick={() => setCohort(cohort === k ? "all" : k)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <meta.Icon className="h-4 w-4" />
                    <span className="text-sm text-muted-foreground">{meta.label}</span>
                  </div>
                  <div className="text-3xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p}% of signups</div>
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Activation funnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {FUNNEL_STEPS.map((step, i) => {
              const value = funnel?.funnel[step.key] ?? 0;
              const p = pct(value);
              const prev = i === 0 ? value : (funnel?.funnel[FUNNEL_STEPS[i - 1].key] ?? 0);
              const dropoff = prev > 0 ? Math.round(((prev - value) / prev) * 100) : 0;
              return (
                <div key={step.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground">
                      {value} <span className="text-xs">({p}%)</span>
                      {i > 0 && dropoff > 0 && (
                        <span className="ml-2 text-red-400 text-xs">−{dropoff}%</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${p}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Signups ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search email or name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            {cohort !== "all" && (
              <Button variant="outline" size="sm" onClick={() => setCohort("all")}>
                Clear cohort
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No signups in this range.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Milestones</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => {
                    const meta = COHORT_META[u.cohort] ?? COHORT_META.tire_kicker;
                    return (
                      <TableRow
                        key={u.user_id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => { setOpenUserId(u.user_id); setOpenUserEmail(u.email); }}
                      >
                        <TableCell>
                          <div className="font-medium">{u.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.cls}>
                            <meta.Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {STAGE_LABELS[u.current_stage] ?? u.current_stage}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{u.milestones_hit} / 6</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={u.plan === "free" ? "outline" : "default"}>
                            {u.plan}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(u.signed_up_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-sm">{u.days_since_signup}d</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UserTimelineDrawer
        userId={openUserId}
        email={openUserEmail}
        open={!!openUserId}
        onOpenChange={(o) => { if (!o) { setOpenUserId(null); setOpenUserEmail(null); } }}
      />
    </div>
  );
};

export default AdminActivation;
