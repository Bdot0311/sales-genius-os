import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2, XCircle, AlertTriangle, Info, RefreshCw, Search, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Status = "info" | "success" | "warning" | "error";

interface DiagRow {
  id: string;
  user_id: string | null;
  email: string | null;
  stage: string;
  status: Status;
  message: string | null;
  sqlstate: string | null;
  details: any;
  source: string;
  created_at: string;
}

const STATUS_META: Record<Status, { color: string; icon: typeof CheckCircle2 }> = {
  info: { color: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: Info },
  success: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  warning: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle },
  error: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
};

const AdminSignupLogs = () => {
  const [rows, setRows] = useState<DiagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DiagRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("signup_diagnostics" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      toast.error(`Failed to load signup logs: ${error.message}`);
      setLoading(false);
      return;
    }
    const raw = (data || []) as any[];
    const userIds = [...new Set(raw.map((r) => r.user_id).filter(Boolean))];
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, email").in("id", userIds)
      : { data: [] as any[] };
    const emailMap = new Map((profs || []).map((p: any) => [p.id, p.email]));
    setRows(raw.map((r) => ({ ...r, email: emailMap.get(r.user_id) || null })) as DiagRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-signup-diagnostics")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signup_diagnostics" },
        (payload) => {
          setRows((prev) => [payload.new as DiagRow, ...prev].slice(0, 500));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !(r.email?.toLowerCase().includes(q) ||
            r.user_id?.toLowerCase().includes(q) ||
            r.stage.toLowerCase().includes(q) ||
            r.message?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => {
    const c = { info: 0, success: 0, warning: 0, error: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Signup Diagnostics
          </h2>
          <p className="text-sm text-muted-foreground">
            Step-by-step trace of free account provisioning. Live updates via realtime.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["success", "warning", "error", "info"] as Status[]).map((s) => {
          const Icon = STATUS_META[s].icon;
          return (
            <Card key={s}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">{s}</p>
                    <p className="text-2xl font-bold">{counts[s]}</p>
                  </div>
                  <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Events</CardTitle>
          <div className="flex flex-col md:flex-row gap-3 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email, user id, stage, or message…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="error">Errors only</SelectItem>
                <SelectItem value="warning">Warnings</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            {loading && rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No events match your filters. Once a user signs up, every step of provisioning will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.info;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className="w-full text-left border border-border rounded-lg p-3 hover:bg-accent/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                          r.status === "error" ? "text-red-400" :
                          r.status === "warning" ? "text-amber-400" :
                          r.status === "success" ? "text-emerald-400" : "text-sky-400"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={meta.color}>{r.stage}</Badge>
                            <span className="text-xs text-muted-foreground">{r.source}</span>
                            {r.sqlstate && (
                              <Badge variant="outline" className="font-mono text-xs">SQLSTATE {r.sqlstate}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                              {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm mt-1 truncate">
                            {r.email && <span className="font-medium">{r.email} — </span>}
                            <span className="text-muted-foreground">{r.message || "(no message)"}</span>
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Signup event</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Stage:</span> <code>{selected.stage}</code></div>
                <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
                <div><span className="text-muted-foreground">Source:</span> {selected.source}</div>
                <div><span className="text-muted-foreground">SQLSTATE:</span> <code>{selected.sqlstate || "—"}</code></div>
                <div className="col-span-2"><span className="text-muted-foreground">Email:</span> {selected.email || "—"}</div>
                <div className="col-span-2"><span className="text-muted-foreground">User ID:</span> <code className="text-xs">{selected.user_id || "—"}</code></div>
                <div className="col-span-2"><span className="text-muted-foreground">Time:</span> {new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Message</p>
                <pre className="bg-muted/50 p-3 rounded text-xs whitespace-pre-wrap break-words">{selected.message || "(empty)"}</pre>
              </div>
              {selected.details && (
                <div>
                  <p className="text-muted-foreground mb-1">Details</p>
                  <pre className="bg-muted/50 p-3 rounded text-xs overflow-auto max-h-64">{JSON.stringify(selected.details, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSignupLogs;
