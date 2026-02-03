import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

export const MidPageCTA = () => {
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
    <section 
      ref={ref}
      className="relative py-12 sm:py-16 border-y border-border/10 bg-muted/5"
      aria-label="Get started with SalesOS"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <p className="text-sm sm:text-base text-muted-foreground text-center sm:text-left">
            Ready to find your next best customer?
          </p>
          <Button 
            size="lg"
            className="h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group btn-glow-hover"
            onClick={() => navigate('/auth')}
            aria-label="Start 14-day free trial"
          >
            <span>Start free trial</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
          </Button>
        </div>
      </div>
    </section>
  );
};
