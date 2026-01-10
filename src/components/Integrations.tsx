import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Mail, Calendar, MessageSquare, Zap, Building2, Cloud } from "lucide-react";

const integrations = [
  {
    name: "Google Workspace",
    description: "Gmail for sending. Calendar for scheduling. OAuth connection, no passwords.",
    icon: Mail,
  },
  {
    name: "Microsoft 365",
    description: "Outlook email and calendar. Same deal.",
    icon: Calendar,
  },
  {
    name: "HubSpot",
    description: "Two-way sync. Leads, deals, and activities flow between systems.",
    icon: Building2,
  },
  {
    name: "Salesforce",
    description: "Push leads and deals to Salesforce. Pull existing data in.",
    icon: Cloud,
  },
  {
    name: "Slack",
    description: "Get notified when leads reply or deals move stages.",
    icon: MessageSquare,
  },
  {
    name: "Zapier",
    description: "Connect to 5,000+ apps if we don't have a native integration.",
    icon: Zap,
  }
];

export const Integrations = () => {
  const navigate = useNavigate();

  return (
    <section id="integrations" className="py-16 sm:py-20 bg-background">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Integrations
          </h2>
          <p className="text-muted-foreground">
            SalesOS works with the tools you already use. 
            Connect once, data syncs automatically.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          {integrations.map((integration, index) => {
            const Icon = integration.icon;
            return (
              <Card 
                key={index}
                className="p-5 bg-card border-border"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm mb-1">{integration.name}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{integration.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Need something else? Let us know.
          </p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate('/request-integration')}
          >
            Request an integration
          </Button>
        </div>
      </div>
    </section>
  );
};
