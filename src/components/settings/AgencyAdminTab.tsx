import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TeamMembersTab } from "@/components/settings/TeamMembersTab";
import { TeamActivityTab } from "@/components/settings/TeamActivityTab";
import { WhiteLabelTab } from "@/components/settings/WhiteLabelTab";
import {
  Building2, Users, ShieldCheck, Copy, Loader2, Pencil, Archive, ArchiveRestore,
  Link2, ExternalLink, Ban, Mail, Info, Activity, Palette, RefreshCw, Lock,
} from "lucide-react";

const SITE = "https://outreign.io";

interface AgencyClient {
  id: string;
  agency_id: string;
  client_user_id: string | null;
  invite_email: string | null;
  invite_token: string;
  status: string;
  plan: string | null;
  monthly_value_cents: number;
  total_earnings_cents: number;
  joined_at: string | null;
  created_at: string;
  client_name: string | null;
  company_domain: string | null;
  notes: string | null;
  assigned_member_id: string | null;
  archived: boolean;
}

interface ClientStats {
  client_id: string;
  leads_count: number;
  emails_sent_count: number;
  sequences_count: number;
  last_activity_at: string | null;
}

interface Member {
  id: string;
  member_email: string;
  role: string;
  status: string;
}

const fmtCents = (c: number) => `$${((c || 0) / 100).toFixed(2)}`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export const AgencyAdminTab = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [stats, setStats] = useState<Record<string, ClientStats>>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [referralLink, setReferralLink] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviting, setInviting] = useState(false);

  const [editing, setEditing] = useState<AgencyClient | null>(null);
  const [editForm, setEditForm] = useState({ client_name: "", company_domain: "", notes: "", assigned_member_id: "none" });
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<AgencyClient | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let wl = (await supabase
        .from("white_label_settings")
        .select("referral_code")
        .eq("user_id", user.id)
        .maybeSingle()).data;

      if (!wl) {
        wl = (await supabase
          .from("white_label_settings")
          .insert({ user_id: user.id })
          .select("referral_code")
          .single()).data;
      }
      if (wl?.referral_code) setReferralLink(`${SITE}/auth?ref=${wl.referral_code}`);

      const [clientRes, memberRes, statRes] = await Promise.all([
        supabase.from("agency_clients").select("*").eq("agency_id", user.id).order("created_at", { ascending: false }),
        supabase.from("team_members").select("id, member_email, role, status").eq("team_owner_id", user.id).order("created_at"),
        (supabase as any).rpc("agency_client_stats"),
      ]);

      if (clientRes.error) throw clientRes.error;
      setClients((clientRes.data as unknown as AgencyClient[]) || []);
      setMembers((memberRes.data as Member[]) || []);

      const map: Record<string, ClientStats> = {};
      for (const row of ((statRes.data as ClientStats[]) || [])) map[row.client_id] = row;
      setStats(map);
    } catch (e: any) {
      toast.error("Failed to load agency data", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (value: string, label = "Link") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const visible = useMemo(
    () => clients.filter((c) => (showArchived ? c.archived : !c.archived)),
    [clients, showArchived]
  );
  const active = clients.filter((c) => c.status === "active" && !c.archived);
  const pending = clients.filter((c) => c.status === "pending" && !c.archived);
  const totalMRR = active.reduce((s, c) => s + (c.monthly_value_cents || 0), 0);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setInviting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("agency_clients")
        .select("id")
        .eq("agency_id", user.id)
        .eq("invite_email", email)
        .maybeSingle();
      if (existing) { toast.error("This client is already invited"); return; }

      const { data: inserted, error } = await supabase
        .from("agency_clients")
        .insert({ agency_id: user.id, invite_email: email, client_name: inviteName.trim() || null } as any)
        .select("invite_token")
        .single();
      if (error) throw error;

      const link = `${SITE}/auth?invite=${(inserted as any).invite_token}`;
      toast.success("Client workspace invite created", {
        description: "Send this link to your client — it provisions their own isolated workspace.",
        duration: 9000,
        action: { label: "Copy", onClick: () => copy(link, "Invite link") },
      });
      setInviteEmail("");
      setInviteName("");
      load();
    } catch (e: any) {
      toast.error("Failed to create invite", { description: e.message });
    } finally {
      setInviting(false);
    }
  };

  const openEdit = (c: AgencyClient) => {
    setEditing(c);
    setEditForm({
      client_name: c.client_name || "",
      company_domain: c.company_domain || "",
      notes: c.notes || "",
      assigned_member_id: c.assigned_member_id || "none",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from("agency_clients")
        .update({
          client_name: editForm.client_name.trim() || null,
          company_domain: editForm.company_domain.trim().replace(/^https?:\/\//, "") || null,
          notes: editForm.notes.trim() || null,
          assigned_member_id: editForm.assigned_member_id === "none" ? null : editForm.assigned_member_id,
        })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Client account updated");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error("Failed to update client", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (c: AgencyClient) => {
    try {
      const { error } = await (supabase as any)
        .from("agency_clients")
        .update({ archived: !c.archived })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(c.archived ? "Client restored" : "Client archived");
      load();
    } catch (e: any) {
      toast.error("Failed to update client", { description: e.message });
    }
  };

  const revokeAccess = async () => {
    if (!revoking) return;
    try {
      const { error } = await (supabase as any)
        .from("agency_clients")
        .update({ status: "cancelled" })
        .eq("id", revoking.id);
      if (error) throw error;
      toast.success("Client access revoked", { description: "Their client portal link no longer resolves." });
      setRevoking(null);
      load();
    } catch (e: any) {
      toast.error("Failed to revoke access", { description: e.message });
    }
  };

  const memberLabel = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.member_email ?? "—" : "—";

  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    active: "default", pending: "secondary", cancelled: "destructive",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Agency Admin
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage client workspaces, team access, and workspace configuration in one place.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 self-start" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Building2 className="h-4 w-4" /><span className="text-xs">Client Workspaces</span>
            </div>
            <p className="text-2xl font-bold">{active.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{pending.length} pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Users className="h-4 w-4" /><span className="text-xs">Team Seats Used</span>
            </div>
            <p className="text-2xl font-bold">{members.length}<span className="text-base text-muted-foreground">/10</span></p>
            <p className="text-xs text-muted-foreground mt-1">
              {members.filter((m) => m.status === "active").length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Activity className="h-4 w-4" /><span className="text-xs">Client MRR</span>
            </div>
            <p className="text-2xl font-bold">{fmtCents(totalMRR)}</p>
            <p className="text-xs text-muted-foreground mt-1">combined / mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-1 text-muted-foreground">
              <Lock className="h-4 w-4" /><span className="text-xs">Data Isolation</span>
            </div>
            <p className="text-2xl font-bold text-green-500">On</p>
            <p className="text-xs text-muted-foreground mt-1">per-workspace</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="clients" className="space-y-6">
        <TabsList className="h-auto grid grid-cols-2 sm:grid-cols-5 gap-2 bg-transparent p-0 w-full">
          <TabsTrigger value="clients" className="gap-2 data-[state=active]:bg-muted"><Building2 className="h-4 w-4" />Clients</TabsTrigger>
          <TabsTrigger value="team" className="gap-2 data-[state=active]:bg-muted"><Users className="h-4 w-4" />Team Access</TabsTrigger>
          <TabsTrigger value="workspace" className="gap-2 data-[state=active]:bg-muted"><Palette className="h-4 w-4" />Workspace</TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 data-[state=active]:bg-muted"><Activity className="h-4 w-4" />Audit Log</TabsTrigger>
          <TabsTrigger value="security" className="gap-2 data-[state=active]:bg-muted"><ShieldCheck className="h-4 w-4" />Access & Isolation</TabsTrigger>
        </TabsList>

        {/* CLIENTS */}
        <TabsContent value="clients" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Add a Client Workspace</CardTitle>
              <CardDescription>
                Each client gets their own isolated workspace — leads, sequences, inboxes and analytics are never shared between clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleInvite} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="client-name">Client / company name</Label>
                  <Input id="client-name" placeholder="Acme Inc" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-email">Client email</Label>
                  <Input id="client-email" type="email" placeholder="ops@acme.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={inviting} className="gap-2 w-full sm:w-auto">
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                    {inviting ? "Creating…" : "Create Workspace"}
                  </Button>
                </div>
              </form>
              {referralLink && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" />General signup link (white-labeled)</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={referralLink} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={() => copy(referralLink, "Signup link")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Client Accounts</CardTitle>
                  <CardDescription>Assign an owner, keep internal notes, and control access per client.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? "Show active" : `Show archived (${clients.filter((c) => c.archived).length})`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {visible.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">{showArchived ? "No archived clients." : "No client workspaces yet. Create your first one above."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead>Last activity</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((c) => {
                        const s = stats[c.id];
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="max-w-[220px]">
                              <p className="font-medium truncate">{c.client_name || c.invite_email || "Unnamed client"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.company_domain || c.invite_email || "—"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusVariant[c.status] || "outline"} className="capitalize">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">
                              {memberLabel(c.assigned_member_id)}
                            </TableCell>
                            <TableCell className="text-right text-sm">{s ? s.leads_count : "—"}</TableCell>
                            <TableCell className="text-right text-sm">{s ? s.emails_sent_count : "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtDate(s?.last_activity_at ?? null)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{fmtDate(c.joined_at)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" title="Edit client" onClick={() => openEdit(c)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon" title="Copy invite / portal link"
                                  onClick={() => copy(
                                    c.status === "pending"
                                      ? `${SITE}/auth?invite=${c.invite_token}`
                                      : `${SITE}/client-portal/${c.invite_token}`,
                                    c.status === "pending" ? "Invite link" : "Portal link"
                                  )}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                {c.status === "active" && (
                                  <Button
                                    variant="ghost" size="icon" title="Open client portal"
                                    onClick={() => window.open(`/client-portal/${c.invite_token}`, "_blank")}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                                {c.status === "active" && (
                                  <Button variant="ghost" size="icon" title="Revoke access" onClick={() => setRevoking(c)}>
                                    <Ban className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost" size="icon"
                                  title={c.archived ? "Restore client" : "Archive client"}
                                  onClick={() => toggleArchive(c)}
                                >
                                  {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                                </Button>
                              </div>
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

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Client counts above are aggregate activity only. You never see another client's leads, emails, or replies from
              this panel — each workspace is locked to its own account.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* TEAM ACCESS */}
        <TabsContent value="team" className="space-y-6">
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Team members work inside <strong>your</strong> agency workspace. Assign a member as owner of a client account on the
              Clients tab so responsibility is always clear.
            </AlertDescription>
          </Alert>
          <TeamMembersTab />
        </TabsContent>

        {/* WORKSPACE CONFIG */}
        <TabsContent value="workspace" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Workspace Configuration</CardTitle>
              <CardDescription>Branding, custom domain, and the client-facing experience for every workspace you run.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Button variant="outline" className="gap-2 justify-start" onClick={() => navigate("/settings?tab=api-keys")}>
                <Lock className="h-4 w-4" />API keys
              </Button>
              <Button variant="outline" className="gap-2 justify-start" onClick={() => navigate("/settings?tab=webhooks")}>
                <Link2 className="h-4 w-4" />Webhooks
              </Button>
              <Button variant="outline" className="gap-2 justify-start" onClick={() => navigate("/settings?tab=notifications")}>
                <Mail className="h-4 w-4" />Notifications
              </Button>
            </CardContent>
          </Card>
          <WhiteLabelTab />
        </TabsContent>

        {/* AUDIT LOG */}
        <TabsContent value="activity">
          <TeamActivityTab />
        </TabsContent>

        {/* ACCESS & ISOLATION */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Access & Data Isolation</CardTitle>
              <CardDescription>How client data stays separated across the workspaces you manage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                ["Per-workspace ownership", "Every lead, sequence, inbox, and email belongs to a single client workspace and is enforced at the database level — not in the UI."],
                ["No cross-client reads", "Your admin panel only receives aggregate counts per client. Record-level data is never returned across workspaces."],
                ["Revocable access", "Revoking a client cancels their portal link immediately. Archiving keeps history without showing it in your active list."],
                ["Scoped team roles", "Team members act inside your agency workspace only. Removing a member instantly ends their access."],
                ["Audited actions", "Team actions are written to the audit log so you can prove who changed what, and when."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3 p-3 rounded-lg border bg-muted/30">
                  <ShieldCheck className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit client dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit client account</DialogTitle>
            <DialogDescription>{editing?.invite_email || "Client workspace details"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Client name</Label>
              <Input id="edit-name" value={editForm.client_name} onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })} placeholder="Acme Inc" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-domain">Company domain</Label>
              <Input id="edit-domain" value={editForm.company_domain} onChange={(e) => setEditForm({ ...editForm, company_domain: e.target.value })} placeholder="acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Account owner</Label>
              <Select value={editForm.assigned_member_id} onValueChange={(v) => setEditForm({ ...editForm, assigned_member_id: v })}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.member_email} · {m.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Internal notes</Label>
              <Textarea id="edit-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Offer, ICP, sending domains, anything your team should know." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke client access?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.client_name || revoking?.invite_email} will lose access to their client portal link. Their workspace data is
              kept and access can be restored by re-inviting them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revokeAccess} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </Dialog>
      </AlertDialog>
    </div>
  );
};
