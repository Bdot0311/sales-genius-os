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
      className={`py-12 border-b border-border/40 transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Trusted by growing sales teams
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {logos.map((logo, i) => (
              <div 
                key={i}
                className="flex items-center gap-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                style={{ transitionDelay: `${i * 50}ms` }}
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
    </div>
  );
};
