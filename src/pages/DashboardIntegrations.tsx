import { useState, useEffect } from "react";
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
  fields?: Array<{ name: string; label: string; type: string; placeholder: string }>;
}

const integrations: Integration[] = [
  {
    id: 'google',
    name: 'Google',
    category: 'Email & Calendar',
    description: 'Access Gmail and Google Calendar with one connection',
    icon: Mail,
    color: 'text-blue-500',
    // No fields - uses platform OAuth
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "Scheduling",
    description: "Embed booking links in outreach campaigns",
    icon: CalendarClock,
    color: "bg-blue-400",
    fields: [
      { name: "apiKey", label: "API Key", type: "password", placeholder: "Enter your Calendly API key" },
    ],
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
    fields: [
      { name: "apiKey", label: "API Key", type: "password", placeholder: "Enter your HubSpot API key" },
    ],
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

const DashboardIntegrations = () => {
  const { toast } = useToast();
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [connectedIntegrations, setConnectedIntegrations] = useState<Set<string>>(new Set());
  const [connectedGoogleAccounts, setConnectedGoogleAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [integrationStatus, setIntegrationStatus] = useState<Map<string, { lastSync: string | null; error: string | null }>>(new Map());
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  const categories = ["All", "Scheduling", "Email", "CRM", "Automation", "Communication"];

  useEffect(() => {
    loadIntegrations();
    handleOAuthCallback();
  }, []);

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('id, integration_id, is_active, config, updated_at, connected_email');
      
      if (error) throw error;
      
      const activeIds = new Set(
        data?.filter(i => i.is_active).map(i => i.integration_id) || []
      );
      setConnectedIntegrations(activeIds);

      // Build list of connected Google accounts
      const googleAccounts = (data || [])
        .filter(i => i.integration_id === 'google' && i.is_active)
        .map(i => ({
          id: i.id,
          email: i.connected_email || (i.config as any)?.googleEmail || 'Unknown account',
        }));
      setConnectedGoogleAccounts(googleAccounts);
      
      // Store full integration data for later use
      const integrationsMap = new Map(
        data?.map(i => [i.integration_id, i.config]) || []
      );
      (window as any).__integrationConfigs = integrationsMap;

      // Build status map with last sync and error info
      const statusMap = new Map<string, { lastSync: string | null; error: string | null }>();
      data?.forEach(integration => {
        const config = integration.config as any;
        statusMap.set(integration.integration_id, {
          lastSync: integration.updated_at,
          error: config?.lastError || null
        });
      });
      setIntegrationStatus(statusMap);
    } catch (error: any) {
      console.error('Error loading integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const stateParam = urlParams.get('state');
    
    if (!code) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to connect Google",
          variant: "destructive",
        });
        return;
      }

      const redirectUri = `${window.location.origin}/integrations`;

      // Call edge function to exchange code for tokens
      const { data, error } = await supabase.functions.invoke('google-oauth-callback', {
        body: { 
          code, 
          redirectUri,
          state: stateParam 
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({
        title: "Google Connected!",
        description: data.googleEmail 
          ? `Successfully connected ${data.googleEmail}` 
          : "Successfully connected Gmail and Google Calendar",
      });

      // Clean up URL and reload integrations
      window.history.replaceState({}, '', '/integrations');
      loadIntegrations();
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      toast({
        title: "OAuth Error",
        description: error.message || "Failed to connect Google",
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
    // Handle Google OAuth flow directly (no credentials needed)
    if (integration.id === 'google') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          toast({
            title: "Authentication Required",
            description: "Please sign in to connect Google",
            variant: "destructive",
          });
          return;
        }

        const redirectUri = `${window.location.origin}/integrations`;
        
        // Call edge function to get OAuth URL
        const { data, error } = await supabase.functions.invoke('google-oauth-init', {
          body: { redirectUri },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Redirect to Google OAuth
        window.location.href = data.authUrl;
        return;
      } catch (error: any) {
        console.error('Google OAuth init error:', error);
        toast({
          title: "Connection Error",
          description: error.message || "Failed to start Google connection",
          variant: "destructive",
        });
        return;
      }
    }

    // For other integrations with fields, show the dialog
    if (integration.fields && integration.fields.length > 0) {
      setSelectedIntegration(integration);
      
      // Load existing config if integration is already connected
      const existingConfig = (window as any).__integrationConfigs?.get(integration.id);
      setFormData(existingConfig || {});
      return;
    }

    // For integrations without fields, show a message
    toast({
      title: "Configuration Required",
      description: `Please configure ${integration.name} to complete setup`,
      variant: "destructive",
    });
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

      // Reload integrations first to get fresh data
      await loadIntegrations();
      
      // Then update UI state
      toast({
        title: "Connected!",
        description: `Successfully connected to ${selectedIntegration.name}`,
      });
      
      // Close dialog and reset form
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
        // Disconnect a specific Google account by row ID
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
            const isGoogle = integration.id === 'google';

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

                {/* Connected Google accounts list */}
                {isGoogle && connectedGoogleAccounts.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {connectedGoogleAccounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          <span className="text-sm truncate">{account.email}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() => handleDisconnect('google', account.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sync Status Indicator (for non-Google integrations) */}
                {!isGoogle && isConnected && status && (
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
                    {status.error && (
                      <p className="text-xs text-destructive mt-1">{status.error}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {isGoogle ? (
                    <Button
                      variant={connectedGoogleAccounts.length > 0 ? "outline" : "hero"}
                      size="sm"
                      className="w-full"
                      onClick={() => handleConnect(integration)}
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      {connectedGoogleAccounts.length > 0 ? "Add Another Account" : "Connect Google"}
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

        {/* Configuration Dialog */}
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
