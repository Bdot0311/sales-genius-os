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
  <svg fill="#006BFF" viewBox="0 0 24 24" className="w-10 h-10">
    <path d="M19.655 14.262c.281 0 .557.023.828.064 0 .005-.005.01-.005.014-.105.267-.234.534-.381.786l-1.219 2.106c-1.112 1.936-3.177 3.127-5.411 3.127h-2.432c-2.23 0-4.294-1.191-5.412-3.127l-1.218-2.106a6.251 6.251 0 0 1 0-6.252l1.218-2.106C6.736 4.832 8.8 3.641 11.035 3.641h2.432c2.23 0 4.294 1.191 5.411 3.127l1.219 2.106c.147.252.271.519.381.786 0 .004.005.009.005.014-.267.041-.543.064-.828.064-1.816 0-2.501-.607-3.291-1.306-.764-.676-1.711-1.517-3.44-1.517h-1.029c-1.251 0-2.387.455-3.2 1.278-.796.805-1.233 1.904-1.233 3.099v1.411c0 1.196.437 2.295 1.233 3.099.813.823 1.949 1.278 3.2 1.278h1.034c1.729 0 2.676-.841 3.439-1.517.791-.703 1.471-1.306 3.287-1.301Zm.005-3.237c.399 0 .794-.036 1.179-.11-.002-.004-.002-.01-.002-.014-.073-.414-.193-.823-.349-1.218.731-.12 1.407-.396 1.986-.819 0-.004-.005-.013-.005-.018-.331-1.085-.832-2.101-1.489-3.03-.649-.915-1.435-1.719-2.331-2.395-1.867-1.398-4.088-2.138-6.428-2.138-1.448 0-2.855.28-4.175.841-1.273.543-2.423 1.315-3.407 2.299S2.878 6.552 2.341 7.83c-.557 1.324-.842 2.726-.842 4.175 0 1.448.281 2.855.842 4.174.542 1.274 1.314 2.423 2.298 3.407s2.129 1.761 3.407 2.299c1.324.556 2.727.841 4.175.841 2.34 0 4.561-.74 6.428-2.137a10.815 10.815 0 0 0 2.331-2.396c.652-.929 1.158-1.949 1.489-3.03 0-.004.005-.014.005-.018-.579-.423-1.255-.699-1.986-.819.161-.395.276-.804.349-1.218.005-.009.005-.014.005-.023.869.166 1.692.506 2.404 1.035.685.505.552 1.075.446 1.416C22.184 20.437 17.619 24 12.221 24c-6.625 0-12-5.375-12-12s5.37-12 12-12c5.398 0 9.963 3.563 11.471 8.464.106.341.239.915-.446 1.421-.717.529-1.535.873-2.404 1.034.128.716.128 1.45 0 2.166-.387-.074-.782-.11-1.182-.11-4.184 0-3.968 2.823-6.736 2.823h-1.029c-1.899 0-3.15-1.357-3.15-3.095v-1.411c0-1.738 1.251-3.094 3.15-3.094h1.034c2.768 0 2.552 2.823 6.731 2.827Z"/>
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
  <svg viewBox="0 0 24 24" className="w-10 h-10">
    <path fill="#00A1E0" d="M10.006 4.415a4.195 4.195 0 0 1 3.045-1.306c1.56 0 2.954.856 3.68 2.143a5.04 5.04 0 0 1 2.144-.481c2.79 0 5.052 2.262 5.052 5.052 0 2.79-2.262 5.052-5.052 5.052-.31 0-.614-.029-.908-.084a3.94 3.94 0 0 1-3.474 2.084c-.737 0-1.432-.203-2.024-.556a4.671 4.671 0 0 1-4.064 2.371c-2.09 0-3.881-1.371-4.49-3.263a4.174 4.174 0 0 1-.768.072C1.362 15.5 0 14.137 0 12.353c0-1.212.67-2.27 1.661-2.822a4.68 4.68 0 0 1-.344-1.75c0-2.593 2.102-4.696 4.696-4.696 1.605 0 3.023.806 3.87 2.032l.123-.202z"/>
  </svg>
);

// Integration data — honest about status
const integrations = [
  { 
    name: "Google Workspace", 
    description: "Gmail & Calendar",
    Logo: GoogleLogo,
    status: "live" as const,
  },
  { 
    name: "Calendly", 
    description: "Meeting scheduling",
    Logo: CalendlyLogo,
    status: "coming" as const,
  },
  { 
    name: "Slack", 
    description: "Deal notifications",
    Logo: SlackLogo,
    status: "coming" as const,
  },
  { 
    name: "Zapier", 
    description: "5000+ apps",
    Logo: ZapierLogo,
    status: "coming" as const,
  },
  { 
    name: "HubSpot", 
    description: "CRM sync",
    Logo: HubSpotLogo,
    status: "coming" as const,
  },
  { 
    name: "Salesforce", 
    description: "Enterprise CRM",
    Logo: SalesforceLogo,
    status: "coming" as const,
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
              Connect to the tools you already use — with more integrations shipping regularly.
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
                  <div className={`flex justify-center mb-3 transition-transform duration-200 group-hover:scale-110 ${integration.status === 'coming' ? 'opacity-50 grayscale' : ''}`}>
                    <integration.Logo />
                  </div>
                  <div className="font-medium text-sm mb-0.5">{integration.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {integration.status === 'live' ? integration.description : (
                      <span className="text-primary/70">Coming soon</span>
                    )}
                  </div>
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