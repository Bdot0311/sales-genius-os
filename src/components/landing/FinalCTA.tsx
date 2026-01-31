import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const FinalCTA = () => {
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
      aria-labelledby="final-cta-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.1) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`max-w-3xl mx-auto text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Main content card */}
            <div className="relative p-10 md:p-14 rounded-2xl border border-border/30 bg-gradient-to-b from-primary/[0.04] to-transparent overflow-hidden">
              {/* Card spotlight effect */}
              <div className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              
              <div className="relative z-10">
                <h2 id="final-cta-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                  Ready to build pipeline faster?
                </h2>
                
                <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto leading-relaxed">
                  Find better leads, personalize outreach, and close more deals—all from one platform.
                </p>

                {/* CTA buttons */}
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <Button 
                    size="lg"
                    className="h-12 px-6 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group btn-glow-hover inline-flex items-center justify-center"
                    onClick={() => navigate('/auth')}
                  >
                    <span>Start 14-day free trial</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" aria-hidden="true" />
                  </Button>
                  <Button
                    size="lg"
                    className="h-12 px-6 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => navigate('/pricing')}
                  >
                    View pricing
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
