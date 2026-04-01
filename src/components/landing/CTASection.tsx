import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Shield, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const CTASection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePosition({ x, y });
  };

  return (
    <section ref={ref} onMouseMove={handleMouseMove} className="py-32 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      
      {/* Multiple animated orbs */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/15 rounded-full blur-[150px] pointer-events-none animate-glow-pulse"
        style={{
          transform: `translate(calc(-50% + ${mousePosition.x * 30}px), calc(-50% + ${mousePosition.y * 30}px))`
        }}
      />
      <div 
        className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] pointer-events-none animate-float"
      />
      
      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary/40 rounded-full animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>
      
      <div className="container relative z-10 mx-auto px-6">
        <div className={`max-w-4xl mx-auto transition-all duration-1000 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        }`}>
          {/* Main CTA card with glassmorphism */}
          <div className="relative p-12 md:p-16 rounded-3xl border border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden">
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 animate-gradient-shift opacity-50" />
            
            {/* Spotlight following mouse */}
            <div 
              className="absolute inset-0 opacity-30 pointer-events-none transition-all duration-100"
              style={{
                background: `radial-gradient(600px circle at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, hsl(261 75% 65% / 0.2), transparent 40%)`
              }}
            />
            
            <div className="relative z-10 text-center">
              {/* Floating badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8 floating-badge">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Start closing more deals today</span>
              </div>

              <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
                Ready to transform
                <br />
                <span className="text-gradient-animated">your sales process?</span>
              </h2>

              <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
                Join sales teams using SalesOS to find better leads, 
                close more deals, and grow revenue faster.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                <Button 
                  size="lg"
                  className="h-14 px-10 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-xl magnetic-btn group shadow-glow"
                  onClick={() => navigate('/pricing')}
                >
                  Start for free
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-14 px-10 text-base font-medium rounded-xl group"
                  onClick={() => navigate('/pricing')}
                >
                  View pricing
                </Button>
              </div>

              {/* Trust indicators */}
              <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                {[
                  { icon: Zap, text: "Free forever plan" },
                  { icon: Shield, text: "No credit card required" },
                  { icon: Clock, text: "Setup in 2 minutes" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-primary" />
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
