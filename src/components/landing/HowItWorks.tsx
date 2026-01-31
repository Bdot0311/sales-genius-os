import { useEffect, useRef, useState } from "react";
import { MessageSquare, BarChart3, Send, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Describe your ICP in plain English",
    description: "Tell us who you're looking for: job titles, industries, company size, location. No complex filters or boolean queries.",
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Get ranked matches + enriched profiles",
    description: "AI scores each lead by fit. Every profile comes with verified emails, LinkedIn, company data, and tech stack.",
  },
  {
    number: "03",
    icon: Send,
    title: "Export to outreach or push into your workflow",
    description: "One-click export to CSV, or send directly to your CRM, sequences, or custom automations.",
  },
];

export const HowItWorks = () => {
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
      id="how-it-works" 
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="how-it-works-heading"
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
            <h2 id="how-it-works-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              How it works
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              From ICP description to qualified leads in three simple steps.
            </p>
          </div>

          {/* Steps - horizontal on desktop, stacked on mobile */}
          <div className="grid md:grid-cols-3 gap-8 md:gap-6">
            {steps.map((step, index) => (
              <div 
                key={index}
                className={`relative scroll-reveal ${isVisible ? 'visible' : ''}`}
                style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
              >
                {/* Connector line - hidden on mobile and last item */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[calc(50%+48px)] w-[calc(100%-96px)] h-px bg-border/40">
                    <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30" />
                  </div>
                )}

                <div className="text-center">
                  {/* Step number */}
                  <div className="text-xs font-mono text-primary/70 mb-4 tracking-wider">{step.number}</div>
                  
                  {/* Icon */}
                  <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
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
