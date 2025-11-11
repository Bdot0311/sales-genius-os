import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Rocket, TrendingUp, Calendar, CalendarClock, Mail, MessageSquare, Zap, Building2, Cloud } from "lucide-react";

const integrations = [
  {
    name: "Apollo.io",
    category: "Lead Generation",
    description: "Import leads directly from Apollo with enriched company data",
    icon: Rocket,
    color: "bg-blue-500"
  },
  {
    name: "Crunchbase",
    category: "Data Enrichment",
    description: "Get funding data, investor info, and company insights",
    icon: TrendingUp,
    color: "bg-green-500"
  },
  {
    name: "Google Calendar",
    category: "Scheduling",
    description: "Auto-schedule meetings based on your availability",
    icon: Calendar,
    color: "bg-yellow-500"
  },
  {
    name: "Calendly",
    category: "Scheduling",
    description: "Embed booking links in outreach campaigns",
    icon: CalendarClock,
    color: "bg-blue-400"
  },
  {
    name: "Gmail",
    category: "Email",
    description: "Send campaigns directly through your Gmail account",
    icon: Mail,
    color: "bg-red-500"
  },
  {
    name: "Slack",
    category: "Communication",
    description: "Get real-time notifications for deal updates",
    icon: MessageSquare,
    color: "bg-purple-500"
  },
  {
    name: "Zapier",
    category: "Automation",
    description: "Connect to 5000+ apps with custom workflows",
    icon: Zap,
    color: "bg-orange-500"
  },
  {
    name: "HubSpot",
    category: "CRM",
    description: "Two-way sync with HubSpot CRM",
    icon: Building2,
    color: "bg-orange-600"
  },
  {
    name: "Salesforce",
    category: "CRM",
    description: "Bi-directional data sync with Salesforce",
    icon: Cloud,
    color: "bg-blue-500"
  }
];

const categories = ["All", "Lead Generation", "Scheduling", "Email", "CRM", "Automation"];

export const Integrations = () => {
  const navigate = useNavigate();

  return (
    <section id="integrations" className="py-24 bg-gradient-hero relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Connect Your
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Entire Stack</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            SalesOS integrates with all your favorite tools to create a seamless sales workflow
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {integrations.map((integration, index) => {
            const Icon = integration.icon;
            return (
              <Card 
                key={index}
                className="p-6 bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow group"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 ${integration.color} rounded-lg flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{integration.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {integration.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Don't see your tool? We're adding new integrations every week.
          </p>
          <Button variant="hero" onClick={() => navigate('/request-integration')}>
            Request an Integration
          </Button>
        </div>
      </div>
    </section>
  );
};
