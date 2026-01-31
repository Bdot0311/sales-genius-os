import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Mail, Calendar, MessageSquare, Zap, Building2, Cloud, ArrowRight, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const integrations = [
  {
    name: "Google Workspace",
    description: "Gmail, Calendar, and Drive integration",
    icon: Mail,
  },
  {
    name: "Calendly",
    description: "Automated meeting scheduling",
    icon: Calendar,
  },
  {
    name: "Slack",
    description: "Real-time deal notifications",
    icon: MessageSquare,
  },
  {
    name: "Zapier",
    description: "Connect 5000+ apps",
    icon: Zap,
  },
  {
    name: "HubSpot",
    description: "Two-way CRM sync",
    icon: Building2,
  },
  {
    name: "Salesforce",
    description: "Enterprise CRM integration",
    icon: Cloud,
  }
];

export const Integrations = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
      className="py-24 md:py-32 bg-background relative overflow-hidden"
    >
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] animate-glow-pulse" />
      </div>
      
      {/* Floating connection lines - decorative */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent"
            style={{
              height: '200px',
              left: `${15 + i * 15}%`,
              top: `${20 + (i % 3) * 20}%`,
              animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }}
          />
        ))}
      </div>
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 transition-all duration-1000 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
              <Plug className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Seamless Integrations</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Works with your{" "}
              <span className="text-gradient-animated">favorite tools</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Connect SalesOS to the tools you already use. No disruption to your workflow.
            </p>
          </div>

          {/* Integration grid with enhanced effects */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {integrations.map((integration, index) => {
              const Icon = integration.icon;
              return (
                <div 
                  key={integration.name}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`group relative p-5 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-500 cursor-default ${
                    isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                  } ${hoveredIndex === index ? 'border-primary/50 shadow-lg shadow-primary/10 scale-[1.02]' : ''}`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <div className="relative z-10 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                      <Icon className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold group-hover:text-primary transition-colors">{integration.name}</h3>
                      <p className="text-sm text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                  
                  {/* Connection indicator */}
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute inset-0 rounded-full bg-primary animate-ping" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA */}
          <div className={`text-center transition-all duration-1000 delay-500 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <p className="text-muted-foreground mb-4">
              Don't see your tool? We're adding new integrations every week.
            </p>
            <Button 
              variant="outline"
              className="group magnetic-btn"
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
