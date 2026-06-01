import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, UserPlus, DollarSign, Users, Link2, RefreshCw, ExternalLink, Palette, Mail, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AgencyClient {
  id: string;
  invite_email: string | null;
  invite_token: string;
  client_user_id: string | null;
  status: string;
  plan: string | null;
  monthly_value_cents: number;
  agency_earnings_cents: number;
  total_earnings_cents: number;
  joined_at: string | null;
  created_at: string;
}

const SITE = "https://salesos.alephwavex.io";

export const AgencyPortalTab = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Ensure white_label_settings row exists so referral_code is generated
      const { data: wl } = await supabase
        .from("white_label_settings")
        .select("referral_code, company_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!wl) {
        const { data: created } = await supabase
          .from("white_label_settings")
          .insert({ user_id: user.id })
          .select("referral_code")
          .single();
        if (created?.referral_code) setInviteLink(`${SITE}/auth?ref=${created.referral_code}`);
      } else {
        if (wl.referral_code) setInviteLink(`${SITE}/auth?ref=${wl.referral_code}`);
      }

      const { data: clientData, error } = await supabase
        .from("agency_clients")
        .select("*")
        .eq("agency_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClients((clientData as AgencyClient[]) || []);
    } catch (e: any) {
      toast.error("Failed to load agency data", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const copyLink = async (url: string, label = "Link") => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("agency_clients")
        .select("id")
        .eq("agency_id", user.id)
        .eq("invite_email", inviteEmail.trim())
        .maybeSingle();

      if (existing) { toast.error("This email is already invited"); return; }

      const { data: inserted, error } = await supabase
        .from("agency_clients")
        .insert({ agency_id: user.id, invite_email: inviteEmail.trim() })
        .select("invite_token")
        .single();

      if (error) throw error;

      const link = `${SITE}/auth?invite=${inserted.invite_token}`;
      toast.success("Invite created", {
        description: "Copy the link below and send it to your client.",
        duration: 8000,
        action: { label: "Copy", onClick: () => copyLink(link, "Invite link") },
      });
      setInviteEmail("");
      loadData();
    } catch (e: any) {
      toast.error("Failed to create invite", { description: e.message });
    } finally {
      setInviting(false);
    }
  };

  const activeClients = clients.filter(c => c.status === "active");
  const pendingClients = clients.filter(c => c.status === "pending");
  const totalMRR = activeClients.reduce((s, c) => s + c.monthly_value_cents, 0);
  const totalEarnings = clients.reduce((s, c) => s + c.total_earnings_cents, 0);
  const yourShare = Math.round(totalMRR * 0.5);

  const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : "—";
  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    active: "default", pending: "secondary", cancelled: "destructive",
  };

  return (
    <div className="space-y-6">

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Your clients sign up through your invite link and use the platform <strong>fully branded as your company</strong> — your logo, name, and colors, with no SalesOS branding visible. Set up your branding first in the{" "}
          <button className="underline font-medium" onClick={() => navigate("/settings?tab=white-label")}>
            White Label tab
          </button>.
        </AlertDescription>
      </Alert>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="text-xs">Active Clients</span>
            </div>
            <p className="text-2xl font-bold">{activeClients.length}</p>
            {pendingClients.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{pendingClients.length} pending</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Client MRR</span>
            </div>
            <p className="text-2xl font-bold">{fmtCents(totalMRR)}</p>
            <p className="text-xs text-muted-foreground mt-1">/mo combined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-green-600">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Your 50%</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{fmtCents(yourShare)}</p>
            <p className="text-xs text-muted-foreground mt-1">est. / mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Total Earned</span>
            </div>
            <p className="text-2xl font-bold">{fmtCents(totalEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">all-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Invite link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Your Platform Invite Link
          </CardTitle>
          <CardDescription>
            Anyone who signs up via this link will see <strong>your branding only</strong>. They won't know it's built on SalesOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteLink ? (
            <div className="flex gap-2">
              <Input readOnly value={inviteLink} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyLink(inviteLink, "Invite link")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Generating link…
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Revenue split: <span className="font-medium text-green-600">50% to you</span> · 50% to SalesOS.
            Payouts processed monthly — email <a href="mailto:support@alephwave.io" className="underline">support@alephwave.io</a> to request a transfer.
          </p>
        </CardContent>
      </Card>

      {/* Branding shortcut */}
      <Card className="border-dashed">
        <CardContent className="pt-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Set up your branding</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customise the name, logo, and colors your clients see.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/settings?tab=white-label")}>
            <Palette className="h-4 w-4 mr-2" />
            Open Branding
          </Button>
        </CardContent>
      </Card>

      {/* Invite by email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            Invite a Specific Client
          </CardTitle>
          <CardDescription>
            Generate a one-time invite link for a named client email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="invite-email" className="sr-only">Client email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="client@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={inviting}>
              {inviting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              Create Invite
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Client list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Clients
            </CardTitle>
            <CardDescription>Users currently on your white-label platform</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No clients yet. Share your invite link to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Their MRR</TableHead>
                    <TableHead className="text-right">Your 50%</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="text-sm">
                        {client.invite_email || client.client_user_id?.slice(0, 12) || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[client.status] ?? "outline"} className="capitalize text-xs">
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{client.plan || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{fmtCents(client.monthly_value_cents)}</TableCell>
                      <TableCell className="text-right text-sm font-mono text-green-600 font-medium">
                        {fmtCents(client.agency_earnings_cents || Math.round(client.monthly_value_cents * 0.5))}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(client.joined_at || client.created_at)}
                      </TableCell>
                      <TableCell>
                        {client.status === "pending" && (
                          <Button
                            variant="ghost" size="sm" className="h-7 px-2 text-xs"
                            onClick={() => copyLink(`${SITE}/auth?invite=${client.invite_token}`, "Invite link")}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        )}
                        {client.status === "active" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                            <a href={`${SITE}/client-portal/${client.invite_token}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Portal
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
