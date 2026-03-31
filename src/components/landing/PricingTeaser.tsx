import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const forYou = [
  "Founder-led B2B sales teams",
  "Outbound-heavy agencies",
  "Small sales teams that need leads fast",
  "Anyone tired of manual prospect research",
];

const notForYou = [
  "E-commerce businesses",
  "B2C companies",
  "Teams that do not run outbound",
];

export const PricingTeaser = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
      aria-labelledby="pricing-heading"
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.05) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[900px] mx-auto">
          <div className={`text-center mb-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Built for outbound teams. Priced to start fast.
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Explore the workflow first, then unlock the lead volume, enrichment, and outreach capacity your team needs.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div 
              className={`group relative p-6 md:p-8 rounded-xl border border-primary/20 bg-primary/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '100ms' } as React.CSSProperties}
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-5 text-primary">
                  Who it&apos;s for
                </h3>
                <ul className="space-y-3">
                  {forYou.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                        <Check className="w-3 h-3 text-primary" aria-hidden="true" />
                      </div>
                      <span className="text-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div 
              className={`relative p-6 md:p-8 rounded-xl border border-destructive/20 bg-destructive/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '200ms' } as React.CSSProperties}
            >
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-5 text-destructive/80">
                  Who it&apos;s not for
                </h3>
                <ul className="space-y-3">
                  {notForYou.map((item, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5">
                        <X className="w-3 h-3 text-destructive" aria-hidden="true" />
                      </div>
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className={`mb-8 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
            <div className="relative p-5 rounded-xl border border-border/30 bg-card/40 text-center">
              <p className="text-sm text-foreground/80 leading-relaxed">
                Start with the workflow, then unlock the lead volume, verified data, exports, and outreach capacity your team actually needs.
              </p>
            </div>
          </div>

          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Explore SalesOS, then choose your plan
            </div>
            <p className="text-3xl font-bold text-foreground mb-1">
              Explore SalesOS
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              Preview the workflow with sample data and see how SalesOS fits your process.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Paid plans from <span className="text-foreground font-semibold">$39/mo</span> — unlock prospecting, verified data, exports, and personalized outreach.
            </p>
            <Button
              variant="hero"
              size="lg"
              className="group mb-3"
              onClick={() => navigate('/auth')}
            >
              Explore SalesOS
              <span className="ml-2 group-hover:translate-x-0.5 transition-transform duration-150">→</span>
            </Button>
            <div className="block">
              <Button
                variant="link"
                size="sm"
                className="text-muted-foreground hover:text-primary"
                onClick={() => navigate('/pricing')}
              >
                View full pricing →
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/40 mt-4">
              Upgrade when you are ready to run live prospecting and outreach at volume.
            </p>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
