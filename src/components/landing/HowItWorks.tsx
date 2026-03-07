import { useEffect, useRef, useState } from "react";
import { MessageSquare, BarChart3, Send, ArrowRight } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Describe who you want to sell to",
    description: "Tell us your ideal customer in plain English. Job titles, industries, company size, location. That's it.",
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Get a ranked list with verified data",
    description: "AI scores each lead by fit. Every profile includes verified email, LinkedIn, company data, and tech stack.",
  },
  {
    number: "03",
    icon: Send,
    title: "Push them into outreach or your CRM",
    description: "One-click export to CSV. Or send directly to your sequences, HubSpot, Salesforce, or custom automations.",
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
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              3 Steps. That's it.
            </div>
            <h2 id="how-it-works-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              How it works
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              From ICP description to qualified leads in three simple steps.
            </p>
          </div>

          {/* Steps - horizontal on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-0 mb-10 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-[68px] left-[16.67%] right-[16.67%] h-px overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r from-primary/40 via-primary/20 to-primary/40 transition-all duration-1000 ease-out ${isVisible ? 'w-full' : 'w-0'}`}
                style={{ transitionDelay: '400ms' }}
              />
            </div>

            {steps.map((step, index) => (
              <div 
                key={index}
                className={`relative scroll-reveal ${isVisible ? 'visible' : ''}`}
                style={{ '--reveal-delay': `${index * 120}ms` } as React.CSSProperties}
              >
                <div className="text-center md:px-6">
                  {/* Step number with glow */}
                  <div className="text-xs font-mono text-primary/70 mb-4 tracking-wider">{step.number}</div>
                  
                  {/* Icon with gradient bg */}
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center relative group">
                    <step.icon className="w-7 h-7 text-primary" aria-hidden="true" />
                    {/* Subtle ring */}
                    <div className={`absolute inset-0 rounded-2xl border border-primary/20 transition-all duration-500 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`} 
                      style={{ transitionDelay: `${index * 120 + 200}ms` }}
                    />
                  </div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* No complexity line */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '350ms' } as React.CSSProperties}>
            <p className="text-sm text-muted-foreground/70 font-medium">
              No boolean queries. No complex filters. No data entry.
            </p>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
