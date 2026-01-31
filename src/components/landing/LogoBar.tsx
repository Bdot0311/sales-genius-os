import { useEffect, useRef, useState } from "react";

// Placeholder logos - professionally formatted
const logos = [
  { name: "Acme Corp", initials: "AC" },
  { name: "TechStart", initials: "TS" },
  { name: "GrowthCo", initials: "GC" },
  { name: "ScaleUp", initials: "SU" },
  { name: "Innovate", initials: "IN" },
  { name: "Velocity", initials: "VL" },
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
    <div 
      ref={ref} 
      className="relative py-12"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <p className={`text-center text-sm text-muted-foreground mb-8 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            Trusted by growing sales teams
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {logos.map((logo, i) => (
              <div 
                key={i}
                className={`flex items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-200 scroll-reveal ${isVisible ? 'visible' : ''}`}
                style={{ '--reveal-delay': `${i * 50}ms` } as React.CSSProperties}
              >
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-xs font-semibold">
                  {logo.initials}
                </div>
                <span className="text-sm font-medium">{logo.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </div>
  );
};
