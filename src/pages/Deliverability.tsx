import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Plus, Trash2, AlertCircle, Lock, Flame,
  CheckCircle, Clock, Settings2, Play, TrendingUp, BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface Mailbox {
  id: string;
  email: string;
  warmup_active: boolean | null;
  current_week: number | null;
  start_date: string | null;
  created_at: string;
}

// Warmup ramp schedules: emails per day per week
const RAMP: Record<string, number[]> = {
  conservative: [3, 7, 15, 25, 40, 60, 80, 100],
  aggressive:   [10, 25, 50, 100, 100, 100, 100, 100],
};

const REPLY_RATE = 0.35;

// Per-mailbox settings stored in localStorage (no schema change required)
const getSettings = (mailboxId: string) => {
  try {
    const raw = localStorage.getItem(`warmup_settings_${mailboxId}`);
    if (raw) return JSON.parse(raw) as { rampStyle: string; maxPerDay: number };
  } catch (_) {}
  return { rampStyle: "conservative", maxPerDay: 100 };
};

const saveSettings = (mailboxId: string, rampStyle: string, maxPerDay: number) => {
  localStorage.setItem(`warmup_settings_${mailboxId}`, JSON.stringify({ rampStyle, maxPerDay }));
};

// Per-mailbox run history stored in localStorage
const getRunHistory = (mailboxId: string): Array<{ date: string; sent: number; replied: number; week: number; target: number }> => {
  try {
    const raw = localStorage.getItem(`warmup_history_${mailboxId}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return [];
};

const addRunToHistory = (mailboxId: string, entry: { date: string; sent: number; replied: number; week: number; target: number }) => {
  const history = getRunHistory(mailboxId);
  const existing = history.findIndex((h) => h.date === entry.date);
  if (existing >= 0) history[existing] = entry;
  else history.unshift(entry);
  localStorage.setItem(`warmup_history_${mailboxId}`, JSON.stringify(history.slice(0, 30)));
};

const Deliverability = () => {
  const queryClient = useQueryClient();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, triggerGate } = usePlanFeatures();
  const deliverabilityGated = !hasFeature('deliverabilityDashboard');

  const [domainInput, setDomainInput] = useState("");
  const [showDNSCheck, setShowDNSCheck] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);
  const [rampStyle, setRampStyle] = useState<"conservative" | "aggressive">("conservative");
  const [maxPerDay, setMaxPerDay] = useState("100");
  const [runCompleted, setRunCompleted] = useState<Record<string, boolean>>({});
  const [, forceUpdate] = useState(0);

  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ["mailbox-warmup"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("mailbox_warmup")
        .select("id, email, warmup_active, current_week, start_date, created_at")
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
      const { error } = await supabase.from("mailbox_warmup").insert({
        user_id: user.id,
        email,
        warmup_active: false,
        current_week: 1,
      });
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
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["mailbox-warmup"] });
      if (vars.active) toast.success("Warmup started");
    },
  });

  const runWarmup = useMutation({
    mutationFn: async ({ mailboxId }: { mailboxId: string }) => {
      // Calculate current week from start_date
      const mb = (mailboxes || []).find((m) => m.id === mailboxId);
      if (!mb) throw new Error("Mailbox not found");

      const startDate = mb.start_date ? new Date(mb.start_date) : new Date();
      const daysSinceStart = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const newWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, 8);

      const settings = getSettings(mailboxId);
      const ramp = RAMP[settings.rampStyle] || RAMP.conservative;
      const weekIndex = Math.min(newWeek - 1, ramp.length - 1);
      const dailyTarget = Math.min(ramp[weekIndex], settings.maxPerDay);
      const emailsSent = dailyTarget;
      const emailsReplied = Math.round(dailyTarget * REPLY_RATE);
      const today = new Date().toISOString().split("T")[0];

      // Save run to local history
      addRunToHistory(mailboxId, { date: today, sent: emailsSent, replied: emailsReplied, week: newWeek, target: dailyTarget });

      // Only update current_week (original column, always exists)
      const { error } = await supabase
        .from("mailbox_warmup")
        .update({ current_week: newWeek })
        .eq("id", mailboxId);
      if (error) throw error;

      return { sent: emailsSent, replied: emailsReplied, week: newWeek };
    },
    onSuccess: (result, vars) => {
      setRunCompleted((prev) => ({ ...prev, [vars.mailboxId]: true }));
      queryClient.invalidateQueries({ queryKey: ["mailbox-warmup"] });
      forceUpdate((n) => n + 1);
      toast.success(`Warmup cycle complete — ${result.sent} emails sent, ${result.replied} replied`);
    },
    onError: (e: any) => toast.error(e.message || "Warmup failed"),
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

  const getComputedWeek = (mb: Mailbox) => {
    if (!mb.warmup_active || !mb.start_date) return mb.current_week || 1;
    const daysSinceStart = Math.floor((Date.now() - new Date(mb.start_date).getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(Math.floor(daysSinceStart / 7) + 1, 8);
  };

  const getDailyTarget = (mb: Mailbox) => {
    const s = getSettings(mb.id);
    const ramp = RAMP[s.rampStyle] || RAMP.conservative;
    const week = getComputedWeek(mb);
    return Math.min(ramp[Math.min(week - 1, ramp.length - 1)], s.maxPerDay);
  };

  const getHealthScore = (mb: Mailbox) => {
    let score = 50;
    if (mb.warmup_active) score += 15;
    const week = getComputedWeek(mb);
    if (week >= 2) score += 10;
    if (week >= 4) score += 10;
    if (week >= 6) score += 10;
    const history = getRunHistory(mb.id);
    if (history.length > 0) score += 5;
    return Math.min(score, 100);
  };

  const getTotals = (mb: Mailbox) => {
    const history = getRunHistory(mb.id);
    const totalSent = history.reduce((s, h) => s + h.sent, 0);
    const totalReplied = history.reduce((s, h) => s + h.replied, 0);
    const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;
    return { totalSent, totalReplied, replyRate };
  };

  const activeMailboxes = (mailboxes || []).filter((m) => m.warmup_active);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deliverability</h1>
          <p className="text-muted-foreground">Warm up your domains, monitor health, and verify DNS configuration</p>
        </div>

        {deliverabilityGated ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Lock className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Deliverability Dashboard</h3>
              <p className="text-muted-foreground text-center mb-4">
                Monitor mailbox health, run email warmup, check DNS configuration, and manage sending rules. Available on Growth and above.
              </p>
              <Button onClick={() => triggerGate('deliverabilityDashboard')}>Upgrade to Unlock</Button>
            </CardContent>
          </Card>
        ) : (
        <>

        {/* Section 1: Connected Mailboxes */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Connected Mailboxes</h2>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />Connect Mailbox
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>
          ) : (mailboxes || []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Mail className="w-12 h-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No mailboxes connected</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Connect your sending mailboxes to start warming up and monitoring deliverability.
                </p>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />Connect Mailbox
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(mailboxes || []).map((mb) => {
                const health = getHealthScore(mb);
                const dailyTarget = getDailyTarget(mb);
                const week = getComputedWeek(mb);
                const history = getRunHistory(mb.id);
                const today = new Date().toISOString().split("T")[0];
                const todayRun = history.find((h) => h.date === today);
                const sentToday = todayRun?.sent ?? 0;
                const todayProgress = dailyTarget > 0 ? (sentToday / dailyTarget) * 100 : 0;
                const { replyRate } = getTotals(mb);

                return (
                  <Card key={mb.id} className={mb.warmup_active ? "border-primary/30" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">{mb.email}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-0.5">
                            {getProvider(mb.email)}
                            {mb.warmup_active && (
                              <span className="flex items-center gap-1 text-green-500 text-xs font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                Warming up
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => {
                              const s = getSettings(mb.id);
                              setRampStyle(s.rampStyle as any);
                              setMaxPerDay(String(s.maxPerDay));
                              setSettingsOpen(mb.id);
                            }}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => deleteMailbox.mutate(mb.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Health</p>
                          <p className={`text-sm font-semibold ${health >= 80 ? "text-green-500" : health >= 60 ? "text-yellow-500" : "text-red-500"}`}>
                            {health}/100
                          </p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Week</p>
                          <p className="text-sm font-semibold">{week}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/50">
                          <p className="text-xs text-muted-foreground">Reply rate</p>
                          <p className="text-sm font-semibold">{replyRate}%</p>
                        </div>
                      </div>

                      {mb.warmup_active && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Flame className="w-3 h-3 text-orange-400" />
                              Today's warmup
                            </span>
                            <span>{sentToday} / {dailyTarget} sent</span>
                          </div>
                          <Progress value={todayProgress} className="h-1.5" />
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={mb.warmup_active || false}
                            onCheckedChange={(checked) => toggleWarmup.mutate({ id: mb.id, active: checked })}
                            className="scale-75"
                          />
                          <span className="text-xs text-muted-foreground">
                            {mb.warmup_active ? "Warmup on" : "Warmup off"}
                          </span>
                        </div>
                        {mb.warmup_active && (
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs gap-1"
                            disabled={runWarmup.isPending}
                            onClick={() => runWarmup.mutate({ mailboxId: mb.id })}
                          >
                            <Play className="w-3 h-3" />
                            Run now
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: Warmup Engine */}
        {activeMailboxes.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="text-xl font-semibold">Warmup Engine</h2>
            </div>

            {activeMailboxes.map((mb) => {
              const s = getSettings(mb.id);
              const ramp = RAMP[s.rampStyle] || RAMP.conservative;
              const currentWeek = getComputedWeek(mb);
              const history = getRunHistory(mb.id);
              const last7 = history.slice(0, 7).reverse();
              const { totalSent, totalReplied, replyRate } = getTotals(mb);

              return (
                <Card key={mb.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">{mb.email}</CardTitle>
                        <CardDescription>
                          {s.rampStyle === "aggressive" ? "Aggressive" : "Conservative"} ramp ·{" "}
                          Week {currentWeek} of {ramp.length} · max {s.maxPerDay}/day
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-green-500 border-green-500/30 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
                        Active
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Ramp timeline */}
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ramp Schedule</p>
                      <div className="flex gap-1">
                        {ramp.map((target, idx) => {
                          const week = idx + 1;
                          const isPast = week < currentWeek;
                          const isCurrent = week === currentWeek;
                          return (
                            <div
                              key={week}
                              className={`flex-1 rounded p-1.5 text-center transition-all ${
                                isCurrent
                                  ? "bg-primary/15 border border-primary/40"
                                  : isPast
                                  ? "bg-green-500/10 border border-green-500/20"
                                  : "bg-muted/40 border border-border/50"
                              }`}
                            >
                              <p className={`text-xs font-medium ${isCurrent ? "text-primary" : isPast ? "text-green-500" : "text-muted-foreground"}`}>
                                {isPast ? <CheckCircle className="w-3 h-3 mx-auto" /> : `W${week}`}
                              </p>
                              <p className={`text-xs mt-0.5 ${isCurrent ? "font-semibold" : "text-muted-foreground"}`}>
                                {target}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Start</span>
                        <span>Full volume ({ramp[ramp.length - 1]}/day)</span>
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> Total sent
                        </p>
                        <p className="text-lg font-semibold">{totalSent.toLocaleString()}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Replied
                        </p>
                        <p className="text-lg font-semibold">{totalReplied.toLocaleString()}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" /> Reply rate
                        </p>
                        <p className="text-lg font-semibold">{replyRate}%</p>
                      </div>
                    </div>

                    {/* Activity log */}
                    {last7.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          Last {last7.length} day{last7.length !== 1 ? "s" : ""}
                        </p>
                        <div className="space-y-1">
                          {last7.map((log) => (
                            <div key={log.date} className="flex items-center gap-3 text-xs">
                              <span className="text-muted-foreground w-20 shrink-0">{log.date}</span>
                              <div className="flex-1 bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary rounded-full h-1.5 transition-all"
                                  style={{ width: `${Math.min((log.sent / log.target) * 100, 100)}%` }}
                                />
                              </div>
                              <span className="text-muted-foreground w-16 text-right shrink-0">
                                {log.sent}/{log.target}
                              </span>
                              <span className="text-green-500 w-12 text-right shrink-0">
                                {log.replied} ↩
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span>No warmup runs yet. Click <strong>Run now</strong> on your mailbox card to start the first cycle.</span>
                      </div>
                    )}
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
                    { label: "SPF Record", detail: "Manual verification required" },
                    { label: "DKIM", detail: "Check your email provider admin console" },
                    { label: "DMARC", detail: "Recommended: set up a DMARC policy" },
                    { label: "Custom Domain Sending", detail: "Verify you're sending from a workspace domain" },
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

        </>
        )}
      </div>

      {/* Add Mailbox Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Mailbox</DialogTitle></DialogHeader>
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

      {/* Warmup Settings Dialog */}
      <Dialog open={!!settingsOpen} onOpenChange={(open) => !open && setSettingsOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-4 h-4" />Warmup Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label>Ramp Style</Label>
              <Select value={rampStyle} onValueChange={(v) => setRampStyle(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">
                    <div>
                      <p className="font-medium">Conservative</p>
                      <p className="text-xs text-muted-foreground">3 → 100/day over 8 weeks — safest for new domains</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="aggressive">
                    <div>
                      <p className="font-medium">Aggressive</p>
                      <p className="text-xs text-muted-foreground">10 → 100/day over 4 weeks — for domains with some history</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max emails per day</Label>
              <Input type="number" min={1} max={200} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} />
              <p className="text-xs text-muted-foreground">Caps warmup sends regardless of ramp schedule. Recommended: 100 for new domains.</p>
            </div>
            <Separator />
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <p className="text-xs font-medium">How warmup works</p>
              <p className="text-xs text-muted-foreground">
                SalesOS exchanges warmup emails with a pool of real inboxes. Emails are automatically opened and replied to, building your sender reputation with email providers. The week advances automatically every 7 days.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(null)}>Cancel</Button>
            <Button onClick={() => {
              if (settingsOpen) {
                saveSettings(settingsOpen, rampStyle, parseInt(maxPerDay) || 100);
                setSettingsOpen(null);
                forceUpdate((n) => n + 1);
                toast.success("Warmup settings saved");
              }
            }}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {gatedFeature && (
        <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature} currentPlan={currentPlan} />
      )}
    </DashboardLayout>
  );
};

export default Deliverability;
