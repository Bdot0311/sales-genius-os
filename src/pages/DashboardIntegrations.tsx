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
  Linkedin,
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
    id: "apollo",
    name: "Apollo.io",
    category: "Lead Generation",
    description: "Import leads directly from Apollo with enriched company data",
    icon: Rocket,
    color: "bg-blue-500",
    fields: [
      { name: "apiKey", label: "API Key", type: "password", placeholder: "Enter your Apollo API key" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn Sales Navigator",
    category: "Lead Generation",
    description: "Sync leads and automatically enrich with LinkedIn profile data",
    icon: Linkedin,
    color: "bg-blue-600",
    fields: [
      { name: "clientId", label: "Client ID", type: "text", placeholder: "Enter Client ID" },
      { name: "clientSecret", label: "Client Secret", type: "password", placeholder: "Enter Client Secret" },
    ],
  },
  {
    id: "crunchbase",
    name: "Crunchbase",
    category: "Data Enrichment",
    description: "Get funding data, investor info, and company insights",
    icon: TrendingUp,
    color: "bg-green-500",
    fields: [
      { name: "apiKey", label: "API Key", type: "password", placeholder: "Enter your Crunchbase API key" },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    category: 'Email & Calendar',
    description: 'Access Gmail and Google Calendar with one connection',
    icon: Mail,
    color: 'text-blue-500',
    fields: [
      { name: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Your Google Client ID' },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Your Google Client Secret' }
    ]
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
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [loading, setLoading] = useState(true);

  const categories = ["All", "Lead Generation", "Scheduling", "Email", "CRM", "Automation", "Communication", "Data Enrichment"];

  useEffect(() => {
    loadIntegrations();
    handleOAuthCallback();
  }, []);

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('integration_id, is_active, config');
      
      if (error) throw error;
      
      const activeIds = new Set(
        data?.filter(i => i.is_active).map(i => i.integration_id) || []
      );
      setConnectedIntegrations(activeIds);
      
      // Store full integration data for later use
      const integrationsMap = new Map(
        data?.map(i => [i.integration_id, i.config]) || []
      );
      (window as any).__integrationConfigs = integrationsMap;
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let integrationId = 'google';
      let clientId, clientSecret;

      // Parse state if available
      if (stateParam) {
        try {
          const state = JSON.parse(stateParam);
          integrationId = state.integrationId;
          clientId = state.clientId;
          clientSecret = state.clientSecret;
        } catch (e) {
          console.error('Failed to parse state:', e);
        }
      }

      // If no state, try to find existing Google integration
      if (!clientId || !clientSecret) {
        const { data: googleIntegration } = await supabase
          .from('integrations')
          .select('config, integration_id')
          .eq('user_id', user.id)
          .eq('integration_id', 'google')
          .maybeSingle();

        if (googleIntegration) {
          const config = googleIntegration.config as any;
          clientId = config.clientId;
          clientSecret = config.clientSecret;
        }
      }
      
      if (!clientId || !clientSecret) {
        throw new Error('OAuth credentials not found');
      }

      // Exchange code for tokens
      const redirectUri = `${window.location.origin}/integrations`;
      
      const tokenRequestBody = {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      };
      
      console.log('Token exchange request:', {
        redirectUri,
        clientId: clientId,
        hasClientSecret: !!clientSecret,
        codeLength: code.length,
      });
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(tokenRequestBody as any).toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Google OAuth token exchange failed:', {
          status: tokenResponse.status,
          error: errorData,
          requestDetails: {
            clientId: clientId,
            redirectUri,
            hasCode: !!code,
            hasClientSecret: !!clientSecret
          }
        });
        
        // Show detailed error to user
        const errorMessage = errorData.error_description || errorData.error || 'Failed to exchange code for tokens';
        toast({
          title: "OAuth Token Exchange Failed",
          description: `${errorMessage}. Check console for details.`,
          variant: "destructive",
        });
        throw new Error(errorMessage);
      }

      const tokens = await tokenResponse.json();
      
      const tokenData = {
        clientId: clientId,
        clientSecret: clientSecret,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      };

      // Update the Google integration
      await supabase
        .from('integrations')
        .upsert({
          user_id: user.id,
          integration_id: integrationId,
          integration_name: 'Google',
          config: tokenData,
          is_active: true,
        }, {
          onConflict: 'user_id,integration_id'
        });

      toast({
        title: "Google Connected!",
        description: "Successfully connected Gmail and Google Calendar",
      });

      // Clean up URL
      window.history.replaceState({}, '', '/integrations');
      loadIntegrations();
    } catch (error: any) {
      toast({
        title: "OAuth Error",
        description: error.message,
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

      // Handle OAuth flow for Google
      if (selectedIntegration.id === 'google') {
        const redirectUri = `${window.location.origin}/integrations`;
        const scope = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(formData.clientId)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `response_type=code&` +
          `scope=${encodeURIComponent(scope)}&` +
          `access_type=offline&` +
          `prompt=consent&` +
          `state=${encodeURIComponent(JSON.stringify({ 
            integrationId: selectedIntegration.id,
            clientId: formData.clientId,
            clientSecret: formData.clientSecret 
          }))}`;
        
        // Save client credentials first
        await supabase
          .from('integrations')
          .upsert({
            user_id: user.id,
            integration_id: selectedIntegration.id,
            integration_name: selectedIntegration.name,
            config: { clientId: formData.clientId, clientSecret: formData.clientSecret },
            is_active: false,
          }, {
            onConflict: 'user_id,integration_id'
          });

        window.location.href = authUrl;
        return;
      }

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

  const handleDisconnect = async (integrationId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('integrations')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('integration_id', integrationId);

      if (error) throw error;

      const newSet = new Set(connectedIntegrations);
      newSet.delete(integrationId);
      setConnectedIntegrations(newSet);
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

                <div className="flex gap-2">
                  {isConnected ? (
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
