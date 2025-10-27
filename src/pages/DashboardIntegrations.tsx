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
    id: "google-calendar",
    name: "Google Calendar",
    category: "Scheduling",
    description: "Auto-schedule meetings based on your availability",
    icon: Calendar,
    color: "bg-yellow-500",
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
    id: "gmail",
    name: "Gmail",
    category: "Email",
    description: "Send campaigns directly through your Gmail account",
    icon: Mail,
    color: "bg-red-500",
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

  const handleOAuthCallback = async () => {
    const params = new URLSearchParams(window.location.search);
    const integrationId = params.get('integration');
    
    if (integrationId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Get the provider token from the session
        const providerToken = session.provider_token;
        const providerRefreshToken = session.provider_refresh_token;

        if (providerToken) {
          const integrationName = integrations.find(i => i.id === integrationId)?.name || integrationId;
          
          const { error } = await supabase
            .from('integrations')
            .upsert({
              user_id: session.user.id,
              integration_id: integrationId,
              integration_name: integrationName,
              config: { 
                provider_token: providerToken,
                provider_refresh_token: providerRefreshToken,
                connected_at: new Date().toISOString()
              },
              is_active: true,
            }, {
              onConflict: 'user_id,integration_id'
            });

          if (error) throw error;

          toast({
            title: "Connected!",
            description: `Successfully connected to ${integrationName}`,
          });

          // Remove the integration parameter from URL
          window.history.replaceState({}, '', '/dashboard/integrations');
          loadIntegrations();
        }
      } catch (error: any) {
        toast({
          title: "Connection Error",
          description: error.message,
          variant: "destructive",
        });
      }
    }
  };

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('integration_id, is_active');
      
      if (error) throw error;
      
      const activeIds = new Set(
        data?.filter(i => i.is_active).map(i => i.integration_id) || []
      );
      setConnectedIntegrations(activeIds);
    } catch (error: any) {
      console.error('Error loading integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredIntegrations =
    selectedCategory === "All"
      ? integrations
      : integrations.filter((i) => i.category === selectedCategory);

  const handleConnect = async (integration: Integration) => {
    if (integration.fields && integration.fields.length > 0) {
      setSelectedIntegration(integration);
      setFormData({});
      return;
    }

    // Real OAuth flow for supported providers
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      let provider: 'google' | 'azure' | 'linkedin_oidc' | null = null;
      let scopes: string | undefined;

      // Map integrations to OAuth providers
      if (integration.id === 'gmail' || integration.id === 'google-calendar') {
        provider = 'google';
        scopes = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar';
      }

      if (provider) {
        toast({
          title: "Redirecting...",
          description: `Opening ${integration.name} authorization page`,
        });

        const { data, error } = await supabase.auth.linkIdentity({
          provider,
          options: {
            scopes,
            redirectTo: `${window.location.origin}/dashboard/integrations?integration=${integration.id}`,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });

        if (error) {
          // Check if provider is not enabled
          if (error.message?.includes('provider') || error.message?.includes('not enabled')) {
            toast({
              title: "Provider Not Configured",
              description: `${integration.name} OAuth is not set up yet. Please configure the ${provider === 'google' ? 'Google' : provider === 'azure' ? 'Microsoft Azure' : 'LinkedIn'} provider in your backend settings first.`,
              variant: "destructive",
            });
          } else {
            throw error;
          }
        }
      } else {
        // For integrations without OAuth (like Slack, Zapier) - show config dialog
        toast({
          title: "Configuration Required",
          description: `Please configure ${integration.name} to complete setup`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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

      setConnectedIntegrations(new Set([...connectedIntegrations, selectedIntegration.id]));
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
