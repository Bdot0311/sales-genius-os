import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Send, Mail, CheckCircle2, XCircle, MinusCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Status = "sent" | "skipped" | "failed";

interface LogRow {
  id: string;
  user_id: string | null;
  recipient_email: string;
  last_sign_in_at: string | null;
  days_inactive: number | null;
  eligibility_reason: string;
  status: Status;
  error_message: string | null;
  triggered_manually: boolean;
  attempted_at: string;
}

const STATUS_META: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  sent: { label: "Sent", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-400 border-red-500/30", Icon: XCircle },
  skipped: { label: "Skipped", cls: "bg-muted text-muted-foreground border-border", Icon: MinusCircle },
};

const AdminReEngagement = () => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [runningSweep, setRunningSweep] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("re_engagement_log")
      .select("*")
      .order("attempted_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as LogRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search && !r.recipient_email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const manualSend = async (row: LogRow) => {
    if (!row.user_id) {
      toast.error("No user ID on this row");
      return;
    }
    setSendingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-re-engagement-emails", {
        body: { userId: row.user_id, manual: true },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Re-engagement email sent to ${row.recipient_email}`);
        load();
      } else {
        toast.error(data?.error ?? "Send failed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
    } finally {
      setSendingId(null);
    }
  };

  const runSweep = async () => {
    setRunningSweep(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-re-engagement-emails", { body: {} });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Sweep complete: ${data.sent} sent, ${data.skipped} skipped`);
        load();
      } else {
        toast.error(data?.error ?? "Sweep failed");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Sweep failed");
    } finally {
      setRunningSweep(false);
    }
  };

  const stats = {
    total: rows.length,
    sent: rows.filter((r) => r.status === "sent").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Re-engagement Emails
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Daily audit log of every re-engagement email attempt. Manually resend to any user.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={runSweep} disabled={runningSweep}>
            <Play className={`h-4 w-4 mr-2 ${runningSweep ? "animate-pulse" : ""}`} />
            {runningSweep ? "Running…" : "Run Sweep Now"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total attempts", value: stats.total },
          { label: "Sent", value: stats.sent, cls: "text-emerald-400" },
          { label: "Skipped", value: stats.skipped, cls: "text-muted-foreground" },
          { label: "Failed", value: stats.failed, cls: "text-red-400" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className={`text-2xl font-semibold tabular-nums mt-1 ${s.cls ?? ""}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <CardTitle className="text-base">Attempt log</CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Days inactive</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempted</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : "No log entries yet. Run a sweep to begin."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((row) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.recipient_email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.last_sign_in_at
                          ? formatDistanceToNow(new Date(row.last_sign_in_at), { addSuffix: true })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{row.days_inactive ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className="text-muted-foreground">{row.eligibility_reason}</span>
                        {row.error_message && (
                          <div className="text-red-400 mt-1 break-all">{row.error_message}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.cls}>
                          <meta.Icon className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.attempted_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-xs">
                        {row.triggered_manually ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Manual</Badge>
                        ) : (
                          <span className="text-muted-foreground">Cron</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status !== "sent" && row.user_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => manualSend(row)}
                            disabled={sendingId === row.id}
                          >
                            <Send className={`h-3 w-3 mr-1 ${sendingId === row.id ? "animate-pulse" : ""}`} />
                            {sendingId === row.id ? "Sending…" : "Send now"}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminReEngagement;
