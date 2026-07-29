import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldCheck, ShieldOff, ExternalLink } from "lucide-react";

interface SetupRequest {
  id: string;
  user_id: string;
  source: string;
  plan: string | null;
  created_at: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: reqs }, { data: grs }] = await Promise.all([
      supabase
        .from("campaign_setup_requests")
        .select("id, user_id, source, plan, created_at")
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
    const ids = Array.from(new Set([...rows.map((r) => r.user_id), ...grantRows.map((g) => g.user_id)]));

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

  const who = (id: string) => profiles[id]?.email ?? profiles[id]?.full_name ?? id.slice(0, 8);

  const activeGrants = grants.filter(isActive);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaign setup</h1>
          <p className="text-sm text-muted-foreground">
            Booking requests and consented, time-limited access to customer accounts.
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
                    <TableCell className="font-medium">{who(g.user_id)}</TableCell>
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
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Setup requests ({requests.length})
          </CardTitle>
          <CardDescription>Everyone who clicked a "book a campaign setup" call to action.</CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const g = grants.find((x) => x.user_id === r.user_id && isActive(x));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{who(r.user_id)}</TableCell>
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
                        ) : (
                          <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                            Awaiting consent
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCampaignSetup;
