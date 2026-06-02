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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Mail, Plus, Trash2, Lock, ShieldAlert, ShieldCheck, ShieldX, TrendingUp, AlertTriangle, Ban, CheckCircle2, XCircle, Globe, Loader2, Copy, ExternalLink } from "lucide-react";
import { OUTBOUND_KB } from "@/lib/outbound-kb";
import { discoverDomainConnect, buildApplyUrl } from "@/lib/domain-connect";
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

interface ReputationMetrics {
  bounceRate: number;
  spamComplaintRate: number;
  totalSent: number;
  totalBounced: number;
  totalSpamComplaints: number;
  lastUpdated: string;
}

interface DnsRecord {
  found: boolean;
  value?: string;
  selector?: string;
}

interface DnsResults {
  domain: string;
  provider: string;
  providerSlug: string;
  nameservers: string[];
  spf: DnsRecord;
  dkim: DnsRecord;
  dmarc: DnsRecord;
}

const Deliverability = () => {
  const queryClient = useQueryClient();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan, triggerGate } = usePlanFeatures();
  const deliverabilityGated = !hasFeature('deliverabilityDashboard');
  const [domainInput, setDomainInput] = useState("");
  const [showDNSCheck, setShowDNSCheck] = useState(false);
  const [dnsChecking, setDnsChecking] = useState(false);
  const [dnsResults, setDnsResults] = useState<DnsResults | null>(null);
  const [setupMode, setSetupMode] = useState<'auto' | 'manual' | null>(null);
  const [autoSetupLoading, setAutoSetupLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // Fetch reputation metrics
  const { data: reputationMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["reputation-metrics"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get sent emails with bounce/complaint status
      const { data: sentEmails, error } = await supabase
        .from("sent_emails")
        .select("status, created_at")
        .eq("user_id", user.id)
        .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

      if (error) throw error;

      const totalSent = sentEmails?.length || 0;
      const totalBounced = sentEmails?.filter(e => e.status === 'bounced').length || 0;
      const totalSpamComplaints = sentEmails?.filter(e => e.status === 'spam_complaint').length || 0;

      return {
        bounceRate: totalSent > 0 ? (totalBounced / totalSent) * 100 : 0,
        spamComplaintRate: totalSent > 0 ? (totalSpamComplaints / totalSent) * 100 : 0,
        totalSent,
        totalBounced,
        totalSpamComplaints,
        lastUpdated: new Date().toISOString(),
      } as ReputationMetrics;
    },
    enabled: !deliverabilityGated,
    refetchInterval: 60000, // Refetch every minute
  });

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
        user_id: user.id, email, warmup_active: false, current_week: 1,
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

  const checkDns = async () => {
    const domain = domainInput.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain || !domain.includes('.')) return;

    setDnsChecking(true);
    setDnsResults(null);
    setSetupMode(null);

    const doh = async (name: string, type: string) => {
      try {
        const r = await fetch(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
          { headers: { Accept: 'application/dns-json' } }
        );
        return r.ok ? r.json() : null;
      } catch { return null; }
    };

    try {
      // NS records → detect DNS provider
      const nsData = await doh(domain, 'NS');
      const nameservers: string[] = (nsData?.Answer || [])
        .map((a: any) => a.data.replace(/\.$/, '').toLowerCase());

      let provider = 'Unknown', providerSlug = 'unknown';
      if (nameservers.some(ns => ns.includes('ns.cloudflare.com'))) {
        provider = 'Cloudflare'; providerSlug = 'cloudflare';
      } else if (nameservers.some(ns => ns.includes('domaincontrol.com'))) {
        provider = 'GoDaddy'; providerSlug = 'godaddy';
      } else if (nameservers.some(ns => ns.includes('registrar-servers.com') || ns.includes('web-hosting.com'))) {
        provider = 'Namecheap'; providerSlug = 'namecheap';
      } else if (nameservers.some(ns => ns.includes('awsdns'))) {
        provider = 'AWS Route53'; providerSlug = 'route53';
      } else if (nameservers.some(ns => ns.includes('googledomains.com') || ns.includes('google.com/dns'))) {
        provider = 'Google Domains'; providerSlug = 'google';
      } else if (nameservers.some(ns => ns.includes('squarespace.com'))) {
        provider = 'Squarespace'; providerSlug = 'squarespace';
      } else if (nameservers.some(ns => ns.includes('bluehost.com'))) {
        provider = 'Bluehost'; providerSlug = 'bluehost';
      } else if (nameservers.length > 0) {
        const parts = nameservers[0].split('.');
        provider = parts.slice(-2).join('.');
        providerSlug = 'other';
      }

      // SPF — TXT record at root containing v=spf1
      const txtData = await doh(domain, 'TXT');
      const txts: string[] = (txtData?.Answer || [])
        .map((a: any) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
      const spfValue = txts.find(r => r.startsWith('v=spf1'));

      // DMARC — TXT at _dmarc.domain
      const dmarcData = await doh(`_dmarc.${domain}`, 'TXT');
      const dmarcs: string[] = (dmarcData?.Answer || [])
        .map((a: any) => a.data.replace(/^"|"$/g, ''));
      const dmarcValue = dmarcs.find(r => r.startsWith('v=DMARC1'));

      // DKIM — try common selectors in parallel
      const dkimSelectors = ['google', 'selector1', 'selector2', 'mail', 'default', 'k1', 'dkim', 's1', 's2', 'em'];
      const dkimHits = await Promise.all(
        dkimSelectors.map(async (sel) => {
          const d = await doh(`${sel}._domainkey.${domain}`, 'TXT');
          const recs: string[] = (d?.Answer || []).map((a: any) => a.data);
          const hit = recs.find(r => r.includes('v=DKIM1') || r.includes('p='));
          return hit ? { selector: sel, value: hit } : null;
        })
      );
      const dkimHit = dkimHits.find(Boolean);

      setDnsResults({
        domain,
        provider,
        providerSlug,
        nameservers,
        spf: { found: !!spfValue, value: spfValue },
        dkim: dkimHit ? { found: true, value: dkimHit!.value, selector: dkimHit!.selector } : { found: false },
        dmarc: { found: !!dmarcValue, value: dmarcValue },
      });
      setShowDNSCheck(true);
    } catch {
      toast.error('DNS lookup failed. Check your domain and try again.');
    } finally {
      setDnsChecking(false);
    }
  };

  // "Do It For Me" — try the automated DomainConnect flow; fall back to the guided steps.
  const handleAutoSetup = async () => {
    if (!dnsResults) return;
    setAutoSetupLoading(true);
    try {
      const discovery = await discoverDomainConnect(dnsResults.domain);

      if (discovery.supported) {
        // Determine SPF include based on detected/likely ESP (default Google Workspace).
        const isOutlook = dnsResults.nameservers.some((ns) => ns.includes("outlook"));
        const variables: Record<string, string> = {
          spfinclude: isOutlook ? "spf.protection.outlook.com" : "_spf.google.com",
          dmarcpolicy: "quarantine",
          dmarcrua: `dmarc@${dnsResults.domain}`,
        };
        const applyUrl = buildApplyUrl(
          discovery.settings,
          dnsResults.domain,
          variables,
          window.location.href
        );
        // Send the user to their provider's confirm screen.
        window.open(applyUrl, "_blank", "noopener,noreferrer");
        toast.success(
          `Opening ${discovery.settings.providerName || dnsResults.provider} — confirm the records to finish.`
        );
        // Also reveal the manual values in case the popup is blocked.
        setSetupMode("auto");
      } else {
        // Provider doesn't support DomainConnect — show the guided flow.
        const reasonMsg =
          discovery.reason === "no_record" || discovery.reason === "no_sync"
            ? `${dnsResults.provider} doesn't support one-click setup. Here's the guided way.`
            : "Couldn't reach your provider for automatic setup. Here's the guided way.";
        toast.info(reasonMsg);
        setSetupMode("auto");
      }
    } catch {
      toast.error("Automatic setup failed. Use the guided steps below.");
      setSetupMode("auto");
    } finally {
      setAutoSetupLoading(false);
    }
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
              <Button onClick={() => triggerGate('deliverabilityDashboard')}>Upgrade to Unlock</Button>
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
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Check a domain
              </CardTitle>
              <CardDescription>We auto-detect your DNS provider and verify SPF, DKIM, and DMARC records</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="yourdomain.com"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && checkDns()}
                />
                <Button onClick={checkDns} disabled={!domainInput || dnsChecking}>
                  {dnsChecking
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking</>
                    : 'Check'}
                </Button>
              </div>

              {dnsChecking && (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning DNS records...
                </div>
              )}

              {dnsResults && (
                <div className="space-y-4">
                  {/* Provider banner */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 text-sm">
                    <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span>DNS provider: <strong>{dnsResults.provider}</strong></span>
                    {dnsResults.nameservers[0] && (
                      <span className="ml-auto text-xs text-muted-foreground truncate">{dnsResults.nameservers[0]}</span>
                    )}
                  </div>

                  {/* Record status rows */}
                  <div className="space-y-2">
                    {[
                      {
                        label: 'SPF Record',
                        record: dnsResults.spf,
                        description: dnsResults.spf.found
                          ? dnsResults.spf.value!
                          : 'Authorizes servers to send email from your domain',
                      },
                      {
                        label: 'DKIM',
                        record: dnsResults.dkim,
                        description: dnsResults.dkim.found
                          ? `Selector: ${dnsResults.dkim.selector} · ${dnsResults.dkim.value!.substring(0, 60)}…`
                          : 'Cryptographic signature that proves email authenticity',
                      },
                      {
                        label: 'DMARC',
                        record: dnsResults.dmarc,
                        description: dnsResults.dmarc.found
                          ? dnsResults.dmarc.value!
                          : 'Policy for handling emails that fail SPF/DKIM',
                      },
                    ].map((check) => (
                      <div
                        key={check.label}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          check.record.found
                            ? 'border-green-500/20 bg-green-500/5'
                            : 'border-red-500/20 bg-red-500/5'
                        }`}
                      >
                        {check.record.found
                          ? <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                          : <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{check.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{check.description}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            check.record.found
                              ? 'text-green-500 border-green-500/30 shrink-0'
                              : 'text-red-500 border-red-500/30 shrink-0'
                          }
                        >
                          {check.record.found ? 'Configured' : 'Missing'}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* All good */}
                  {dnsResults.spf.found && dnsResults.dkim.found && dnsResults.dmarc.found && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        All records are configured correctly. This domain is ready to send.
                      </p>
                    </div>
                  )}

                  {/* Action buttons when records are missing */}
                  {(!dnsResults.spf.found || !dnsResults.dkim.found || !dnsResults.dmarc.found) && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={setupMode === 'auto' ? 'default' : 'outline'}
                        onClick={handleAutoSetup}
                        disabled={autoSetupLoading}
                      >
                        {autoSetupLoading
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up</>
                          : 'Do It For Me'}
                      </Button>
                      <Button
                        size="sm"
                        variant={setupMode === 'manual' ? 'default' : 'outline'}
                        onClick={() => setSetupMode(setupMode === 'manual' ? null : 'manual')}
                      >
                        Set Up Manually
                      </Button>
                    </div>
                  )}

                  {/* Do It For Me — provider-specific guide */}
                  {setupMode === 'auto' && (
                    <ProviderSetupGuide results={dnsResults} />
                  )}

                  {/* Set Up Manually — raw record values */}
                  {setupMode === 'manual' && (
                    <ManualSetupGuide results={dnsResults} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Section 4: Reputation Metrics Dashboard */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Reputation Metrics</h2>
            <Badge variant="outline" className="text-xs">
              Last 30 days
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Total Sent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {metricsLoading ? "—" : reputationMetrics?.totalSent || 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Ban className="w-4 h-4" />
                  Bounce Rate
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl font-bold ${
                    (reputationMetrics?.bounceRate || 0) > 5 ? 'text-red-500' :
                    (reputationMetrics?.bounceRate || 0) > 2 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {metricsLoading ? "—" : `${(reputationMetrics?.bounceRate || 0).toFixed(2)}%`}
                  </p>
                </div>
                {(reputationMetrics?.bounceRate || 0) > 2 && (
                  <p className="text-xs text-yellow-600 mt-1">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Above 2% threshold
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  Spam Complaints
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className={`text-2xl font-bold ${
                    (reputationMetrics?.spamComplaintRate || 0) > 0.3 ? 'text-red-500' :
                    (reputationMetrics?.spamComplaintRate || 0) > 0.1 ? 'text-yellow-500' : 'text-green-500'
                  }`}>
                    {metricsLoading ? "—" : `${(reputationMetrics?.spamComplaintRate || 0).toFixed(3)}%`}
                  </p>
                </div>
                {(reputationMetrics?.spamComplaintRate || 0) > 0.1 && (
                  <p className="text-xs text-yellow-600 mt-1">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                    Above 0.1% threshold
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Health Score
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  if (metricsLoading) return <p className="text-2xl font-bold">—</p>;
                  const bounceScore = Math.max(0, 100 - (reputationMetrics?.bounceRate || 0) * 20);
                  const spamScore = Math.max(0, 100 - (reputationMetrics?.spamComplaintRate || 0) * 1000);
                  const overall = Math.round((bounceScore + spamScore) / 2);
                  return (
                    <div className="flex items-center gap-2">
                      <p className={`text-2xl font-bold ${
                        overall >= 80 ? 'text-green-500' : overall >= 60 ? 'text-yellow-500' : 'text-red-500'
                      }`}>
                        {overall}/100
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section 5: Deliverability Health Thresholds */}
        <DeliverabilityHealthThresholds mailboxCount={(mailboxes || []).length} metrics={reputationMetrics} />

        {/* Section 5: Sending Rules */}
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

      {gatedFeature && (
        <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature} currentPlan={currentPlan} />
      )}
    </DashboardLayout>
  );
};

function DeliverabilityHealthThresholds({ mailboxCount, metrics }: { mailboxCount: number; metrics?: ReputationMetrics }) {
  const d = OUTBOUND_KB.deliverability;

  type AlertLevel = "green" | "yellow" | "red";

  const getBounceLevel = (): AlertLevel => {
    if (!metrics) return "green";
    if (metrics.bounceRate > d.dangerBounceRatePercent) return "red";
    if (metrics.bounceRate > d.maxBounceRatePercent) return "yellow";
    return "green";
  };

  const getSpamLevel = (): AlertLevel => {
    if (!metrics) return "green";
    if (metrics.spamComplaintRate > d.dangerSpamComplaintRatePercent) return "red";
    if (metrics.spamComplaintRate > d.maxSpamComplaintRatePercent) return "yellow";
    return "green";
  };

  const thresholds: Array<{
    label: string;
    level: AlertLevel;
    message: string;
  }> = [
    {
      label: "Bounce Rate",
      level: getBounceLevel(),
      message: `Current: ${metrics?.bounceRate.toFixed(2) || 0}%. Keep below ${d.maxBounceRatePercent}%. Above ${d.dangerBounceRatePercent}% triggers ESP throttling.`,
    },
    {
      label: "Spam Complaint Rate",
      level: getSpamLevel(),
      message: `Current: ${metrics?.spamComplaintRate.toFixed(3) || 0}%. Keep below ${d.maxSpamComplaintRatePercent}%. Above ${d.dangerSpamComplaintRatePercent}% risks enforcement.`,
    },
    {
      label: "Daily Volume per Mailbox",
      level: mailboxCount === 0 ? "yellow" : "green",
      message: `Cap at ${d.maxEmailsPerMailboxPerDay} emails/mailbox/day. ${mailboxCount === 0 ? "Connect a mailbox to start tracking." : `You have ${mailboxCount} mailbox${mailboxCount !== 1 ? "es" : ""} connected.`}`,
    },
    {
      label: "Warmup Period",
      level: "green",
      message: `Minimum ${d.warmupMinWeeks} weeks — recommended ${d.warmupRecommendedWeeks} weeks before cold outreach. Never skip warmup on new domains.`,
    },
    {
      label: "Domain Isolation",
      level: "yellow",
      message: "Never send cold email from your primary business domain. Use secondary sending domains only (e.g. trysalesos.com).",
    },
  ];

  const authChecks = d.requiredAuth.map((auth) => ({
    label: `${auth} Record`,
    description:
      auth === "SPF"   ? "Authorizes sending servers for your domain" :
      auth === "DKIM"  ? "Cryptographic signature proving email integrity" :
                         "Policy for unauthenticated email handling",
  }));

  const levelIcon = (level: AlertLevel) => {
    if (level === "green")  return <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />;
    if (level === "yellow") return <ShieldAlert className="w-4 h-4 text-yellow-500 shrink-0" />;
    return <ShieldX className="w-4 h-4 text-red-500 shrink-0" />;
  };

  const levelBg = (level: AlertLevel) => {
    if (level === "green")  return "border-green-500/20 bg-green-500/5";
    if (level === "yellow") return "border-yellow-500/20 bg-yellow-500/5";
    return "border-red-500/20 bg-red-500/5";
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Health Thresholds</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {thresholds.map((t) => (
          <div key={t.label} className={`flex items-start gap-3 p-3 rounded-lg border ${levelBg(t.level)}`}>
            {levelIcon(t.level)}
            <div>
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.message}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#9263E9]" />
            Required Authentication
          </CardTitle>
          <CardDescription>All three records must be configured on every sending domain before you send a single email.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {authChecks.map((auth) => (
            <div key={auth.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium">{auth.label}</p>
                <p className="text-xs text-muted-foreground">{auth.description}</p>
              </div>
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">Verify in DNS</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy}>
      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </Button>
  );
}

function ManualSetupGuide({ results }: { results: DnsResults }) {
  const { domain, spf, dkim, dmarc } = results;
  const missingRecords = [
    !spf.found && {
      name: 'SPF',
      type: 'TXT',
      host: '@',
      value: 'v=spf1 include:_spf.google.com ~all',
      note: 'If you use Microsoft 365 instead of Google Workspace, use: v=spf1 include:spf.protection.outlook.com ~all',
    },
    !dkim.found && {
      name: 'DKIM',
      type: 'TXT',
      host: 'google._domainkey',
      value: '(generate from your email provider admin panel)',
      note: 'Google Workspace: Admin → Apps → Google Workspace → Gmail → Authenticate email → Generate key',
    },
    !dmarc.found && {
      name: 'DMARC',
      type: 'TXT',
      host: '_dmarc',
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}`,
      note: 'Start with p=none for monitoring, then move to p=quarantine or p=reject',
    },
  ].filter(Boolean) as Array<{ name: string; type: string; host: string; value: string; note: string }>;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h4 className="text-sm font-semibold">DNS Records to Add</h4>
      <p className="text-xs text-muted-foreground">Log in to your DNS provider and add the following records. Each record type is TXT.</p>
      <div className="space-y-4">
        {missingRecords.map((rec) => (
          <div key={rec.name} className="space-y-2">
            <p className="text-sm font-medium">{rec.name}</p>
            <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
              <span className="text-xs text-muted-foreground w-16">Host / Name</span>
              <code className="text-xs bg-muted px-2 py-1 rounded truncate">{rec.host}</code>
              <CopyButton value={rec.host} />
            </div>
            <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
              <span className="text-xs text-muted-foreground w-16">Value</span>
              <code className="text-xs bg-muted px-2 py-1 rounded truncate">{rec.value}</code>
              <CopyButton value={rec.value} />
            </div>
            <p className="text-xs text-muted-foreground italic">{rec.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const PROVIDER_CONFIG: Record<string, {
  manageUrl: string;
  label: string;
  steps: string[];
}> = {
  cloudflare: {
    manageUrl: 'https://dash.cloudflare.com',
    label: 'Open Cloudflare Dashboard',
    steps: [
      'Log in at dash.cloudflare.com',
      'Click your domain name',
      'Click the DNS tab, then Records',
      'Click Add record for each missing record below',
      'Set Type to TXT, paste the Host and Value, then Save',
    ],
  },
  godaddy: {
    manageUrl: 'https://dcc.godaddy.com/manage/dns',
    label: 'Open GoDaddy DNS',
    steps: [
      'Log in at dcc.godaddy.com',
      'Select your domain and click Manage DNS',
      'Scroll to DNS Records and click Add',
      'Set Type to TXT and fill in the Host and Value below',
      'Save each record',
    ],
  },
  namecheap: {
    manageUrl: 'https://ap.www.namecheap.com/domains/list/',
    label: 'Open Namecheap DNS',
    steps: [
      'Log in at namecheap.com → Domain List',
      'Click Manage next to your domain',
      'Click the Advanced DNS tab',
      'Click Add New Record, choose TXT Record',
      'Enter the Host and Value from below, then Save Changes',
    ],
  },
  route53: {
    manageUrl: 'https://console.aws.amazon.com/route53/',
    label: 'Open Route53',
    steps: [
      'Log in to AWS Console → Route 53',
      'Click Hosted Zones and select your domain',
      'Click Create Record for each missing record',
      'Set type to TXT and paste the values below',
    ],
  },
  google: {
    manageUrl: 'https://domains.google.com',
    label: 'Open Google Domains',
    steps: [
      'Log in at domains.google.com',
      'Click on your domain → DNS',
      'Scroll to Custom Records and click Manage Custom Records',
      'Add each TXT record below with the host and value shown',
    ],
  },
  squarespace: {
    manageUrl: 'https://account.squarespace.com/domains',
    label: 'Open Squarespace Domains',
    steps: [
      'Log in at squarespace.com → Domains',
      'Click your domain → DNS Settings',
      'Click Add Record and choose TXT',
      'Enter the host and value for each record below',
    ],
  },
};

function ProviderSetupGuide({ results }: { results: DnsResults }) {
  const config = PROVIDER_CONFIG[results.providerSlug];
  const steps = config?.steps || [
    'Log in to your DNS provider',
    'Find the DNS Management or Zone Editor section',
    'Add a new TXT record for each missing item below',
    'Enter the exact Host and Value shown — save each record',
    'DNS changes propagate within 5–60 minutes',
  ];

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Step-by-Step: {results.provider}</h4>
        {config && (
          <a href={config.manageUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
              <ExternalLink className="w-3.5 h-3.5" />
              {config.label}
            </Button>
          </a>
        )}
      </div>
      <ol className="space-y-2 list-decimal list-inside">
        {steps.map((step, i) => (
          <li key={i} className="text-sm text-muted-foreground">{step}</li>
        ))}
      </ol>
      <ManualSetupGuide results={results} />
    </div>
  );
}

export default Deliverability;
