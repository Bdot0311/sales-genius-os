import { useEffect, useRef, useState } from "react";
import { X, Check, Sparkles } from "lucide-react";

const notList = [
  "Apollo or ZoomInfo — databases you pay per contact whether it converts or not",
  "LinkedIn Sales Navigator — boolean queries and manual list-building",
  "A bloated CRM that requires consultants to configure",
  "Five disconnected tools duct-taped together with Zapier",
];

const isList = [
  "Describe your ICP in plain English — no boolean queries, no filters",
  "Every lead scored 0–100 for fit before you spend a second on them",
  "AI-personalized outreach with quality checks built in, not bolted on",
  "Set up in under 2 minutes — no implementation project required",
];

export const DifferentiationSection = () => {
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
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="differentiation-heading"
    >
      {/* Unified background */}
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              <Sparkles className="w-3 h-3" />
              Built Different
            </div>
            <h2 id="differentiation-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Why SalesOS instead of Apollo, ZoomInfo, or Sales Nav?
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Those tools deliver data. SalesOS delivers leads you can close — scored, personalized outreach included.
            </p>
          </div>

          {/* Two-column layout */}
          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            {/* What we're NOT */}
            <div 
              className={`group relative p-6 md:p-8 rounded-xl border border-destructive/20 bg-destructive/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '100ms' } as React.CSSProperties}
            >
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-6 text-destructive/80">
                  Not this
                </h3>
                <ul className="space-y-4">
                  {notList.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                        <X className="w-3 h-3 text-destructive" aria-hidden="true" />
                      </div>
                      <span className={`text-muted-foreground relative ${isVisible ? 'animate-strike' : ''}`}
                        style={{ animationDelay: `${index * 150 + 400}ms`, animationFillMode: 'both' }}
                      >
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* What we ARE */}
            <div 
              className={`group relative p-6 md:p-8 rounded-xl border border-primary/20 bg-primary/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '200ms' } as React.CSSProperties}
            >
              {/* Spotlight effect */}
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-6 text-primary">
                  SalesOS
                </h3>
                <ul className="space-y-4">
                  {isList.map((item, index) => (
                    <li 
                      key={index} 
                      className={`flex items-start gap-3 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-3'}`}
                      style={{ transitionDelay: `${index * 100 + 300}ms` }}
                    >
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                      </div>
                      <span className="text-foreground font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};