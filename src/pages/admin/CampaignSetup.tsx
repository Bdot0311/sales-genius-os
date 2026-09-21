import { Fragment, useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldOff, Send, ChevronDown, ChevronRight } from "lucide-react";
import { SupportAccessWorkspace } from "@/components/admin/SupportAccessWorkspace";

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
  /** What the visitor told us, and where the click came from. Logged all
   *  along, just never shown — the table read as "Anonymous visitor" with
   *  nothing to act on. */
  metadata: Record<string, unknown> | null;
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
  /** Which request is expanded to show what the visitor told us. */
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  /** Which granted account is expanded for setup work. */
  const [openGrantId, setOpenGrantId] = useState<string | null>(null);
  const [outEmail, setOutEmail] = useState("");
  const [outNote, setOutNote] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: grs }] = await Promise.all([
      supabase
        .from("campaign_setup_requests")
        .select(
          "id, user_id, source, plan, created_at, contact_email, contact_name, status, direction, access_requested_at, access_request_count, metadata",
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

      <Panel>
        <PanelHeader>
          <PanelTitle>Request access from a customer</PanelTitle>
          <PanelDescription>
            Sends the customer an email asking them to grant 14-day setup access. They still approve it themselves in
            Settings → Support access.
          </PanelDescription>
        </PanelHeader>
        <PanelBody className="space-y-3">
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
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Active access ({activeGrants.length})</PanelTitle>
          <PanelDescription>
            Open an account to build their sequences. End access as soon as the setup is done.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
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
                  <Fragment key={g.id}>
                    <TableRow>
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
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-1.5"
                          onClick={() => setOpenGrantId((cur) => (cur === g.id ? null : g.id))}
                        >
                          {openGrantId === g.id ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {openGrantId === g.id ? "Close" : "Open account"}
                        </Button>
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
                    {openGrantId === g.id && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30">
                          <SupportAccessWorkspace
                            grant={g}
                            customerLabel={
                              profiles[g.user_id]?.full_name ??
                              profiles[g.user_id]?.email ??
                              "this customer"
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelTitle>Setup requests ({requests.length})</PanelTitle>
          <PanelDescription>
            Everyone who clicked a "book a campaign setup" call to action, plus outbound requests you sent.
          </PanelDescription>
        </PanelHeader>
        <PanelBody>
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
                    const meta = (r.metadata ?? {}) as Record<string, unknown>;
                    const detail = (key: string) => {
                      const v = meta[key];
                      return typeof v === "string" && v.trim() ? v.trim() : null;
                    };
                    const details: Array<[string, string]> = [
                      ["Company", detail("company")],
                      ["Website", detail("website")],
                      ["Ideal customer", detail("audience")],
                      ["Goal", detail("goal")],
                      ["Page", detail("path")],
                      ["Came from", detail("referrer")],
                    ].filter((x): x is [string, string] => !!x[1]);
                    const expanded = openRequestId === r.id;
                    return (
                      <Fragment key={r.id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="space-y-1">
                            <div>{who(r)}</div>
                            {details.length > 0 ? (
                              <button
                                type="button"
                                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                                onClick={() => setOpenRequestId(expanded ? null : r.id)}
                              >
                                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {expanded ? "Hide details" : `Details (${details.length})`}
                              </button>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">Click only — no answers submitted</p>
                            )}
                          </div>
                        </TableCell>
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
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <dl className="grid gap-2 sm:grid-cols-2">
                              {details.map(([label, value]) => (
                                <div key={label}>
                                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                                  <dd className="text-sm break-words">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </TableCell>
                        </TableRow>
                      )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
};

export default AdminCampaignSetup;
