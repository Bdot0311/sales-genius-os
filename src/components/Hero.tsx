import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

export const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Parallax mouse effect
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
    const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
    setMousePosition({ x, y });
  };

  return (
    <section 
      ref={heroRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 noise-bg"
    >
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-hero" />
      
      {/* Floating gradient orbs with parallax */}
      <div 
        className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none animate-glow-pulse"
        style={{ 
          transform: `translate(${mousePosition.x * 30}px, ${mousePosition.y * 30}px)` 
        }}
      />
      <div 
        className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/8 rounded-full blur-[100px] pointer-events-none"
        style={{ 
          transform: `translate(${mousePosition.x * -20}px, ${mousePosition.y * -20}px)`,
          animationDelay: '2s'
        }}
      />
      
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="container relative z-10 mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Animated Badge */}
          <div 
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0 animate-blur-in' : 'opacity-0 translate-y-4'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-sm font-medium text-primary">Now in Beta — Join 500+ early adopters</span>
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>

          {/* Main headline with blur-in effect */}
          <h1 
            className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 transition-all duration-1000 delay-150 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            The sales platform{" "}
            <br className="hidden sm:block" />
            <span className="text-gradient-animated">
              that closes deals
            </span>
          </h1>

          {/* Subheadline */}
          <p 
            className={`text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-1000 delay-300 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            AI-powered lead discovery, personalized outreach, and intelligent pipeline management. 
            Everything you need to scale your sales in one unified platform.
          </p>

          {/* CTA Buttons */}
          <div 
            className={`flex flex-col sm:flex-row gap-4 justify-center items-center mb-16 transition-all duration-1000 delay-500 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <Button 
              size="lg" 
              className="h-14 px-8 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-xl magnetic-btn group shadow-glow"
              onClick={() => navigate('/pricing')}
            >
              Start free trial
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="ghost" 
              size="lg"
              className="h-14 px-8 text-base font-medium text-muted-foreground hover:text-foreground rounded-xl group"
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Play className="w-4 h-4 mr-2 fill-current" />
              Watch demo
            </Button>
          </div>
        </div>

        {/* Product preview card with 3D tilt effect */}
        <div 
          className={`mt-16 max-w-5xl mx-auto transition-all duration-1000 delay-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
          }`}
          style={{
            transform: isVisible 
              ? `perspective(1000px) rotateX(${mousePosition.y * 2}deg) rotateY(${mousePosition.x * 2}deg)` 
              : undefined,
            transition: 'transform 0.1s ease-out'
          }}
        >
          <div className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl p-1.5 shadow-2xl shadow-primary/10 gradient-border overflow-hidden">
            {/* Spotlight effect */}
            <div 
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                background: `radial-gradient(600px circle at ${50 + mousePosition.x * 50}% ${50 + mousePosition.y * 50}%, hsl(261 75% 65% / 0.15), transparent 40%)`
              }}
            />
            
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 relative z-10">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/80" />
                <div className="w-3 h-3 rounded-full bg-accent/80" />
                <div className="w-3 h-3 rounded-full bg-primary/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground font-mono">
                  app.salesos.io/dashboard
                </div>
              </div>
            </div>
            
            {/* Dashboard preview content */}
            <div className="p-6 space-y-4 relative z-10">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Active leads", value: "1,284", change: "+12%" },
                  { label: "Meetings booked", value: "47", change: "+8%" },
                  { label: "Emails sent", value: "2,341", change: "+23%" },
                  { label: "Pipeline value", value: "$847K", change: "+15%" },
                ].map((metric, i) => (
                  <div 
                    key={i} 
                    className="p-4 rounded-xl bg-background/50 border border-border/30 hover-lift cursor-default"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{metric.label}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold">{metric.value}</span>
                      <span className="text-xs text-primary">{metric.change}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Skeleton content with shimmer */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 h-32 rounded-xl bg-muted/30 animate-shimmer" />
                <div className="h-32 rounded-xl bg-muted/30 animate-shimmer" style={{ animationDelay: '0.5s' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
