import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const PricingTeaser = () => {
  const navigate = useNavigate();
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
    <div 
      ref={ref}
      className="relative py-16 md:py-20 overflow-hidden"
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
          <div className={`group relative max-w-2xl mx-auto text-center p-8 md:p-10 rounded-2xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Spotlight effect */}
            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
            
            <div className="relative z-10">
              <h3 className="text-xl font-semibold mb-3">Simple, transparent pricing</h3>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Start with a 14-day free trial. Plans scale with your team size and lead volume.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Button 
                  onClick={() => navigate('/pricing')}
                  className="group/btn btn-glow-hover"
                >
                  View pricing
                  <ArrowRight className="w-4 h-4 ml-2 group-hover/btn:translate-x-1 transition-transform duration-200" aria-hidden="true" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Credit card required for trial
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </div>
  );
};
