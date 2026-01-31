import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Real integration logos with brand colors
const integrations = [
  { 
    name: "Google Workspace", 
    description: "Gmail, Calendar, Drive",
    color: "#4285F4",
    letter: "G"
  },
  { 
    name: "Calendly", 
    description: "Meeting scheduling",
    color: "#006BFF",
    letter: "C"
  },
  { 
    name: "Slack", 
    description: "Deal notifications",
    color: "#4A154B",
    letter: "S"
  },
  { 
    name: "Zapier", 
    description: "5000+ apps",
    color: "#FF4A00",
    letter: "Z"
  },
  { 
    name: "HubSpot", 
    description: "CRM sync",
    color: "#FF7A59",
    letter: "H"
  },
  { 
    name: "Salesforce", 
    description: "Enterprise CRM",
    color: "#00A1E0",
    letter: "S"
  },
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
      className="relative py-24 md:py-32"
      aria-labelledby="integrations-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="integrations-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Works with your stack
            </h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
              Connect to the tools you already use. No disruption to your workflow.
            </p>
          </div>

          {/* Integration grid with real logos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            {integrations.map((integration, index) => (
              <div 
                key={integration.name}
                className={`group relative p-4 rounded-xl border border-border/30 bg-card/40 text-center card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 50}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  <div 
                    className="w-10 h-10 mx-auto mb-3 rounded-xl flex items-center justify-center text-white font-bold text-lg transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: integration.color }}
                  >
                    {integration.letter}
                  </div>
                  <div className="font-medium text-sm mb-0.5">{integration.name}</div>
                  <div className="text-xs text-muted-foreground">{integration.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Request integration link */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
            <Button 
              variant="link"
              className="text-muted-foreground hover:text-primary group"
              onClick={() => navigate('/request-integration')}
            >
              Request an integration
              <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
