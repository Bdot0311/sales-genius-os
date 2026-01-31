import { useEffect, useRef, useState } from "react";
import { Clock, TrendingUp, Target, Gauge } from "lucide-react";

const outcomes = [
  {
    icon: Clock,
    title: "Spend less time prospecting",
    description: "AI handles the search and scoring. You focus on conversations that matter.",
  },
  {
    icon: TrendingUp,
    title: "Higher reply rates",
    description: "Personalized outreach based on enriched data means your emails actually get responses.",
  },
  {
    icon: Target,
    title: "Better-fit leads",
    description: "Every lead is scored against your ICP. No more wasted time on poor matches.",
  },
  {
    icon: Gauge,
    title: "Faster pipeline velocity",
    description: "From first touch to closed deal in fewer steps. Automation removes the friction.",
  },
];

export const OutcomesSection = () => {
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
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="outcomes-heading"
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
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="outcomes-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Results you can measure
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              SalesOS is built for outcomes, not just features.
            </p>
          </div>

          {/* Outcomes grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {outcomes.map((outcome, index) => (
              <div 
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 70}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors duration-200">
                    <outcome.icon className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors duration-200">{outcome.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{outcome.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
