import { useEffect, useRef, useState } from "react";
import { Rocket, Users, Zap } from "lucide-react";

const betaHighlights = [
  {
    icon: Rocket,
    title: "Early Access Program",
    description: "Join our beta testers shaping the future of AI-powered sales. Get exclusive access to new features before public release.",
  },
  {
    icon: Users,
    title: "Growing Community",
    description: "Connect with other sales professionals testing and refining SalesOS. Your feedback directly influences our roadmap.",
  },
  {
    icon: Zap,
    title: "Founding Member Benefits",
    description: "Beta testers receive priority support, extended trial periods, and special pricing when we launch publicly.",
  },
];

export const TestimonialsSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      id="beta-program" 
      className="relative py-24 md:py-32 bg-background"
      aria-labelledby="beta-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6">
              <span className="text-xs font-medium text-primary uppercase tracking-wider">Now in Beta</span>
            </div>
            <h2 id="beta-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Be part of something new
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              SalesOS just launched. Join our early access program and help shape the platform.
            </p>
          </div>

          {/* Beta highlights grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {betaHighlights.map((highlight, index) => {
              const Icon = highlight.icon;
              return (
                <div 
                  key={index}
                  className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                    isVisible ? 'visible' : ''
                  }`}
                  style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
                >
                  {/* Spotlight effect on hover */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                  
                  <div className="relative z-10">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{highlight.title}</h3>
                    <p className="text-muted-foreground leading-relaxed text-sm">
                      {highlight.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Beta CTA */}
          <div className={`text-center mt-12 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '240ms' } as React.CSSProperties}>
            <p className="text-sm text-muted-foreground">
              No credit card required • 14-day free trial • Cancel anytime
            </p>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
