import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles, Search, User, Linkedin, Mail, Zap, Target, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

// Shimmer component for loading state
const SearchShimmer = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div 
        key={i} 
        className="h-20 rounded-xl bg-muted/30 animate-shimmer-once"
        style={{ animationDelay: `${i * 100}ms` }}
      />
    ))}
  </div>
);

// Animated counter component
const AnimatedCounter = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (hasAnimated) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          let start = 0;
          const duration = 1200;
          const startTime = performance.now();
          
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(easeOut * value));
            
            if (progress < 1) {
              requestAnimationFrame(animate);
            }
          };
          
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, hasAnimated]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// AI Lead Search Demo Component
const LeadSearchDemo = () => {
  const [typedText, setTypedText] = useState("");
  const [isSearching, setIsSearching] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const fullText = "SaaS founders in Europe, 10-50 employees";

  useEffect(() => {
    let index = 0;
    const typingInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typingInterval);
        // Show shimmer for 1.2s then reveal results
        setTimeout(() => {
          setIsSearching(false);
          setShowResults(true);
        }, 1200);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, []);

  useEffect(() => {
    if (showResults && currentResultIndex < 3) {
      const timer = setTimeout(() => {
        setCurrentResultIndex(prev => prev + 1);
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [showResults, currentResultIndex]);

  const leads = [
    { name: "Sarah Johnson", role: "Founder & CEO", company: "TechFlow", location: "London, UK", score: 94 },
    { name: "Marcus Chen", role: "Co-founder", company: "DataSync", location: "Berlin, DE", score: 89 },
    { name: "Emma Wilson", role: "CEO", company: "CloudBase", location: "Amsterdam, NL", score: 87 },
  ];

  return (
    <div className="relative rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl group">
      {/* Cursor-follow spotlight effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
      
      {/* Live product label */}
      <div className="absolute top-4 right-4 z-20 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
        <span className="text-xs font-medium text-primary">Live product view</span>
      </div>

      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/30">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive/60" aria-hidden="true" />
          <div className="w-3 h-3 rounded-full bg-primary/60" aria-hidden="true" />
          <div className="w-3 h-3 rounded-full bg-muted-foreground/40" aria-hidden="true" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-4 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground font-mono flex items-center gap-2">
            <Zap className="w-3 h-3 text-primary" aria-hidden="true" />
            app.salesos.io/leads
          </div>
        </div>
      </div>

      {/* Search interface */}
      <div className="p-6">
        {/* AI Command input */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">AI Lead Discovery</span>
          </div>
          <div className="relative bg-muted/30 rounded-xl p-4 border border-border/40">
            <div className="flex items-center gap-3">
              <Search className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-foreground">{typedText}</span>
              <span className="w-0.5 h-5 bg-primary animate-pulse" />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {showResults ? "Found 847 matching leads" : "Searching..."}
            </span>
            {showResults && (
              <span className="text-primary text-xs font-medium">AI-scored & ranked</span>
            )}
          </div>

          {isSearching && !showResults ? (
            <SearchShimmer />
          ) : (
            leads.map((lead, i) => (
              <div
                key={i}
                className={`group/card relative p-4 rounded-xl border border-border/40 bg-background/50 hover:bg-background/80 hover:border-primary/25 cursor-pointer card-hover-lift`}
                style={{ 
                  opacity: currentResultIndex > i ? 1 : 0,
                  transform: currentResultIndex > i ? 'translateY(0)' : 'translateY(10px)',
                  filter: currentResultIndex > i ? 'blur(0)' : 'blur(6px)',
                  transition: 'opacity 0.28s ease-out, transform 0.28s ease-out, filter 0.28s ease-out',
                  transitionDelay: `${i * 70}ms`
                }}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm">{lead.name}</span>
                      <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {showResults && currentResultIndex > i ? (
                          <AnimatedCounter value={lead.score} suffix="% match" />
                        ) : (
                          `${lead.score}% match`
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lead.role} at <span className="text-foreground">{lead.company}</span> · {lead.location}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                      <Linkedin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export const HeroSection = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    
    const timer = setTimeout(() => setIsVisible(true), mediaQuery.matches ? 0 : 100);
    
    return () => {
      clearTimeout(timer);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Subtle parallax on scroll (desktop only, respects reduced motion)
  useEffect(() => {
    if (prefersReducedMotion) return;
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prefersReducedMotion]);

  const parallaxOffset = prefersReducedMotion ? 0 : Math.min(scrollY * 0.04, 6);

  return (
    <section 
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16"
      aria-labelledby="hero-heading"
    >
      {/* Layer 1: Faint grid with subtle parallax */}
      <div 
        className="absolute inset-0 grid-bg pointer-events-none parallax-grid"
        style={{ 
          transform: `translateY(${parallaxOffset}px)`,
          opacity: 0.5
        }}
        aria-hidden="true"
      />
      
      {/* Layer 2: Aurora ambient glow - animated */}
      <div 
        className="absolute top-1/3 left-1/2 w-[1000px] h-[700px] aurora-ambient pointer-events-none"
        aria-hidden="true"
      />
      
      {/* Layer 3: Secondary radial glow for depth */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(261 75% 55% / 0.08) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />
      
      {/* Layer 4: Noise texture to prevent banding */}
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-[1120px] mx-auto">
          {/* Left side - Content */}
          <div className="text-center lg:text-left">
            {/* Beta Badge */}
            <div 
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6 scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '0ms' } as React.CSSProperties}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium text-primary">Now in Beta</span>
            </div>

            {/* Main headline */}
            <h1 
              id="hero-heading"
              className={`text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1] scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '60ms' } as React.CSSProperties}
            >
              Find, engage, and{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                close more deals.
              </span>
            </h1>

            {/* Subheadline */}
            <p 
              className={`hero-description text-lg text-muted-foreground max-w-lg mb-8 leading-relaxed scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '120ms' } as React.CSSProperties}
            >
              AI-powered lead discovery, personalized outreach, pipeline management, and sales coaching—all in one platform. Your first lead in under 2 minutes.
            </p>

            {/* CTA Buttons */}
            <div 
              className={`flex flex-col sm:flex-row gap-3 justify-center lg:justify-start items-center mb-4 scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '180ms' } as React.CSSProperties}
            >
              <Button 
                size="lg" 
                className="h-12 px-6 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group btn-glow-hover"
                onClick={() => navigate('/auth')}
                aria-label="Start free trial - no credit card required"
              >
                Start free trial — no credit card
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="h-12 px-6 text-base font-medium rounded-lg group btn-outline-hover"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                aria-label="Watch 90-second demo video"
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Watch 90-second demo
              </Button>
            </div>

            {/* Micro-line under CTAs */}
            <p className={`text-sm text-muted-foreground mb-8 scroll-reveal ${
              isVisible ? 'visible' : ''
            }`} style={{ '--reveal-delay': '240ms' } as React.CSSProperties}>
              Set up in 2 minutes. Cancel anytime.
            </p>

            {/* Proof chips - fixed formatting */}
            <div 
              className={`flex flex-wrap gap-4 justify-center lg:justify-start scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '300ms' } as React.CSSProperties}
            >
              {[
                { icon: Zap, text: "3× faster prospecting" },
                { icon: Target, text: "85% ICP match accuracy" },
                { icon: Clock, text: "First lead in under 2 minutes" },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <stat.icon className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{stat.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Lead Search Demo */}
          <div 
            className={`scroll-reveal ${isVisible ? 'visible' : ''}`}
            style={{ '--reveal-delay': '200ms' } as React.CSSProperties}
          >
            <LeadSearchDemo />
          </div>
        </div>
      </div>
      
      {/* Hairline gradient separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </section>
  );
};
