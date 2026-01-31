import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plug } from "lucide-react";
import { useNavigate } from "react-router-dom";

const integrations = [
  { name: "Google Workspace", description: "Gmail, Calendar, Drive" },
  { name: "Calendly", description: "Meeting scheduling" },
  { name: "Slack", description: "Deal notifications" },
  { name: "Zapier", description: "5000+ apps" },
  { name: "HubSpot", description: "CRM sync" },
  { name: "Salesforce", description: "Enterprise CRM" },
];

export const IntegrationsSection = () => {
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
      className="py-24 bg-muted/30 border-y border-border/40"
      aria-labelledby="integrations-heading"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header - shorter and clearer */}
          <div className={`text-center mb-12 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 id="integrations-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Works with your stack
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Connect to the tools you already use. No disruption to your workflow.
            </p>
          </div>

          {/* Integration grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {integrations.map((integration, index) => (
              <div 
                key={integration.name}
                className={`p-4 rounded-xl border border-border/40 bg-card/50 text-center transition-all duration-500 hover:border-primary/30 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Plug className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <div className="font-medium text-sm mb-1">{integration.name}</div>
                <div className="text-xs text-muted-foreground">{integration.description}</div>
              </div>
            ))}
          </div>

          {/* Request integration link */}
          <div className={`text-center transition-all duration-700 delay-300 ${
            isVisible ? 'opacity-100' : 'opacity-0'
          }`}>
            <Button 
              variant="link"
              className="text-muted-foreground hover:text-primary"
              onClick={() => navigate('/request-integration')}
            >
              Request an integration
              <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
