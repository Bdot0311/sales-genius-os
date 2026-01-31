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
      className="relative py-24 bg-background"
      aria-labelledby="final-cta-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`max-w-3xl mx-auto text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Main content card */}
            <div className="p-10 md:p-12 rounded-2xl border border-border/40 bg-gradient-to-b from-primary/5 to-transparent">
              <h2 id="final-cta-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Ready to build pipeline faster?
              </h2>
              
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
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
                    <item.icon className="w-4 h-4 text-primary" aria-hidden="true" />
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
