import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Clock } from "lucide-react";
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
      className="relative py-24 md:py-32 bg-background overflow-hidden"
      aria-labelledby="final-cta-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      {/* Subtle ambient glow */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />
      
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
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-8">
                  <Button 
                    size="lg"
                    className="h-12 px-6 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group btn-glow-hover"
                    onClick={() => navigate('/auth')}
                  >
                    Start free trial — no credit card
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 px-6 text-base font-medium rounded-lg btn-outline-hover"
                    onClick={() => navigate('/pricing')}
                  >
                    View pricing
                  </Button>
                </div>

                {/* Trust bullets */}
                <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                  {[
                    { icon: Zap, text: "14-day free trial" },
                    { icon: Shield, text: "No credit card required" },
                    { icon: Clock, text: "Setup in 2 minutes" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <item.icon className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                      <span>{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
