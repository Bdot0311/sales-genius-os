import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, UserPlus, DollarSign, TrendingUp, Users, Link, RefreshCw, ExternalLink, Mail, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
const REVENUE_SPLIT = 0.5;

export const AgencyPortalTab = () => {
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [referralCode, setReferralCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Ensure white_label_settings row exists with a referral_code
      const { data: wl, error: wlErr } = await supabase
        .from("white_label_settings")
        .select("referral_code")
        .eq("user_id", user.id)
        .maybeSingle();

      if (wlErr) throw wlErr;

      if (!wl) {
        // Create row with a generated referral code
        const { data: created } = await supabase
          .from("white_label_settings")
          .insert({ user_id: user.id })
          .select("referral_code")
          .single();
        if (created?.referral_code) setReferralCode(created.referral_code);
      } else {
        setReferralCode(wl.referral_code || "");
      }

      const { data: clientData, error: cErr } = await supabase
        .from("agency_clients")
        .select("*")
        .eq("agency_id", user.id)
        .order("created_at", { ascending: false });

      if (cErr) throw cErr;
      setClients((clientData as AgencyClient[]) || []);
    } catch (e: any) {
      toast.error("Failed to load agency data", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const referralLink = referralCode ? `${SITE}/auth?ref=${referralCode}` : "";
  const portalBase = `${SITE}/client-portal`;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
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

      if (existing) {
        toast.error("This email has already been invited");
        return;
      }

      const { data: inserted, error } = await supabase
        .from("agency_clients")
        .insert({ agency_id: user.id, invite_email: inviteEmail.trim() })
        .select("invite_token")
        .single();

      if (error) throw error;

      toast.success("Client invite created", {
        description: `Share this link with ${inviteEmail}: ${SITE}/auth?invite=${inserted.invite_token}`,
        duration: 8000,
        action: {
          label: "Copy link",
          onClick: () => copyToClipboard(`${SITE}/auth?invite=${inserted.invite_token}`, "Invite link"),
        },
      });
      setInviteEmail("");
      loadData();
    } catch (e: any) {
      toast.error("Failed to create invite", { description: e.message });
    } finally {
      setInviting(false);
    }
  };

  const totalMRR = clients.filter(c => c.status === "active").reduce((s, c) => s + c.monthly_value_cents, 0);
  const totalEarnings = clients.reduce((s, c) => s + c.total_earnings_cents, 0);
  const activeClients = clients.filter(c => c.status === "active").length;
  const pendingClients = clients.filter(c => c.status === "pending").length;

  const fmtCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : "—";

  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    active: "default",
    pending: "secondary",
    cancelled: "destructive",
  };

  return (
    <div className="space-y-6">

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Active Clients</span>
            </div>
            <p className="text-2xl font-bold">{activeClients}</p>
            {pendingClients > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{pendingClients} pending</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Client MRR</span>
            </div>
            <p className="text-2xl font-bold">{fmtCents(totalMRR)}</p>
            <p className="text-xs text-muted-foreground mt-1">combined / mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Your Share (50%)</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{fmtCents(totalMRR * REVENUE_SPLIT)}</p>
            <p className="text-xs text-muted-foreground mt-1">estimated / mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Earned</span>
            </div>
            <p className="text-2xl font-bold">{fmtCents(totalEarnings)}</p>
            <p className="text-xs text-muted-foreground mt-1">all-time</p>
          </CardContent>
        </Card>
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link className="h-4 w-4" />
            Your Referral Link
          </CardTitle>
          <CardDescription>
            Share this link to onboard new clients under your agency. Every paying client earns you 50% of their subscription revenue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {referralLink ? (
            <div className="flex gap-2">
              <Input readOnly value={referralLink} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(referralLink, "Referral link")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Generating your referral link…
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Revenue split: <span className="font-medium text-green-600">50% to you</span> · 50% to SalesOS. Payouts processed monthly. Contact <a href="mailto:support@alephwave.io" className="underline">support@alephwave.io</a> to request a payout.
          </p>
        </CardContent>
      </Card>

      {/* Invite a client */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            Invite a Client
          </CardTitle>
          <CardDescription>
            Send a personalised invite link directly to a client's email. They'll sign up linked to your agency automatically.
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
              Send Invite
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
            <CardDescription>
              All clients linked to your agency account
            </CardDescription>
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
              <p className="text-sm">No clients yet. Share your referral link to get started.</p>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {client.status === "pending" && <Clock className="h-3 w-3 text-muted-foreground shrink-0" />}
                          <span className="text-sm">
                            {client.invite_email || client.client_user_id?.slice(0, 8) || "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[client.status] ?? "outline"} className="capitalize text-xs">
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{client.plan || "—"}</TableCell>
                      <TableCell className="text-right text-sm font-mono">
                        {fmtCents(client.monthly_value_cents)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-mono text-green-600 font-medium">
                        {fmtCents(client.agency_earnings_cents || client.monthly_value_cents * REVENUE_SPLIT)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(client.joined_at || client.created_at)}
                      </TableCell>
                      <TableCell>
                        {client.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => copyToClipboard(
                              `${SITE}/auth?invite=${client.invite_token}`,
                              "Invite link"
                            )}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy link
                          </Button>
                        )}
                        {client.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            asChild
                          >
                            <a href={`${portalBase}/${client.invite_token}`} target="_blank" rel="noopener noreferrer">
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

      {/* Payout info */}
      <Card className="border-dashed">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">How payouts work:</span> Revenue is tracked automatically when your clients are billed through Stripe. Earnings accumulate in your agency balance. Payouts are processed manually on request — email <a href="mailto:support@alephwave.io" className="text-primary underline">support@alephwave.io</a> with your agency email to request a transfer. Stripe Connect automated payouts coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
