import { useEffect, useRef, useState } from "react";

// Inline SVG components for brand logos
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const CalendlyLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8">
    <rect width="24" height="24" rx="5" fill="#006BFF"/>
    <path d="M12 6C8.69 6 6 8.69 6 12s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10.5c-2.48 0-4.5-2.02-4.5-4.5S9.52 7.5 12 7.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5z" fill="white"/>
    <path d="M12.75 9h-1.5v3.75l3.19 1.91.75-1.23-2.44-1.47V9z" fill="white"/>
  </svg>
);

const SlackLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8">
    <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"/>
    <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
    <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"/>
    <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
);

const ZapierLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8">
    <rect width="24" height="24" rx="5" fill="#FF4A00"/>
    <path d="M13.5 12l3-3h-2.25L12 11.25 9.75 9H7.5l3 3-3 3h2.25L12 12.75 14.25 15h2.25l-3-3z" fill="white"/>
    <path d="M12 7.5V9l2.25-2.25V4.5h-4.5v2.25L12 9V7.5zM12 16.5V15l-2.25 2.25v2.25h4.5v-2.25L12 15v1.5z" fill="white"/>
  </svg>
);

const HubSpotLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8">
    <path fill="#FF7A59" d="M17.002 10.625v-2.5a1.875 1.875 0 0 0 1.085-1.705V6.375a1.875 1.875 0 1 0-3.75 0v.045a1.875 1.875 0 0 0 1.084 1.705v2.5a4.502 4.502 0 0 0-2.04 1.027l-5.404-4.203a1.828 1.828 0 0 0 .117-.624A1.875 1.875 0 1 0 6.22 8.7l5.324 4.14a4.5 4.5 0 1 0 5.458-2.215zm-1.46 6.375a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5z"/>
  </svg>
);

const SalesforceLogo = () => (
  <svg viewBox="0 0 24 24" className="w-10 h-8">
    <path fill="#00A1E0" d="M10.006 5.415a4.195 4.195 0 0 1 3.045-1.306c1.56 0 2.954.856 3.68 2.143a5.04 5.04 0 0 1 2.144-.481c2.79 0 5.052 2.262 5.052 5.052 0 2.79-2.262 5.052-5.052 5.052-.31 0-.614-.029-.908-.084a3.94 3.94 0 0 1-3.474 2.084c-.737 0-1.432-.203-2.024-.556a4.671 4.671 0 0 1-4.064 2.371c-2.09 0-3.881-1.371-4.49-3.263a4.174 4.174 0 0 1-.768.072C1.362 16.5 0 15.137 0 13.353c0-1.212.67-2.27 1.661-2.822a4.68 4.68 0 0 1-.344-1.75c0-2.593 2.102-4.696 4.696-4.696 1.605 0 3.023.806 3.87 2.032l.123-.202z"/>
    <text x="4.5" y="13.5" fill="white" fontSize="5" fontWeight="bold" fontFamily="Arial, sans-serif">sales</text>
    <text x="4.5" y="17" fill="white" fontSize="5" fontWeight="bold" fontFamily="Arial, sans-serif">force</text>
  </svg>
);

// Integration data with logo components
const integrations = [
  { name: "Google Workspace", Logo: GoogleLogo },
  { name: "Calendly", Logo: CalendlyLogo },
  { name: "Slack", Logo: SlackLogo },
  { name: "Zapier", Logo: ZapierLogo },
  { name: "HubSpot", Logo: HubSpotLogo },
  { name: "Salesforce", Logo: SalesforceLogo },
];

export const LogoBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={ref} 
      className="relative py-16 overflow-hidden"
      aria-label="Integrations"
    >
      {/* Unified background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.05) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className={`flex flex-wrap justify-center items-center gap-8 md:gap-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          {integrations.map((integration, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity duration-200"
              style={{ '--reveal-delay': `${i * 50}ms` } as React.CSSProperties}
            >
              <integration.Logo />
              <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
                {integration.name}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};