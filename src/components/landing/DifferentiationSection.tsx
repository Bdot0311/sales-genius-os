import { useEffect, useRef, useState } from "react";
import { X, Check, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const notList = [
  "Just another contact database that leaves you doing the hard part yourself",
  "A workflow built around filters, spreadsheets, and manual list-building",
  "A bloated system that takes weeks to configure before anyone gets value",
  "A pile of disconnected tools your team has to babysit every day",
];

const isList = [
  "A faster way to describe your target market and start prospecting",
  "A lead workflow centered on fit, context, and speed instead of raw volume",
  "A simpler path from search to outreach to reply management",
  "A product designed for teams that want pipeline movement, not tool sprawl",
];

export const DifferentiationSection = () => {
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
          <div className="grid md:grid-cols-2 gap-6 md:gap-8 mb-10">
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
          {/* CTA at moment of differentiation clarity */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '350ms' } as React.CSSProperties}>
            <p className="text-sm text-muted-foreground mb-4">
              Switch in an afternoon. Your first 10 leads are free.
            </p>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate('/auth')}
              className="group"
            >
              Get 10 free ICP-scored leads
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground/50 mt-3">No credit card · Setup in 2 min · Cancel anytime</p>
          </div>
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};