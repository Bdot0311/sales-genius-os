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
      className="py-24 bg-background"
      aria-labelledby="outcomes-heading"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 id="outcomes-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Results you can measure
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              SalesOS is built for outcomes, not just features.
            </p>
          </div>

          {/* Outcomes grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {outcomes.map((outcome, index) => (
              <div 
                key={index}
                className={`p-6 rounded-xl border border-border/40 bg-card/50 transition-all duration-700 hover:border-primary/30 hover:bg-card/80 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <outcome.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold mb-2">{outcome.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{outcome.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
