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
      className="relative py-24 bg-muted/30"
      aria-labelledby="how-it-works-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="how-it-works-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              How it works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From ICP description to qualified leads in three simple steps.
            </p>
          </div>

          {/* Steps - horizontal on desktop, stacked on mobile */}
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div 
                key={index}
                className={`relative scroll-reveal ${isVisible ? 'visible' : ''}`}
                style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
              >
                {/* Connector line - hidden on mobile and last item */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[calc(50%+48px)] w-[calc(100%-96px)] h-px bg-border/60">
                    <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}

                <div className="text-center">
                  {/* Step number */}
                  <div className="text-xs font-mono text-primary mb-4">{step.number}</div>
                  
                  {/* Icon */}
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-7 h-7 text-primary" aria-hidden="true" />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-semibold mb-3">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </section>
  );
};
