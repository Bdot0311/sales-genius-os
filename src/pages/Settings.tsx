import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSubscription } from "@/hooks/use-subscription";
import { useLeadsUsage } from "@/hooks/use-leads-usage";
import { useSubscriptionSync } from "@/hooks/use-subscription-sync";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreditCard, TrendingUp, Check, RefreshCw, User, Save, Loader2, Palette, Activity, Bell, Key, GitBranch, Code2, Webhook, FileText, RotateCcw, Users, History, FileSearch, Globe } from "lucide-react";
import { APIKeysTab } from "@/components/settings/APIKeysTab";
import { TeamMembersTab } from "@/components/settings/TeamMembersTab";
import { WhiteLabelTab } from "@/components/settings/WhiteLabelTab";
import { WebhooksTab } from "@/components/settings/WebhooksTab";
import { TeamActivityTab } from "@/components/settings/TeamActivityTab";
import { CustomDomainTab } from "@/components/settings/CustomDomainTab";
import { AuditLogsTab } from "@/components/settings/AuditLogsTab";
import { MonitoringDashboard } from "@/components/settings/MonitoringDashboard";
import { AlertRulesTab } from "@/components/settings/AlertRulesTab";
import { WebhookDeliveryLogs } from "@/components/settings/WebhookDeliveryLogs";
import { APIVersionsTab } from "@/components/settings/APIVersionsTab";
import { WebhookReplayTab } from "@/components/settings/WebhookReplayTab";
import { GraphQLPlayground } from "@/components/settings/GraphQLPlayground";

const Settings = () => {
  const { subscription, loading: subLoading } = useSubscription();
  const { usage, loading: usageLoading } = useLeadsUsage();
  const { manualSync } = useSubscriptionSync();
  const [syncing, setSyncing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    company_name: ""
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Error loading profile:", error);
        return;
      }

      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || user.email || "",
          company_name: data.company_name || ""
        });
      } else {
        setProfile({
          full_name: "",
          email: user.email || "",
          company_name: ""
        });
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: profile.full_name,
          email: profile.email,
          company_name: profile.company_name,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Update onboarding progress
      await supabase
        .from("onboarding_progress")
        .update({ completed_profile: true })
        .eq("user_id", user.id);

      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const plans = [
    {
      name: 'Growth',
      value: 'growth',
      price: '$99',
      description: 'Perfect for solo founders and small teams',
      features: [
        'Lead Intelligence Engine',
        'AI Outreach Studio',
        'Smart Deal Pipeline',
        'Calendar Integration',
        'Up to 1,000 leads/month',
        'Email support'
      ],
      paymentLink: 'https://buy.stripe.com/cNibJ1bcPden1km8EC1B60o'
    },
    {
      name: 'Pro',
      value: 'pro',
      price: '$299',
      description: 'For scaling sales teams',
      features: [
        'Everything in Growth, plus:',
        'Automation Builder',
        'AI Sales Coach',
        'Advanced Analytics',
        'AI Recommendations',
        'Up to 10,000 leads/month',
        'Priority support'
      ],
      highlighted: true,
      paymentLink: 'https://buy.stripe.com/9B65kD4Or8Y76EGaMK1B60p'
    },
    {
      name: 'Elite',
      value: 'elite',
      price: '$799',
      description: 'For high-performance organizations',
      features: [
        'Everything in Pro, plus:',
        'Up to 10 team accounts',
        'White-label customization',
        'API access',
        'Unlimited automation workflows',
        'Unlimited leads',
        'Dedicated success manager'
      ],
      paymentLink: 'https://buy.stripe.com/8x2bJ15Svfmvd341ca1B60q'
    }
  ];

  const handleCheckout = async (paymentLink: string) => {
    window.open(paymentLink, '_blank');
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('Failed to open customer portal');
    }
  };

  const handleRefreshSubscription = async () => {
    setSyncing(true);
    await manualSync();
    setSyncing(false);
  };

  if (subLoading || usageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Manage your profile and subscription</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <div className="bg-card border rounded-lg p-3 mb-6">
            <div className="space-y-2">
              {/* First row of tabs */}
              <div className="flex justify-center">
                <TabsList className="h-auto inline-flex flex-wrap justify-center gap-2 bg-transparent p-0">
                <TabsTrigger value="profile" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="subscription" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <CreditCard className="h-4 w-4" />
                  Plan
                </TabsTrigger>
                <TabsTrigger value="usage" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Usage
                </TabsTrigger>
                {subscription?.plan === 'elite' && (
                  <>
                    <TabsTrigger value="white-label" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                      <Palette className="h-4 w-4" />
                      White Label
                    </TabsTrigger>
                    <TabsTrigger value="custom-domain" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                      <Globe className="h-4 w-4" />
                      Domain
                    </TabsTrigger>
                    <TabsTrigger value="monitoring" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                      <Activity className="h-4 w-4" />
                      Monitor
                    </TabsTrigger>
                    <TabsTrigger value="alerts" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                      <Bell className="h-4 w-4" />
                      Alerts
                    </TabsTrigger>
                    <TabsTrigger value="api-keys" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                      <Key className="h-4 w-4" />
                      API Keys
                    </TabsTrigger>
                  </>
                )}
                </TabsList>
              </div>

              {/* Second row of tabs (Elite only) */}
              {subscription?.plan === 'elite' && (
                <div className="flex justify-center">
                  <TabsList className="h-auto inline-flex flex-wrap justify-center gap-2 bg-transparent p-0">
                  <TabsTrigger value="api-versions" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <GitBranch className="h-4 w-4" />
                    Versions
                  </TabsTrigger>
                  <TabsTrigger value="graphql" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <Code2 className="h-4 w-4" />
                    GraphQL
                  </TabsTrigger>
                  <TabsTrigger value="webhooks" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <Webhook className="h-4 w-4" />
                    Webhooks
                  </TabsTrigger>
                  <TabsTrigger value="webhook-logs" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <FileText className="h-4 w-4" />
                    Logs
                  </TabsTrigger>
                  <TabsTrigger value="webhook-replay" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Replay
                  </TabsTrigger>
                  <TabsTrigger value="team" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <Users className="h-4 w-4" />
                    Team
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <History className="h-4 w-4" />
                    Activity
                  </TabsTrigger>
                  <TabsTrigger value="audit" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                    <FileSearch className="h-4 w-4" />
                    Audit
                  </TabsTrigger>
                  </TabsList>
                </div>
              )}
            </div>
          </div>

          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal and company details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Update your email address for account notifications
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_password">Change Password</Label>
                  <Input
                    id="new_password"
                    type="password"
                    placeholder="Enter new password (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave blank to keep current password
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    value={profile.company_name}
                    onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                    placeholder="Acme Inc."
                  />
                </div>
                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="gap-2"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Subscription Plans</h2>
                <p className="text-muted-foreground">Choose the plan that works best for you</p>
              </div>
              <Button
                variant="outline"
                onClick={handleRefreshSubscription}
                disabled={syncing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Refresh'}
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isCurrentPlan = subscription?.plan === plan.value;
                return (
                  <Card 
                    key={plan.value} 
                    className={`p-6 ${
                      plan.highlighted
                        ? 'bg-gradient-primary border-primary shadow-glow'
                        : isCurrentPlan 
                          ? 'border-primary' 
                          : 'border-border'
                    } transition-all duration-300`}
                  >
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={`text-2xl font-bold ${plan.highlighted ? 'text-white' : ''}`}>
                          {plan.name}
                        </h3>
                        {isCurrentPlan && (
                          <Badge variant={plan.highlighted ? "secondary" : "default"}>
                            Current Plan
                          </Badge>
                        )}
                      </div>
                      <div className={`text-4xl font-bold mb-2 ${plan.highlighted ? 'text-white' : ''}`}>
                        {plan.price}
                        <span className={`text-lg font-normal ${plan.highlighted ? 'text-white/70' : 'text-muted-foreground'}`}>/mo</span>
                      </div>
                      <p className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {plan.description}
                      </p>
                    </div>

                    <ul className="space-y-2 mb-6">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${plan.highlighted ? 'text-white' : 'text-primary'}`} />
                          <span className={plan.highlighted ? 'text-white/90' : ''}>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {isCurrentPlan ? (
                      <Button 
                        variant={plan.highlighted ? "secondary" : "outline"}
                        className="w-full"
                        onClick={handleManageSubscription}
                      >
                        Manage Subscription
                      </Button>
                    ) : (
                      <Button 
                        variant={plan.highlighted ? "secondary" : "hero"}
                        className="w-full"
                        onClick={() => handleCheckout(plan.paymentLink)}
                      >
                        {subscription && subscription.plan !== plan.value ? 'Change Plan' : 'Start Free Trial'}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="usage" className="space-y-6">
            {usage && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Leads Usage
                  </CardTitle>
                  <CardDescription>
                    Track your leads usage against your plan limit
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold">{usage.leadsCount.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">
                        of {usage.leadsLimit.toLocaleString()} leads used
                      </p>
                    </div>
                    <Badge variant={usage.percentageUsed > 90 ? 'destructive' : 'secondary'}>
                      {usage.percentageUsed.toFixed(1)}%
                    </Badge>
                  </div>
                  <Progress value={usage.percentageUsed} className="h-2" />
                  {usage.percentageUsed > 80 && (
                    <p className="text-sm text-amber-600">
                      You're approaching your leads limit. Consider upgrading your plan.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {subscription?.plan === 'elite' && (
            <>
              <TabsContent value="white-label">
                <WhiteLabelTab />
              </TabsContent>

              <TabsContent value="custom-domain">
                <CustomDomainTab />
              </TabsContent>

              <TabsContent value="monitoring">
                <MonitoringDashboard />
              </TabsContent>

              <TabsContent value="alerts">
                <AlertRulesTab />
              </TabsContent>

              <TabsContent value="api-keys">
                <APIKeysTab />
              </TabsContent>

              <TabsContent value="team">
                <TeamMembersTab />
              </TabsContent>

              <TabsContent value="webhooks">
                <WebhooksTab />
              </TabsContent>

              <TabsContent value="webhook-logs">
                <WebhookDeliveryLogs />
              </TabsContent>

              <TabsContent value="webhook-replay">
                <WebhookReplayTab />
              </TabsContent>

              <TabsContent value="api-versions">
                <APIVersionsTab />
              </TabsContent>

              <TabsContent value="graphql">
                <GraphQLPlayground />
              </TabsContent>

            <TabsContent value="activity">
              <TeamActivityTab />
            </TabsContent>

            <TabsContent value="audit">
              <AuditLogsTab />
            </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
