import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
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
import { SEOHead } from "@/components/seo/SEOHead";
import { toast } from "sonner";
import { CreditCard, TrendingUp, Check, RefreshCw, User, Save, Loader2, Palette, Activity, Bell, Key, GitBranch, Code2, Webhook, FileText, RotateCcw, Users, History, FileSearch, Globe, Coins, ExternalLink, Settings2, Copy, MapPin, Shield, AlertTriangle, Building2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CAN_SPAM_PENALTY, generateComplianceFooter } from "@/lib/compliance";
import { Switch } from "@/components/ui/switch";
import { PLAN_FEATURES } from "@/lib/plan-features";
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
import { CreditsUsageTab } from "@/components/settings/CreditsUsageTab";
import { ChangePasswordCard } from "@/components/settings/ChangePasswordCard";
import NotificationsTab from "@/components/settings/NotificationsTab";
import { AgencyPortalTab } from "@/components/settings/AgencyPortalTab";
import { useAdmin } from "@/hooks/use-admin";

const Settings = () => {
  const { subscription, loading: subLoading } = useSubscription();
  const { usage, loading: usageLoading } = useLeadsUsage();
  const { manualSync } = useSubscriptionSync();
  const { isAdmin } = useAdmin();
  const [syncing, setSyncing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState({
    full_name: "",
    email: "",
    company_name: "",
    physical_address: "",
    include_unsubscribe: true,
    include_compliance_footer: true,
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
        const profileData = data as Record<string, unknown>;
        setProfile({
          full_name: (profileData.full_name as string) || "",
          email: (profileData.email as string) || user.email || "",
          company_name: (profileData.company_name as string) || "",
          physical_address: (profileData.physical_address as string) || "",
          include_unsubscribe: profileData.include_unsubscribe !== false,
          include_compliance_footer: profileData.include_compliance_footer !== false,
        });
      } else {
        setProfile({
          full_name: "",
          email: user.email || "",
          company_name: "",
          physical_address: "",
          include_unsubscribe: true,
          include_compliance_footer: true,
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
          physical_address: profile.physical_address,
          include_unsubscribe: profile.include_unsubscribe,
          include_compliance_footer: profile.include_compliance_footer,
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

  // Password updates are handled in a dedicated component to ensure reliable re-auth.

  const [openingPortal, setOpeningPortal] = useState(false);

  const plans = [
    {
      name: 'Starter',
      value: 'starter',
      price: '$39',
      description: 'For solo founders and early outbound',
      features: [
        '1,000 prospects / month (resets each cycle)',
        '100 prospects per day',
        'Prospect search & verified emails',
        'AI email generator',
        'Standard support'
      ],
      paymentLink: 'https://buy.stripe.com/9B6dR9ep1a2b0gi1ca1B60u'
    },
    {
      name: 'Growth',
      value: 'growth',
      price: '$89',
      description: 'For teams booking meetings consistently',
      features: [
        '2,500 prospects / month (credits roll over)',
        '250 prospects per day',
        'Advanced prospect filters',
        'Bulk prospect export',
        'AI personalized outreach',
        'Priority support'
      ],
      highlighted: true,
      paymentLink: 'https://buy.stripe.com/9B55kD4Or8Y76EGaMK1B60p'
    },
    {
      name: 'Pro',
      value: 'pro',
      price: '$179',
      description: 'For high-volume outbound operations',
      features: [
        '5,000 prospects / month (credits roll over)',
        '500 prospects per day',
        'Advanced automation features',
        'CRM integrations',
        'Premium support'
      ],
      paymentLink: 'https://buy.stripe.com/8x2bJ15Svfmvd341ca1B60q'
    },
    {
      name: 'Agency',
      value: 'agency',
      price: '$249',
      description: 'For agencies running outbound for multiple clients',
      features: [
        '15,000 prospects / month (credits roll over)',
        '1,500 prospects per day',
        'White-label client portal',
        'Priority API access',
        'Dedicated account support'
      ],
      paymentLink: ''
    }
  ];

  const handleCheckout = async (paymentLink: string) => {
    if (!paymentLink) {
      toast.info("Contact us to upgrade to Agency — email sales@alephwave.io");
      return;
    }
    window.open(paymentLink, '_blank');
  };

  const handleManageSubscription = async () => {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      if (error.message?.includes('No Stripe customer')) {
        toast.error('No subscription found. Please subscribe to a plan first.');
      } else {
        toast.error('Failed to open customer portal. Please try again.');
      }
    } finally {
      setOpeningPortal(false);
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
      <SEOHead
        title="Account Settings"
        description="Manage your SalesOS profile, billing, integrations, and team preferences."
        noIndex
      />
      <PageHeader title="Settings" description="Account, preferences, and billing" />
      <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        <Tabs defaultValue="profile" className="space-y-6">
          <div className="bg-card border rounded-lg p-3 mb-6 space-y-2">
            <div className="flex justify-center">
              <TabsList className="h-auto inline-flex flex-wrap justify-center gap-2 bg-transparent p-0">
                <TabsTrigger value="profile" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <User className="h-4 w-4" />
                  Profile
                </TabsTrigger>
                <TabsTrigger value="billing" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <Settings2 className="h-4 w-4" />
                  Billing
                </TabsTrigger>
                <TabsTrigger value="subscription" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <CreditCard className="h-4 w-4" />
                  Plan
                </TabsTrigger>
                <TabsTrigger value="credits" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <Coins className="h-4 w-4" />
                  Credits
                </TabsTrigger>
                <TabsTrigger value="usage" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Usage
                </TabsTrigger>
                <TabsTrigger value="notifications" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                </TabsTrigger>
                <TabsTrigger value="white-label" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <Palette className="h-4 w-4" />
                  White Label
                </TabsTrigger>
                <TabsTrigger value="agency-portal" className="data-[state=active]:bg-muted hover:bg-muted/50 gap-2">
                  <Building2 className="h-4 w-4" />
                  Agency Portal
                </TabsTrigger>
              </TabsList>
            </div>
            {(isAdmin || subscription?.plan === 'pro' || subscription?.plan === 'agency') && (
              <div className="flex justify-center border-t pt-2">
                <TabsList className="h-auto inline-flex flex-wrap justify-center gap-2 bg-transparent p-0">
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
                <ChangePasswordCard email={profile.email} />
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name</Label>
                  <Input
                    id="company_name"
                    value={profile.company_name}
                    onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                    placeholder="Acme Inc."
                  />
                </div>

                {/* CAN-SPAM Compliance Section */}
                <div className="border-t pt-6 mt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">CAN-SPAM Compliance</h3>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        The CAN-SPAM Act requires a physical postal address and clear opt-out mechanism.
                        Non-compliance can result in penalties up to ${CAN_SPAM_PENALTY.toLocaleString()} per violation.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="physical_address" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Physical Address
                      </Label>
                      <Textarea
                        id="physical_address"
                        value={profile.physical_address}
                        onChange={(e) => setProfile({ ...profile, physical_address: e.target.value })}
                        placeholder={`123 Business Street\nSuite 100\nSan Francisco, CA 94105`}
                        className="min-h-[80px]"
                      />
                      <p className="text-xs text-muted-foreground">
                        Required by CAN-SPAM. This will appear in the footer of all sent emails.
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Include Unsubscribe Link</p>
                        <p className="text-sm text-muted-foreground">
                          Add one-click unsubscribe to every email
                        </p>
                      </div>
                      <Switch
                        checked={profile.include_unsubscribe}
                        onCheckedChange={(checked) =>
                          setProfile({ ...profile, include_unsubscribe: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">Compliance Footer</p>
                        <p className="text-sm text-muted-foreground">
                          Auto-add CAN-SPAM required footer to emails
                        </p>
                      </div>
                      <Switch
                        checked={profile.include_compliance_footer}
                        onCheckedChange={(checked) =>
                          setProfile({ ...profile, include_compliance_footer: checked })
                        }
                      />
                    </div>

                    {profile.physical_address && profile.include_compliance_footer && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {generateComplianceFooter({
                            includeUnsubscribe: profile.include_unsubscribe,
                            includePhysicalAddress: profile.include_compliance_footer,
                            userId: 'preview',
                            physicalAddress: profile.physical_address,
                          })}
                        </pre>
                      </div>
                    )}
                  </div>
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

          <TabsContent value="billing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription & Billing
                </CardTitle>
                <CardDescription>
                  Manage your subscription, payment methods, and billing history
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Plan Summary */}
                <div className="p-4 bg-muted/50 rounded-lg border">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Plan</p>
                      <p className="text-2xl font-bold capitalize">{subscription?.plan || 'None'}</p>
                    </div>
                    <Badge variant={subscription?.status === 'active' ? 'default' : 'secondary'}>
                      {subscription?.status || 'No subscription'}
                    </Badge>
                  </div>
                  
                  {subscription?.stripeSubscriptionId && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Search Credits</p>
                        <p className="font-medium">
                          {subscription.searchCreditsRemaining?.toLocaleString() || 0} / {subscription.searchCreditsBase?.toLocaleString() || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Renews</p>
                        <p className="font-medium">
                          {subscription.currentPeriodEnd 
                            ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                            : 'N/A'
                          }
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Portal Button */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Manage Your Subscription</h3>
                  <p className="text-sm text-muted-foreground">
                    Update payment methods, view invoices, change plans, or cancel your subscription through Stripe's secure customer portal.
                  </p>
                  <Button
                    onClick={handleManageSubscription}
                    disabled={openingPortal || !subscription?.stripeCustomerId}
                    className="gap-2"
                    variant="hero"
                  >
                    {openingPortal ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening Portal...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Open Customer Portal
                      </>
                    )}
                  </Button>
                  {!subscription?.stripeCustomerId && (
                    <p className="text-sm text-amber-600">
                      Subscribe to a plan to access billing management.
                    </p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="border-t pt-6 space-y-3">
                  <h3 className="text-lg font-semibold">Quick Actions</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={openingPortal || !subscription?.stripeCustomerId}
                      className="justify-start gap-2"
                    >
                      <CreditCard className="h-4 w-4" />
                      Update Payment Method
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={openingPortal || !subscription?.stripeCustomerId}
                      className="justify-start gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      View Invoices
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleRefreshSubscription}
                      disabled={syncing}
                      className="justify-start gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                      Refresh Status
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleManageSubscription}
                      disabled={openingPortal || !subscription?.stripeCustomerId}
                      className="justify-start gap-2 text-destructive hover:text-destructive"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Cancel Subscription
                    </Button>
                  </div>
                </div>
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
                        {subscription && subscription.plan !== plan.value ? 'Change Plan' : 'Start 14-Day Trial'}
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="credits" className="space-y-6">
            <CreditsUsageTab />
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

          <TabsContent value="notifications" className="space-y-6">
            <NotificationsTab />
          </TabsContent>


          <TabsContent value="agency-portal" className="space-y-6">
            <AgencyPortalTab />
          </TabsContent>

          <TabsContent value="white-label">
            <WhiteLabelTab />
          </TabsContent>

          {(isAdmin || subscription?.plan === 'pro' || subscription?.plan === 'agency') && (
            <>
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
