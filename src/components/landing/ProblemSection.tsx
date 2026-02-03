import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const painPoints = [
  "You're juggling 5+ tools just to run sales",
  "Half your leads are unqualified or outdated",
  "Follow-ups slip through the cracks",
  "You have no single source of truth for deals",
  "Your CRM feels like data entry, not a weapon",
];

export const ProblemSection = () => {
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
      className="relative py-16 md:py-24 overflow-hidden"
      aria-labelledby="problem-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[720px] mx-auto">
          {/* Card with dark background */}
          <div 
            className={`relative p-8 md:p-10 rounded-2xl border border-border/30 bg-gradient-to-b from-muted/50 to-muted/20 scroll-reveal ${
              isVisible ? 'visible' : ''
            }`}
          >
            {/* Spotlight effect */}
            <div className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
            
            <div className="relative z-10">
              <h2 
                id="problem-heading" 
                className="text-2xl sm:text-3xl font-bold tracking-tight mb-8 text-center"
              >
                Sound familiar?
              </h2>
              
              <ul className="space-y-4">
                {painPoints.map((point, index) => (
                  <li 
                    key={index}
                    className={`flex items-start gap-4 scroll-reveal ${isVisible ? 'visible' : ''}`}
                    style={{ '--reveal-delay': `${(index + 1) * 80}ms` } as React.CSSProperties}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                      <X className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
                    </div>
                    <span className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
