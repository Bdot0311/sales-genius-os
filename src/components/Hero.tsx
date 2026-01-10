import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

export const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);
  
  return (
    <section 
      ref={sectionRef}
      className="relative min-h-[85vh] flex items-center justify-center overflow-hidden bg-background"
      aria-label="Hero section"
    >
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32">
        <div className="max-w-3xl mx-auto text-center">
          {/* Main headline - outcome-driven, concrete */}
          <h1 
            className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            Find leads. Send emails. Close deals.
          </h1>

          {/* Subheadline - what the product actually does */}
          <p 
            className={`text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            SalesOS is a sales execution system. You search for leads using plain language, 
            the system enriches and scores them, and you send personalized outreach from one place.
          </p>

          {/* What you actually get */}
          <p 
            className={`text-base text-muted-foreground/80 max-w-xl mx-auto mb-10 transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            No switching between tools. No manual data entry. 
            You describe who you want to reach, and SalesOS handles the rest.
          </p>

          {/* Single primary CTA - confident, boring, works */}
          <div 
            className={`flex flex-col sm:flex-row gap-4 justify-center items-center transition-all duration-700 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            <Button 
              size="lg" 
              className="group w-full sm:w-auto bg-foreground text-background hover:bg-foreground/90 font-medium px-8" 
              onClick={() => navigate('/pricing')}
            >
              Start 14-day trial
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </div>

          {/* Simple proof point */}
          <p 
            className={`mt-8 text-sm text-muted-foreground transition-all duration-700 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            No credit card required
          </p>
        </div>
      </div>
    </section>
  );
};
