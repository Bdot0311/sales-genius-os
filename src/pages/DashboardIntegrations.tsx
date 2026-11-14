import { useState, useEffect } from "react";
import { edgeErrorMessage } from "@/lib/edge-error";
import type { Session } from "@supabase/supabase-js";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState, Panel, PanelHeader } from "@/components/dashboard/Panel";
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
  AlertCircle,
  CheckCircle2,
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
const PUBLISHED_OAUTH_ORIGIN = "https://outreign.lovable.app";
/*
 * Origins a returning OAuth popup may post its code back from. Calendly
 * registers one redirect URI and so always returns to the primary domain,
 * whichever host the flow started on; without it here, connecting Calendly
 * from a preview host silently dropped the message.
 */
const OAUTH_MESSAGE_ORIGINS = new Set([
  window.location.origin,
  PUBLISHED_OAUTH_ORIGIN,
  "https://outreign.io",
]);
const OAUTH_MESSAGE_TYPE = "outreign-oauth-message";

/*
 * Codes this window has already sent to the callback. Module scope, not
 * sessionStorage: the exchange and the marking have to happen in the same
 * window, and a popup's storage is not its opener's.
 */
const exchangedCodes = new Set<string>();

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
    /*
     * One exchange per code, guarded where the exchange happens.
     *
     * An OAuth authorization code is single-use: the second exchange comes
     * back invalid_grant, which reads to the user as the connection failing
     * rather than as having already succeeded.
     *
     * The guard used to live in handleOAuthCallback and key off
     * sessionStorage — which is per-window. In the popup flow the popup marks
     * the code used in ITS storage and then posts the code to the opener,
     * so the window doing the exchange never saw the mark. The guard could
     * not cover the call it existed to cover.
     */
    if (exchangedCodes.has(code)) return;
    exchangedCodes.add(code);

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
      if (!OAUTH_MESSAGE_ORIGINS.has(event.origin)) {
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

    // Google can send the user back with an error instead of a code
    // (e.g. access_denied when the app is in Testing mode and the Google
    // account is not a listed test user, or the user cancelled).
    const oauthError = urlParams.get('error');
    if (oauthError && !code) {
      const description = urlParams.get('error_description');
      toast({
        title: "Connection Error",
        description: description
          ? `Google refused the connection: ${description}`
          : oauthError === 'access_denied'
            ? "Google refused the connection. If you cancelled, nothing was connected; otherwise your Google account may not be allowed on this app yet."
            : `Google refused the connection (${oauthError}). Please try again.`,
        variant: "destructive",
      });
      window.history.replaceState({}, '', '/integrations');
      return;
    }

    if (!code) return;

    // Survives a reload of this window, which the in-memory set above does
    // not. The set is what covers the popup handoff.
    const codeKey = `oauth-code-used:${code}`;
    if (sessionStorage.getItem(codeKey)) {
      window.history.replaceState({}, '', '/integrations');
      return;
    }
    sessionStorage.setItem(codeKey, '1');

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
        /*
         * The function's own message, not the transport's. `invoke` reports
         * every non-2xx as "Edge Function returned a non-2xx status code" and
         * leaves the reason unread on `error.context`, so a missing server
         * secret and an expired session looked identical here.
         */
        const description = await edgeErrorMessage(
          error,
          `Failed to start ${integration.name} connection`,
        );
        toast({
          title: "Connection Error",
          description,
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

      const { data, error } = await supabase.functions.invoke('connect-integration', {
        body: { integrationId: selectedIntegration.id, config: formData },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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
        description: await edgeErrorMessage(error, "Could not save your connection."),
        variant: "destructive",
      });
    }
  };

  const handleDisconnect = async (integrationId: string, rowId?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      /*
       * Through an edge function rather than straight at the table.
       *
       * Writing from here needed a table grant `authenticated` does not have,
       * so Remove failed with `permission denied for table integrations`
       * while Connect worked — Connect runs on the service role, which
       * bypasses grants. Both halves of one feature now work the same way,
       * and the browser is not handed a write on a row holding OAuth refresh
       * tokens.
       */
      const { data, error } = await supabase.functions.invoke('disconnect-integration', {
        body: rowId ? { rowId } : { integrationId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await loadIntegrations();
      toast({
        title: "Disconnected",
        description: "Integration has been disconnected",
      });
    } catch (error: any) {
      // The function's own reason, not "non-2xx status code".
      toast({
        title: "Error",
        description: await edgeErrorMessage(error, "Could not disconnect that integration."),
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Integrations"
        description="Connect the tools your outbound already runs through."
      />
      <div className="space-y-4 pt-4">
        {/* Quiet text filters, not a row of filled buttons.
            A solid primary button for the category you are already looking at
            made the loudest mark on the page a statement of where you are. */}
        <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1">
          {categories.map((category) => {
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.75rem] transition-colors ${
                  active ? "bg-foreground/10 font-medium text-foreground ring-1 ring-inset ring-foreground/15" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        {/*
          Connected first, then the rest.

          Every integration was a card with a 48px coloured tile, a bold name, a
          category pill, a description and a full-width Connect button, three
          across — which is the most recognisable generated-interface shape
          there is, and it meant the two tools you had actually connected were
          scattered somewhere among the twelve you had not. Connection state was
          also said three times over on a connected card: a green disc pinned to
          the corner, a green tick beside each account, and the button changing
          its label.
        */}
        {[
          { key: "connected", label: "Connected", rows: filteredIntegrations.filter((i) => connectedIntegrations.has(i.id)) },
          { key: "available", label: "Available", rows: filteredIntegrations.filter((i) => !connectedIntegrations.has(i.id)) },
        ]
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <Panel key={group.key}>
              <PanelHeader title={group.label} meta={`${group.rows.length}`} />
              <div>
                {group.rows.map((integration) => {
                  const Icon = integration.icon;
                  const isConnected = connectedIntegrations.has(integration.id);
                  const status = integrationStatus.get(integration.id);
                  const isOAuth = integration.oauthProvider;
                  const accounts = connectedAccounts.get(integration.id) || [];

                  return (
                    <div
                      key={integration.id}
                      className="border-b border-border/30 px-4 py-3.5 last:border-b-0 sm:px-5"
                    >
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                        {/* The brand mark at the size a list item needs, and it
                            no longer grows when the cursor passes over it. */}
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${integration.color}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <h3 className="text-[0.8125rem] font-medium text-foreground">{integration.name}</h3>
                            <span className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground/60">
                              {integration.category}
                            </span>
                          </div>
                          <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-relaxed text-muted-foreground">
                            {integration.description}
                          </p>

                          {isOAuth && accounts.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {accounts.map((account) => (
                                <li key={account.id} className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[0.6875rem] text-foreground/85">{account.email}</span>
                                  <button
                                    onClick={() => handleDisconnect(integration.id, account.id)}
                                    className="shrink-0 text-[0.625rem] text-muted-foreground transition-colors hover:text-destructive"
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {!isOAuth && isConnected && status && (
                            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem]">
                              {status.error ? (
                                <span className="inline-flex items-center gap-1.5 text-destructive">
                                  <AlertCircle className="h-3 w-3" /> Sync failing
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" /> Settings saved
                                </span>
                              )}
                              {status.lastSync && (
                                <span className="text-muted-foreground">
                                  Updated {new Date(status.lastSync).toLocaleString()}
                                </span>
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 gap-1.5">
                          {isOAuth ? (
                            <Button variant="outline" size="sm" onClick={() => handleConnect(integration)}>
                              {accounts.length > 0
                                ? integration.id === "google"
                                  ? "Add account"
                                  : "Reconnect"
                                : `Sign in with ${integration.name}`}
                            </Button>
                          ) : isConnected ? (
                            <>
                              <Button variant="outline" size="sm" onClick={() => handleConnect(integration)}>
                                <Settings className="mr-1.5 h-3.5 w-3.5" />
                                Configure
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground"
                                onClick={() => handleDisconnect(integration.id)}
                              >
                                Disconnect
                              </Button>
                            </>
                          ) : (
                            /* Not the hero variant. Ten heroes on one page is
                               ten buttons of equal weight, which is none. */
                            <Button variant="outline" size="sm" onClick={() => handleConnect(integration)}>
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))}

        {filteredIntegrations.length === 0 && (
          <EmptyState
            title="Nothing in this category"
            body="Pick another category, or ask us for an integration you need."
          />
        )}


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
