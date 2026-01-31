import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
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
      className={`py-16 bg-background transition-all duration-700 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="max-w-2xl mx-auto text-center p-8 rounded-2xl border border-border/40 bg-card/50">
            <h3 className="text-xl font-semibold mb-3">Simple, transparent pricing</h3>
            <p className="text-muted-foreground mb-6">
              Start with a 14-day free trial. No credit card required. 
              Plans scale with your team size and lead volume.
            </p>
            <Button 
              onClick={() => navigate('/pricing')}
              className="group"
            >
              View pricing
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
