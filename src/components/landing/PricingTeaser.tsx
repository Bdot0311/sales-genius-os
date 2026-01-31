import { useEffect, useRef, useState } from "react";
import { Shield, Lock, Server, CheckCircle2 } from "lucide-react";

const trustSignals = [
  {
    icon: Shield,
    title: "SOC 2 Compliant",
    description: "Enterprise-grade security standards"
  },
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description: "Your data is always protected"
  },
  {
    icon: Server,
    title: "99.9% Uptime SLA",
    description: "Reliable infrastructure you can count on"
  },
  {
    icon: CheckCircle2,
    title: "GDPR Ready",
    description: "Full compliance with data regulations"
  }
];

export const PricingTeaser = () => {
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
      className="relative py-16 md:py-20 overflow-hidden"
      aria-labelledby="trust-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.05) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-10 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="trust-heading" className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Built for security & compliance
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enterprise-ready infrastructure that protects your data and your customers.
            </p>
          </div>

          {/* Trust signals grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trustSignals.map((signal, index) => (
              <div 
                key={signal.title}
                className={`group relative p-5 rounded-xl border border-border/30 bg-card/40 text-center card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 75}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-3 transition-transform duration-200 group-hover:scale-110">
                    <signal.icon className="w-5 h-5" />
                  </div>
                  <div className="font-medium text-sm mb-1">{signal.title}</div>
                  <div className="text-xs text-muted-foreground">{signal.description}</div>
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
