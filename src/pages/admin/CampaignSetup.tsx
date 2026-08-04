import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, ShieldOff, ExternalLink, Send, MailPlus } from "lucide-react";

interface SetupRequest {
  id: string;
  user_id: string | null;
  source: string;
  plan: string | null;
  created_at: string;
  contact_email: string | null;
  contact_name: string | null;
  status: string;
  direction: string;
  access_requested_at: string | null;
  access_request_count: number;
}

interface Grant {
  id: string;
  user_id: string;
  scopes: string[];
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  completed_at: string | null;
}

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
}

const isActive = (g: Grant) =>
  !g.revoked_at && !g.completed_at && new Date(g.expires_at) > new Date();

const AdminCampaignSetup = () => {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<SetupRequest[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outEmail, setOutEmail] = useState("");
  const [outNote, setOutNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: grs }] = await Promise.all([
      supabase
        .from("campaign_setup_requests")
        .select(
          "id, user_id, source, plan, created_at, contact_email, contact_name, status, direction, access_requested_at, access_request_count",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("support_access_grants")
        .select("id, user_id, scopes, granted_at, expires_at, revoked_at, completed_at")
        .order("granted_at", { ascending: false })
        .limit(200),
    ]);

    const rows = (reqs as SetupRequest[]) ?? [];
    const grantRows = (grs as Grant[]) ?? [];
    const ids = Array.from(
      new Set([...rows.map((r) => r.user_id), ...grantRows.map((g) => g.user_id)].filter(Boolean) as string[]),
    );

    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      for (const p of (profs as Profile[]) ?? []) map[p.id] = p;
      setProfiles(map);
    }

    setRequests(rows);
    setGrants(grantRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const endAccess = async (grant: Grant) => {
    setBusyId(grant.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase
        .from("support_access_grants")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", grant.id);
      if (error) throw error;

      await supabase.from("support_access_events").insert({
        grant_id: grant.id,
        user_id: grant.user_id,
        admin_id: user.id,
        action: "Setup completed — access ended by OutReign team",
      });

      toast.success("Access ended for this customer");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not end access");
    } finally {
      setBusyId(null);
    }
  };

  /** Outbound: ask a customer to grant setup access. */
  const requestAccess = async (opts: { email?: string; userId?: string; note?: string; busyKey: string }) => {
    setBusyId(opts.busyKey);
    try {
      const { data, error } = await supabase.functions.invoke("request-campaign-setup-access", {
        body: { email: opts.email, userId: opts.userId, note: opts.note || null },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string; email?: string };
      if (!res?.success) throw new Error(res?.error || "Could not send the request");
      toast.success(`Access request sent to ${res.email}`);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the request");
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const sendOutbound = async () => {
    const email = outEmail.trim();
    if (!email) {
      toast.error("Enter the customer's email");
      return;
    }
    setSending(true);
    const ok = await requestAccess({ email, note: outNote, busyKey: "outbound" });
    if (ok) {
      setOutEmail("");
      setOutNote("");
    }
    setSending(false);
  };

  const who = (r: { user_id: string | null; contact_email: string | null; contact_name: string | null }) => {
    if (r.user_id && profiles[r.user_id]) {
      return profiles[r.user_id].email ?? profiles[r.user_id].full_name ?? r.user_id.slice(0, 8);
    }
    return r.contact_email ?? r.contact_name ?? "Anonymous visitor";
  };

  const activeGrants = grants.filter(isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campaign setup</h1>
          <p className="text-sm text-muted-foreground">
            Inbound bookings, outbound access requests, and consented time-limited access to customer accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailPlus className="h-5 w-5" />
            Request access from a customer
          </CardTitle>
          <CardDescription>
            Sends the customer an email asking them to grant 14-day setup access. They still approve it themselves in
            Settings → Support access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <Input
              type="email"
              placeholder="customer@company.com"
              value={outEmail}
              onChange={(e) => setOutEmail(e.target.value)}
              autoComplete="off"
            />
            <Button onClick={sendOutbound} disabled={sending} className="gap-1.5 sm:w-auto">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send request
            </Button>
          </div>
          <Textarea
            placeholder="Optional note included in the email (e.g. 'Following up on our call today')"
            value={outNote}
            onChange={(e) => setOutNote(e.target.value)}
            rows={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Active access ({activeGrants.length})
          </CardTitle>
          <CardDescription>
            You can work in these accounts now. End access as soon as the setup is done.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeGrants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customer has granted access right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Granted</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeGrants.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">
                        {who({ user_id: g.user_id, contact_email: null, contact_name: null })}
                      </TableCell>
                      <TableCell className="space-x-1">
                        {g.scopes.map((s) => (
                          <Badge key={s} variant="outline" className="text-[10px]">
                            {s.replace("_", " ")}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(g.granted_at), "MMM d, p")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(g.expires_at), "MMM d, p")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={busyId === g.id}
                          onClick={() => endAccess(g)}
                        >
                          {busyId === g.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5" />
                          )}
                          End access
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Setup requests ({requests.length})
          </CardTitle>
          <CardDescription>
            Everyone who clicked a "book a campaign setup" call to action, plus outbound requests you sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => {
                    const g = r.user_id ? grants.find((x) => x.user_id === r.user_id && isActive(x)) : undefined;
                    const target = r.user_id ?? undefined;
                    const email = r.contact_email ?? (r.user_id ? profiles[r.user_id]?.email : null) ?? undefined;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{who(r)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {r.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.plan ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.source}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, p")}
                        </TableCell>
                        <TableCell>
                          {g ? (
                            <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                              Granted
                            </Badge>
                          ) : r.access_requested_at ? (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                              Asked {r.access_request_count}×
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                              Awaiting consent
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {g || (!target && !email) ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={busyId === r.id}
                              onClick={() => requestAccess({ userId: target, email, busyKey: r.id })}
                            >
                              {busyId === r.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5" />
                              )}
                              {r.access_requested_at ? "Ask again" : "Request access"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCampaignSetup;
