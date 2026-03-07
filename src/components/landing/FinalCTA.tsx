import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
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
      className="relative py-28 md:py-40 overflow-hidden"
      aria-labelledby="final-cta-heading"
    >
      {/* Dramatic background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.15) 0%, hsl(280 70% 45% / 0.08) 30%, transparent 60%)',
          }}
          aria-hidden="true"
        />
        {/* Secondary glow */}
        <div 
          className="absolute top-1/3 left-1/4 w-[500px] h-[500px] animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(280 75% 55% / 0.08) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
        <div 
          className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(261 75% 55% / 0.06) 0%, transparent 60%)',
            animationDelay: '1.5s',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`max-w-3xl mx-auto text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Animated border card */}
            <div className="animated-border pulse-glow">
              <div className="relative p-12 md:p-16 rounded-2xl bg-gradient-to-b from-card/95 via-card/90 to-card/80 overflow-hidden">
                {/* Inner glow */}
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 0%, hsl(261 75% 65% / 0.08) 0%, transparent 50%)',
                  }}
                  aria-hidden="true"
                />
                
                {/* Sparkle icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-6 transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                  <Sparkles className="w-7 h-7 text-primary" aria-hidden="true" />
                </div>
                
                <div className="relative z-10">
                  <h2 id="final-cta-heading" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5">
                    Ready to close{" "}
                    <span className="text-shimmer">more deals</span>?
                  </h2>
                  
                  <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
                    Join 500+ sales teams already using SalesOS. Your first lead in under 2 minutes.
                  </p>

                  {/* CTA with glow */}
                  <Button 
                    size="lg"
                    className="h-16 px-10 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl group shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-1 transition-all duration-300"
                    onClick={() => navigate('/auth')}
                  >
                    <span>Start for free</span>
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" aria-hidden="true" />
                  </Button>

                  {/* Trust signals */}
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground/60">
                    <span>No credit card required</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>Free forever plan</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>Setup in 2 min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
