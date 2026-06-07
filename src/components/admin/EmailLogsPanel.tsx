import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface EmailLog {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string | null;
  error_message: string | null;
  created_at: string;
}

const RANGES: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  sent: "default",
  pending: "secondary",
  dlq: "destructive",
  failed: "destructive",
  bounced: "destructive",
  complained: "destructive",
  suppressed: "outline",
};

export function EmailLogsPanel() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<string>("7d");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGES[range] * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!error && data) {
      // Dedupe by message_id keeping latest
      const seen = new Set<string>();
      const deduped: EmailLog[] = [];
      for (const row of data as EmailLog[]) {
        const key = row.message_id ?? row.id;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row);
      }
      setLogs(deduped);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const templates = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.template_name && s.add(l.template_name));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (templateFilter !== "all" && l.template_name !== templateFilter) return false;
      if (search && !(l.recipient_email || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, statusFilter, templateFilter, search]);

  const stats = useMemo(() => {
    const s = { total: filtered.length, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    filtered.forEach((l) => {
      if (l.status === "sent") s.sent++;
      else if (l.status === "dlq" || l.status === "failed" || l.status === "bounced" || l.status === "complained") s.failed++;
      else if (l.status === "suppressed") s.suppressed++;
      else if (l.status === "pending") s.pending++;
    });
    return s;
  }, [filtered]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Send Logs
            </CardTitle>
            <CardDescription>
              All branded transactional and auth emails sent from the platform (deduplicated by message).
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <StatCard label="Total" value={stats.total} />
          <StatCard label="Sent" value={stats.sent} tone="success" />
          <StatCard label="Pending" value={stats.pending} />
          <StatCard label="Failed" value={stats.failed} tone="danger" />
          <StatCard label="Suppressed" value={stats.suppressed} />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="dlq">Failed (DLQ)</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={templateFilter} onValueChange={setTemplateFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by recipient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px]"
          />
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No emails in this range
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, 200).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{log.template_name || "—"}</TableCell>
                    <TableCell className="text-sm">{log.recipient_email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[log.status || ""] || "secondary"}>
                        {log.status || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[280px] truncate" title={log.error_message || ""}>
                      {log.error_message || ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 200 && (
          <p className="text-xs text-muted-foreground text-center">
            Showing the most recent 200 of {filtered.length} matching emails.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const toneClass =
    tone === "success" ? "text-green-600" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
