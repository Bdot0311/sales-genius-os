import { useEffect, useRef, useState } from "react";

// Real integration logos using brand-appropriate colors
const integrations = [
  { name: "Google", color: "#4285F4", letter: "G" },
  { name: "Slack", color: "#4A154B", letter: "S" },
  { name: "HubSpot", color: "#FF7A59", letter: "H" },
  { name: "Salesforce", color: "#00A1E0", letter: "S" },
  { name: "Calendly", color: "#006BFF", letter: "C" },
  { name: "Zapier", color: "#FF4A00", letter: "Z" },
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
        <div className={`text-center mb-8 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-sm text-muted-foreground">
            Works with your existing tools
          </p>
        </div>
        
        <div className={`flex flex-wrap justify-center items-center gap-8 md:gap-12 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
          {integrations.map((integration, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity duration-200"
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: integration.color }}
              >
                {integration.letter}
              </div>
              <span className="text-sm font-medium text-muted-foreground">
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
