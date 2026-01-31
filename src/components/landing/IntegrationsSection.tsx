import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Inline SVG components for brand logos
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const CalendlyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <rect width="24" height="24" rx="5" fill="#006BFF"/>
    <path d="M12 6C8.69 6 6 8.69 6 12s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10.5c-2.48 0-4.5-2.02-4.5-4.5S9.52 7.5 12 7.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z" fill="white"/>
    <path d="M12.75 9h-1.5v3.75l3.19 1.91.75-1.23-2.44-1.47V9z" fill="white"/>
  </svg>
);

const SlackLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
    <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
    <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
    <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
);

const ZapierLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <rect width="24" height="24" rx="5" fill="#FF4A00"/>
    <path d="M13.5 12l3-3h-2.25L12 11.25 9.75 9H7.5l3 3-3 3h2.25L12 12.75 14.25 15h2.25l-3-3z" fill="white"/>
    <path d="M12 7.5V9l2.25-2.25V4.5h-4.5v2.25L12 9V7.5zM12 16.5V15l-2.25 2.25v2.25h4.5v-2.25L12 15v1.5z" fill="white"/>
  </svg>
);

const HubSpotLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <path fill="#FF7A59" d="M17.002 10.625v-2.5a1.875 1.875 0 0 0 1.085-1.705V6.375a1.875 1.875 0 1 0-3.75 0v.045a1.875 1.875 0 0 0 1.084 1.705v2.5a4.502 4.502 0 0 0-2.04 1.027l-5.404-4.203a1.828 1.828 0 0 0 .117-.624A1.875 1.875 0 1 0 6.22 8.7l5.324 4.14a4.5 4.5 0 1 0 5.458-2.215zm-1.46 6.375a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5z"/>
  </svg>
);

const SalesforceLogo = () => (
  <svg viewBox="0 0 48 32" className="w-12 h-8">
    <path fill="#00A1E0" d="M20.012 8.83a8.39 8.39 0 0 1 6.09-2.612c3.12 0 5.908 1.712 7.36 4.286a10.08 10.08 0 0 1 4.288-.962c5.58 0 10.104 4.524 10.104 10.104 0 5.58-4.524 10.104-10.104 10.104-.62 0-1.228-.058-1.816-.168a7.88 7.88 0 0 1-6.948 4.168c-1.474 0-2.864-.406-4.048-1.112a9.342 9.342 0 0 1-8.128 4.742c-4.18 0-7.762-2.742-8.98-6.526a8.348 8.348 0 0 1-1.536.144C2.724 31 0 28.274 0 24.706c0-2.424 1.34-4.54 3.322-5.644a9.36 9.36 0 0 1-.688-3.5c0-5.186 4.204-9.392 9.392-9.392 3.21 0 6.046 1.612 7.74 4.064l.246-.404z"/>
  </svg>
);

// Integration data with logo components
const integrations = [
  { 
    name: "Google Workspace", 
    description: "Gmail, Calendar, Drive",
    Logo: GoogleLogo 
  },
  { 
    name: "Calendly", 
    description: "Meeting scheduling",
    Logo: CalendlyLogo 
  },
  { 
    name: "Slack", 
    description: "Deal notifications",
    Logo: SlackLogo 
  },
  { 
    name: "Zapier", 
    description: "5000+ apps",
    Logo: ZapierLogo 
  },
  { 
    name: "HubSpot", 
    description: "CRM sync",
    Logo: HubSpotLogo 
  },
  { 
    name: "Salesforce", 
    description: "Enterprise CRM",
    Logo: SalesforceLogo 
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
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
                  <div className="flex justify-center mb-3 transition-transform duration-200 group-hover:scale-110">
                    <integration.Logo />
                  </div>
                  <div className="font-medium text-sm mb-0.5">{integration.name}</div>
                  <div className="text-xs text-muted-foreground">{integration.description}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className={`flex flex-col sm:flex-row items-center justify-center gap-3 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
            <Button 
              variant="outline"
              size="sm"
              className="group"
              onClick={() => navigate('/auth')}
            >
              Connect your tools
              <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden="true" />
            </Button>
            <Button 
              variant="link"
              size="sm"
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