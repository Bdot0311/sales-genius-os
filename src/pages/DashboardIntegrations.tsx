import { useState, useEffect } from "react";
import type { Session } from "@supabase/supabase-js";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Rocket,
  TrendingUp,
  Calendar,
  CalendarClock,
  Mail,
  Send,
  MessageSquare,
  Zap,
  Building2,
  Cloud,
  Settings,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: any;
  color: string;
  oauthProvider?: boolean; // true = uses OAuth sign-in flow
  fields?: Array<{ name: string; label: string; type: string; placeholder: string }>;
}

const OAUTH_PROVIDERS = new Set(["google", "hubspot", "calendly"]);
const PUBLISHED_OAUTH_ORIGIN = "https://sales-genius-os.lovable.app";
const OAUTH_MESSAGE_TYPE = "salesos-oauth-message";

const isEmbeddedPreview = () => {
  try {
    return (
      window.self !== window.top ||
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com")
    );
  } catch {
    return true;
  }
};

const getOAuthRedirectUri = () => {
  const hostname = window.location.hostname;
  const usePublishedOrigin =
    hostname.includes("id-preview--") || hostname.includes("lovableproject.com");

  const baseOrigin = usePublishedOrigin
    ? PUBLISHED_OAUTH_ORIGIN
    : window.location.origin;

  return `${baseOrigin}/integrations`;
};

const getOAuthMessageTargetOrigin = () => {
  if (!document.referrer) return "*";

  try {
    return new URL(document.referrer).origin;
  } catch {
    return "*";
  }
};

const getProviderFromState = (stateParam: string | null) => {
  if (!stateParam) return "google";

  try {
    const stateData = JSON.parse(stateParam);
    return stateData.provider || "google";
  } catch {
    return "google";
  }
};

const openOAuthTarget = (authUrl: string, popup: Window | null) => {
  if (popup && !popup.closed) {
    popup.location.replace(authUrl);
    popup.focus?.();
    return;
  }

  try {
    if (isEmbeddedPreview() && window.top) {
      window.top.location.href = authUrl;
      return;
    }
  } catch (navigationError) {
    console.warn("Could not redirect parent window for OAuth:", navigationError);
  }

  window.location.href = authUrl;
};

const integrations: Integration[] = [
  {
    id: 'google',
    name: 'Google',
    category: 'Email & Calendar',
    description: 'Access Gmail and Google Calendar with one connection',
    icon: Mail,
    color: 'text-blue-500',
    oauthProvider: true,
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "Scheduling",
    description: "Embed booking links in outreach campaigns",
    icon: CalendarClock,
    color: "bg-blue-400",
    oauthProvider: true,
  },
  {
    id: "slack",
    name: "Slack",
    category: "Communication",
    description: "Get real-time notifications for deal updates",
    icon: MessageSquare,
    color: "bg-purple-500",
    fields: [
      { name: "webhookUrl", label: "Webhook URL", type: "text", placeholder: "https://hooks.slack.com/..." },
    ],
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "Automation",
    description: "Connect to 5000+ apps with custom workflows",
    icon: Zap,
    color: "bg-orange-500",
    fields: [
      { name: "webhookUrl", label: "Webhook URL", type: "text", placeholder: "https://hooks.zapier.com/..." },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description: "Two-way sync with HubSpot CRM",
    icon: Building2,
    color: "bg-orange-600",
    oauthProvider: true,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    description: "Bi-directional data sync with Salesforce",
    icon: Cloud,
    color: "bg-blue-500",
    fields: [
      { name: "instanceUrl", label: "Instance URL", type: "text", placeholder: "https://your-instance.salesforce.com" },
      { name: "clientId", label: "Client ID", type: "text", placeholder: "Enter Client ID" },
      { name: "clientSecret", label: "Client Secret", type: "password", placeholder: "Enter Client Secret" },
    ],
  },
];

const getProviderLabel = (provider: string) =>
  integrations.find((integration) => integration.id === provider)?.name ??
  `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;

const DashboardIntegrations = () => {
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [connectedIntegrations, setConnectedIntegrations] = useState<Set<string>>(new Set());
  const [connectedAccounts, setConnectedAccounts] = useState<Map<string, Array<{ id: string; email: string }>>>(new Map());
  const [integrationStatus, setIntegrationStatus] = useState<Map<string, { lastSync: string | null; error: string | null }>>(new Map());
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);
  const [authSession, setAuthSession] = useState<Session | null>(null);

  const categories = ["All", "Scheduling", "Email", "CRM", "Automation", "Communication"];

  const ensureActiveSession = async () => {
    if (authSession?.access_token) {
      return authSession;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.warn("Unable to read session for OAuth:", sessionError);
    }

    if (sessionData.session?.access_token) {
      setAuthSession(sessionData.session);
      return sessionData.session;
    }

    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.warn("Unable to refresh session for OAuth:", refreshError);
      return null;
    }

    if (refreshedData.session?.access_token) {
      setAuthSession(refreshedData.session);
      return refreshedData.session;
    }

    return null;
  };

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('id, integration_id, is_active, updated_at, connected_email');
      
      if (error) throw error;
      
      const activeIds = new Set(
        data?.filter(i => i.is_active).map(i => i.integration_id) || []
      );
      setConnectedIntegrations(activeIds);

      const accountsMap = new Map<string, Array<{ id: string; email: string }>>();
      (data || [])
        .filter(i => i.is_active && OAUTH_PROVIDERS.has(i.integration_id))
        .forEach(i => {
          const list = accountsMap.get(i.integration_id) || [];
          list.push({ id: i.id, email: i.connected_email || 'Connected account' });
          accountsMap.set(i.integration_id, list);
        });
      setConnectedAccounts(accountsMap);

      const statusMap = new Map<string, { lastSync: string | null; error: string | null }>();
      data?.forEach(integration => {
        statusMap.set(integration.integration_id, {
          lastSync: integration.updated_at,
          error: null
        });
      });
      setIntegrationStatus(statusMap);
    } catch (error: any) {
      console.error('Error loading integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeOAuthConnection = async (
    provider: string,
    code: string,
    stateParam: string | null,
  ) => {
    const activeSession = await ensureActiveSession();
    if (!activeSession) {
      throw new Error("Please sign in to finish connecting this integration");
    }

    const redirectUri = getOAuthRedirectUri();
    const callbackFn = `${provider}-oauth-callback`;
    const { data, error } = await supabase.functions.invoke(callbackFn, {
      body: { code, redirectUri, state: stateParam },
      headers: {
        Authorization: `Bearer ${activeSession.access_token}`,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const connectedName = data.googleEmail || data.connectedEmail || getProviderLabel(provider);

    toast({
      title: `${getProviderLabel(provider)} Connected!`,
      description: `Successfully connected ${connectedName}`,
    });

    supabase.from("onboarding_progress")
      .update({ set_up_integration: true })
      .eq("user_id", activeSession.user.id)
      .then(() => {});

    await loadIntegrations();
  };

  useEffect(() => {
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
    });

    void loadIntegrations();
    void handleOAuthCallback();

    const handleOAuthMessage = (event: MessageEvent) => {
      if (!new Set([window.location.origin, PUBLISHED_OAUTH_ORIGIN]).has(event.origin)) {
        return;
      }

      if (event.data?.type !== OAUTH_MESSAGE_TYPE) {
        return;
      }

      const payload = event.data.payload as {
        code?: string;
        provider?: string;
        stateParam?: string | null;
      } | undefined;

      if (!payload?.code || !payload?.provider) {
        return;
      }

      void completeOAuthConnection(payload.provider, payload.code, payload.stateParam ?? null).catch((error: any) => {
        console.error("OAuth popup handoff error:", error);
        toast({
          title: "Connection Error",
          description: error.message || `Failed to connect ${payload.provider}`,
          variant: "destructive",
        });
      });
    };

    window.addEventListener("message", handleOAuthMessage);
    return () => {
      window.removeEventListener("message", handleOAuthMessage);
      authSubscription.unsubscribe();
    };
  }, []);

  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const stateParam = urlParams.get('state');
    
    if (!code) return;

    const provider = getProviderFromState(stateParam);
    const openedFromPopup = Boolean(window.opener && window.opener !== window);

    if (openedFromPopup) {
      try {
        window.opener?.postMessage(
          {
            type: OAUTH_MESSAGE_TYPE,
            payload: { provider, code, stateParam },
          },
          getOAuthMessageTargetOrigin(),
        );
      } catch (error) {
        console.error('OAuth popup postMessage error:', error);
      }

      window.history.replaceState({}, '', '/integrations');
      window.close();
      return;
    }

    try {
      await completeOAuthConnection(provider, code, stateParam);
      window.history.replaceState({}, '', '/integrations');
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast({
        title: "Connection Error",
        description: error.message || `Failed to connect ${provider}`,
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/integrations');
    }
  };

  const filteredIntegrations = selectedCategory === 'All'
    ? integrations
    : integrations.filter(int => {
        if (selectedCategory === 'Email') {
          return int.category === 'Email' || int.category === 'Email & Calendar';
        }
        if (selectedCategory === 'Calendar' || selectedCategory === 'Scheduling') {
          return int.category === 'Calendar' || int.category === 'Scheduling' || int.category === 'Email & Calendar';
        }
        return int.category === selectedCategory;
      });

  const handleConnect = async (integration: Integration) => {
    if (integration.oauthProvider) {
      const oauthPopup = isEmbeddedPreview()
        ? window.open("", "_blank", "popup=yes,width=640,height=800")
        : null;

      try {
        const activeSession = await ensureActiveSession();
        if (!activeSession) {
          if (oauthPopup && !oauthPopup.closed) oauthPopup.close();
          toast({
            title: "Authentication Required",
            description: `Please sign in to connect ${integration.name}`,
            variant: "destructive",
          });
          return;
        }

        const redirectUri = getOAuthRedirectUri();
        const initFn = `${integration.id}-oauth-init`;
        const { data, error } = await supabase.functions.invoke(initFn, {
          body: { redirectUri },
          headers: {
            Authorization: `Bearer ${activeSession.access_token}`,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.authUrl) throw new Error('No authorization URL returned');

        openOAuthTarget(data.authUrl, oauthPopup);
        return;
      } catch (error: any) {
        if (oauthPopup && !oauthPopup.closed) oauthPopup.close();
        console.error(`${integration.name} OAuth init error:`, error);
        toast({
          title: "Connection Error",
          description: error.message || `Failed to start ${integration.name} connection`,
          variant: "destructive",
        });
        return;
      }
    }

    if (integration.fields && integration.fields.length > 0) {
      setSelectedIntegration(integration);
      setFormData({});
      return;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIntegration) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('integrations')
        .upsert({
          user_id: user.id,
          integration_id: selectedIntegration.id,
          integration_name: selectedIntegration.name,
          config: formData,
          is_active: true,
        }, {
          onConflict: 'user_id,integration_id'
        });

      if (error) throw error;

      supabase.from("onboarding_progress")
        .update({ set_up_integration: true })
        .eq("user_id", user.id)
        .then(() => {});

      await loadIntegrations();
      
      toast({
        title: "Connected!",
        description: `Successfully connected to ${selectedIntegration.name}`,
      });
      
      setSelectedIntegration(null);
      setFormData({});
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async (integrationId: string, rowId?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (rowId) {
        const { error } = await supabase
          .from('integrations')
          .update({ is_active: false })
          .eq('id', rowId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integrations')
          .update({ is_active: false })
          .eq('user_id', user.id)
          .eq('integration_id', integrationId);
        if (error) throw error;
      }

      await loadIntegrations();
      toast({
        title: "Disconnected",
        description: "Integration has been disconnected",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Integrations</h1>
          <p className="text-muted-foreground">
            Connect your favorite tools to supercharge your sales workflow
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Integrations Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredIntegrations.map((integration) => {
            const Icon = integration.icon;
            const isConnected = connectedIntegrations.has(integration.id);
            const status = integrationStatus.get(integration.id);
            const isOAuth = integration.oauthProvider;
            const accounts = connectedAccounts.get(integration.id) || [];

            return (
              <Card
                key={integration.id}
                className="p-6 hover:border-primary/50 transition-all duration-300 hover:shadow-glow group relative"
              >
                {isConnected && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4 mb-4">
                  <div
                    className={`w-12 h-12 ${integration.color} rounded-lg flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{integration.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {integration.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {integration.description}
                    </p>
                  </div>
                </div>

                {/* Connected accounts list for OAuth providers */}
                {isOAuth && accounts.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {accounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="text-sm truncate">{account.email}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => handleDisconnect(integration.id, account.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sync Status for non-OAuth connected integrations */}
                {!isOAuth && isConnected && status && (
                  <div className="mb-4 p-3 rounded-lg bg-muted/50 space-y-2">
                    {status.error ? (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-xs font-medium">Sync Error</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">Active</span>
                      </div>
                    )}
                    {status.lastSync && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span className="text-xs">
                          Last sync: {new Date(status.lastSync).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {isOAuth ? (
                    <Button
                      variant={accounts.length > 0 ? "outline" : "hero"}
                      size="sm"
                      className="w-full"
                      onClick={() => handleConnect(integration)}
                    >
                      <Icon className="w-4 h-4 mr-2" />
                      {accounts.length > 0
                        ? (integration.id === 'google' ? "Add Another Account" : "Reconnect")
                        : `Sign in with ${integration.name}`}
                    </Button>
                  ) : isConnected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleConnect(integration)}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(integration.id)}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="hero"
                      size="sm"
                      className="w-full"
                      onClick={() => handleConnect(integration)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Configuration Dialog (only for webhook-based integrations like Zapier) */}
        <Dialog
          open={!!selectedIntegration}
          onOpenChange={() => setSelectedIntegration(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Connect to {selectedIntegration?.name}
              </DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {selectedIntegration?.fields?.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <Input
                    id={field.name}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, [field.name]: e.target.value })
                    }
                    required
                  />
                </div>
              ))}

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSelectedIntegration(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="hero" className="flex-1">
                  Connect
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default DashboardIntegrations;
