import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, Mail, Plus, Trash2, AlertCircle, Lock } from "lucide-react";
import { toast } from "sonner";

interface Mailbox {
  id: string;
  email: string;
  warmup_active: boolean | null;
  current_week: number | null;
  start_date: string | null;
  created_at: string;
}

const WARMUP_LIMITS = [10, 25, 50, 100];

const Deliverability = () => {
  const queryClient = useQueryClient();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan } = usePlanFeatures();
  const deliverabilityGated = !hasFeature('deliverabilityDashboard');
  const [domainInput, setDomainInput] = useState("");
  const [showDNSCheck, setShowDNSCheck] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ["mailbox-warmup"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("mailbox_warmup")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Mailbox[];
    },
  });

  const addMailbox = useMutation({
    mutationFn: async (email: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("mailbox_warmup").insert({ user_id: user.id, email, warmup_active: false, current_week: 1 });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailbox-warmup"] });
      setAddDialogOpen(false);
      setNewEmail("");
      toast.success("Mailbox added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleWarmup = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const updates: any = { warmup_active: active };
      if (active) updates.start_date = new Date().toISOString();
      const { error } = await supabase.from("mailbox_warmup").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mailbox-warmup"] }),
  });

  const deleteMailbox = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mailbox_warmup").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mailbox-warmup"] });
      toast.success("Mailbox removed");
    },
  });

  const getProvider = (email: string) => {
    if (email.includes("gmail") || email.includes("googlemail")) return "Gmail";
    if (email.includes("outlook") || email.includes("hotmail") || email.includes("live")) return "Outlook";
    return "Custom";
  };

  const getHealthScore = (mb: Mailbox) => {
    let score = 60;
    if (mb.warmup_active) score += 20;
    if ((mb.current_week || 1) >= 3) score += 20;
    return Math.min(score, 100);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deliverability</h1>
          <p className="text-muted-foreground">Monitor mailbox health, warmup progress, and DNS configuration</p>
        </div>

        {deliverabilityGated ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Lock className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Deliverability Dashboard</h3>
              <p className="text-muted-foreground text-center mb-4">Monitor mailbox health, warmup progress, DNS configuration, and sending rules. Available on Growth and above.</p>
              <Button onClick={() => setGateModalOpen(true)}>Upgrade to Unlock</Button>
            </CardContent>
          </Card>
        ) : (
        <>
        {/* Section 1: Connected Mailboxes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Connected Mailboxes</h2>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Connect Mailbox</Button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
          ) : (mailboxes || []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No mailboxes connected</h3>
                <p className="text-muted-foreground text-center mb-4">Connect your sending mailboxes to monitor deliverability.</p>
                <Button onClick={() => setAddDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Connect Mailbox</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(mailboxes || []).map((mb) => {
                const health = getHealthScore(mb);
                const week = mb.current_week || 1;
                const dailyLimit = WARMUP_LIMITS[Math.min(week - 1, 3)];
                return (
                  <Card key={mb.id}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">{mb.email}</CardTitle>
                          <CardDescription>{getProvider(mb.email)}</CardDescription>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMailbox.mutate(mb.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Health Score</span>
                        <Badge variant="outline" className={health >= 80 ? "text-green-500 border-green-500/30" : health >= 50 ? "text-yellow-500 border-yellow-500/30" : "text-red-500 border-red-500/30"}>
                          {health >= 80 ? "🟢" : health >= 50 ? "🟡" : "🔴"} {health}/100
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Daily limit</span>
                        <span className="text-xs font-medium">{dailyLimit}/day</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Warmup</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{mb.warmup_active ? "Active" : "Off"}</span>
                          <Switch checked={mb.warmup_active || false} onCheckedChange={(checked) => toggleWarmup.mutate({ id: mb.id, active: checked })} className="scale-75" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Warmup Tracker */}
        {(mailboxes || []).filter((m) => m.warmup_active).length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Warmup Tracker</h2>
            {(mailboxes || []).filter((m) => m.warmup_active).map((mb) => {
              const week = mb.current_week || 1;
              const progress = (week / 4) * 100;
              return (
                <Card key={mb.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{mb.email}</CardTitle>
                    <CardDescription>Week {week} of 4 — {WARMUP_LIMITS[Math.min(week - 1, 3)]}/day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress value={Math.min(progress, 100)} className="h-2" />
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Wk 1: 10/day</span><span>Wk 2: 25/day</span><span>Wk 3: 50/day</span><span>Wk 4: 100/day</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Section 3: DNS Health Checker */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">DNS Health Checker</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Check a domain</CardTitle>
              <CardDescription>Verify SPF, DKIM, and DMARC records for your sending domain</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="yourdomain.com" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} />
                <Button onClick={() => setShowDNSCheck(!!domainInput)}>Check</Button>
              </div>
              {showDNSCheck && (
                <div className="space-y-3">
                  {[
                    { label: "SPF Record", status: "warning", detail: "Manual verification required" },
                    { label: "DKIM", status: "warning", detail: "Check your email provider admin console" },
                    { label: "DMARC", status: "warning", detail: "Recommended: set up a DMARC policy" },
                    { label: "Custom Domain Sending", status: "warning", detail: "Verify you're sending from a workspace domain" },
                  ].map((check) => (
                    <div key={check.label} className="flex items-center gap-3 p-3 rounded-lg border">
                      <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{check.label}</p>
                        <p className="text-xs text-muted-foreground">{check.detail}</p>
                      </div>
                      <Badge variant="outline">Check Manually</Badge>
                    </div>
                  ))}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="spf">
                      <AccordionTrigger className="text-sm">How to set up SPF</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-2">Add this TXT record to your DNS:</p>
                        <code className="block p-2 rounded bg-muted text-xs">v=spf1 include:_spf.google.com ~all</code>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="dkim">
                      <AccordionTrigger className="text-sm">How to set up DKIM</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground">Enable DKIM in your Google Workspace Admin console under Apps → Google Workspace → Gmail → Authenticate email.</p>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="dmarc">
                      <AccordionTrigger className="text-sm">How to set up DMARC</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-2">Add this TXT record to your DNS:</p>
                        <code className="block p-2 rounded bg-muted text-xs">v=DMARC1; p=quarantine; rua=mailto:dmarc@{domainInput}</code>
                      </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="custom">
                      <AccordionTrigger className="text-sm">How to verify custom domain sending</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground">Ensure you're sending from a Google Workspace or Microsoft 365 domain, not a personal Gmail/Outlook account. Personal accounts have lower deliverability and stricter rate limits.</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 4: Sending Rules */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Sending Rules</h2>
          <Card>
            <CardContent className="py-6 space-y-3">
              {[
                { label: "Max sends per mailbox per day", value: "100" },
                { label: "Send time window", value: "Tue–Thu, 7am–9am & 1pm–3pm (recipient TZ)" },
                { label: "Delay between sends", value: "30–120 seconds (randomized)" },
                { label: "Rotation", value: "Round-robin across connected mailboxes" },
                { label: "Text variation", value: "Subtle rewording per batch to avoid pattern detection" },
              ].map((rule) => (
                <div key={rule.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">{rule.label}</span>
                  <span className="text-sm font-medium">{rule.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Mailbox Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Mailbox</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input placeholder="you@company.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              For full sending capabilities, connect your Gmail via the Integrations page. This adds the mailbox for warmup tracking and deliverability monitoring.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => addMailbox.mutate(newEmail)} disabled={!newEmail.includes("@")}>Add Mailbox</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Deliverability;
