import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const forYou = [
  "B2B sales teams (5-50 reps)",
  "Outbound-heavy agencies",
  "Sales-led SaaS founders",
  "Anyone tired of duct-taped sales stacks",
];

const notForYou = [
  "E-commerce businesses",
  "B2C companies",
  "Teams that don't do outbound",
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
      {/* Unified background */}
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
        <div className="max-w-[900px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="pricing-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Simple pricing. No surprises.
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              SalesOS works best for teams that sell directly to businesses. If you're running outbound, managing a pipeline, or trying to close deals faster—this is for you.
            </p>
          </div>

          {/* Two-column fit grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            {/* Who it's for */}
            <div 
              className={`group relative p-6 md:p-8 rounded-xl border border-primary/20 bg-primary/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '100ms' } as React.CSSProperties}
            >
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-5 text-primary">
                  Who it's for
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

            {/* Who it's NOT for */}
            <div 
              className={`relative p-6 md:p-8 rounded-xl border border-destructive/20 bg-destructive/[0.03] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '200ms' } as React.CSSProperties}
            >
              <div className="relative z-10">
                <h3 className="font-semibold text-lg mb-5 text-destructive/80">
                  Who it's NOT for
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

          {/* Pricing logic */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
            <p className="text-lg text-foreground mb-6">
              Free plan available. Paid plans start at $49/month with a 14-day free trial.
            </p>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base font-medium rounded-lg btn-outline-hover"
              onClick={() => navigate('/pricing')}
            >
              View pricing
            </Button>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
