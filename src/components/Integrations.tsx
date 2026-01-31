import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Mail, Calendar, MessageSquare, Zap, Building2, Cloud, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const integrations = [
  {
    name: "Google Workspace",
    description: "Gmail, Calendar, and Drive integration",
    icon: Mail,
    color: "bg-blue-500/10 text-blue-500"
  },
  {
    name: "Calendly",
    description: "Automated meeting scheduling",
    icon: Calendar,
    color: "bg-cyan-500/10 text-cyan-500"
  },
  {
    name: "Slack",
    description: "Real-time deal notifications",
    icon: MessageSquare,
    color: "bg-purple-500/10 text-purple-500"
  },
  {
    name: "Zapier",
    description: "Connect 5000+ apps",
    icon: Zap,
    color: "bg-orange-500/10 text-orange-500"
  },
  {
    name: "HubSpot",
    description: "Two-way CRM sync",
    icon: Building2,
    color: "bg-amber-500/10 text-amber-500"
  },
  {
    name: "Salesforce",
    description: "Enterprise CRM integration",
    icon: Cloud,
    color: "bg-sky-500/10 text-sky-500"
  }
];

export const Integrations = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      id="integrations" 
      className="py-24 md:py-32 bg-muted/30 relative"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background text-sm text-muted-foreground mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Integrations
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Works with your stack
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect SalesOS to the tools you already use. No disruption to your workflow.
            </p>
          </div>

          {/* Integration grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {integrations.map((integration, index) => {
              const Icon = integration.icon;
              return (
                <div 
                  key={integration.name}
                  className={`group p-5 rounded-xl border border-border/50 bg-background hover:border-primary/30 transition-all duration-500 cursor-default ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${index * 80}ms` }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl ${integration.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{integration.name}</h3>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className={`text-center transition-all duration-700 delay-500 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <p className="text-muted-foreground mb-4">
              Don't see your tool? We're adding new integrations every week.
            </p>
            <Button 
              variant="outline"
              className="group"
              onClick={() => navigate('/request-integration')}
            >
              Request an integration
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
