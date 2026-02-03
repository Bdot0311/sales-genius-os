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
    <div className="relative rounded-xl sm:rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl group mt-6 lg:mt-0">
      {/* Cursor-follow spotlight effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />

      {/* Browser chrome with Live product view label */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border/40 bg-muted/30">
        <div className="flex gap-1 sm:gap-1.5">
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-destructive/60" aria-hidden="true" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary/60" aria-hidden="true" />
          <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-muted-foreground/40" aria-hidden="true" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 overflow-hidden">
          <div className="hidden xs:flex px-2 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-muted/50 text-[10px] sm:text-xs text-muted-foreground font-mono items-center gap-1.5 sm:gap-2 truncate">
            <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary flex-shrink-0" aria-hidden="true" />
            <span className="truncate">app.salesos.io/leads</span>
          </div>
          <div className="px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-primary/10 border border-primary/20 flex-shrink-0">
            <span className="text-[10px] sm:text-xs font-medium text-primary whitespace-nowrap">Live product view</span>
          </div>
        </div>
      </div>

      {/* Search interface */}
      <div className="p-4 sm:p-6">
        {/* AI Command input */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-foreground" />
            </div>
            <span className="text-xs sm:text-sm font-medium text-muted-foreground">AI Lead Discovery</span>
          </div>
          <div className="relative bg-muted/30 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-border/40">
            <div className="flex items-center gap-2 sm:gap-3">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
              <span className="text-sm sm:text-base text-foreground truncate">{typedText}</span>
              <span className="w-0.5 h-4 sm:h-5 bg-primary animate-pulse flex-shrink-0" />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-muted-foreground">
              {showResults ? "Found 847 matching leads" : "Searching..."}
            </span>
            {showResults && (
              <span className="text-primary text-[10px] sm:text-xs font-medium">AI-scored & ranked</span>
            )}
          </div>

          {isSearching && !showResults ? (
            <SearchShimmer />
          ) : (
            leads.map((lead, i) => (
              <div
                key={i}
                className={`group/card relative p-3 sm:p-4 rounded-lg sm:rounded-xl border border-border/40 bg-background/50 hover:bg-background/80 hover:border-primary/25 cursor-pointer card-hover-lift`}
                style={{ 
                  opacity: currentResultIndex > i ? 1 : 0,
                  transform: currentResultIndex > i ? 'translateY(0)' : 'translateY(10px)',
                  filter: currentResultIndex > i ? 'blur(0)' : 'blur(6px)',
                  transition: 'opacity 0.28s ease-out, transform 0.28s ease-out, filter 0.28s ease-out',
                  transitionDelay: `${i * 70}ms`
                }}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-lg sm:rounded-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10 flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium text-xs sm:text-sm">{lead.name}</span>
                      <div className="px-1.5 sm:px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] sm:text-xs font-medium">
                        {showResults && currentResultIndex > i ? (
                          <AnimatedCounter value={lead.score} suffix="% match" />
                        ) : (
                          `${lead.score}% match`
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground truncate">
                      {lead.role} at <span className="text-foreground">{lead.company}</span> · {lead.location}
                    </div>
                  </div>
                  <div className="hidden sm:flex gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
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
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 sm:pt-28 pb-12 sm:pb-16"
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
        className="absolute top-1/3 left-1/2 w-[600px] sm:w-[1000px] h-[400px] sm:h-[700px] aurora-ambient pointer-events-none"
        aria-hidden="true"
      />
      
      {/* Layer 3: Secondary radial glow for depth */}
      <div 
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] sm:w-[800px] h-[300px] sm:h-[500px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, hsl(261 75% 55% / 0.08) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />
      
      {/* Layer 4: Noise texture to prevent banding */}
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center max-w-[1120px] mx-auto">
          {/* Left side - Content */}
          <div className="text-center lg:text-left">
            {/* Product category label */}
            <span 
              className={`inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4 scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '40ms' } as React.CSSProperties}
            >
              AI Sales Platform
            </span>
            
            {/* Main headline */}
            <h1 
              id="hero-heading"
              className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6 leading-[1.15] scroll-reveal ${
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
              className={`hero-description text-base sm:text-lg text-muted-foreground max-w-lg mx-auto lg:mx-0 mb-2 sm:mb-3 leading-relaxed scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '120ms' } as React.CSSProperties}
            >
              AI-powered lead discovery with 85% ICP match accuracy. Your first qualified lead in under 2 minutes.
            </p>
            
            {/* Audience context */}
            <p 
              className={`text-sm text-muted-foreground/80 max-w-lg mx-auto lg:mx-0 mb-6 sm:mb-8 scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '140ms' } as React.CSSProperties}
            >
              Perfect for B2B sales teams targeting SaaS founders, fintech leaders, and tech executives.
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
                className="w-full sm:w-auto h-12 sm:h-14 px-6 sm:px-8 text-sm sm:text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group btn-glow-hover inline-flex items-center justify-center"
                onClick={() => navigate('/auth')}
                aria-label="Start 14-day free trial"
              >
                <span>Start 14-day free trial</span>
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
              </Button>
              <Button 
                variant="ghost" 
                size="default"
                className="hidden sm:flex w-auto h-10 px-4 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg group"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                aria-label="Watch 90-second demo video"
              >
                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                Watch demo
              </Button>
            </div>

            {/* Micro-line under CTAs */}
            <p className={`text-xs sm:text-sm text-muted-foreground mb-6 sm:mb-8 scroll-reveal ${
              isVisible ? 'visible' : ''
            }`} style={{ '--reveal-delay': '240ms' } as React.CSSProperties}>
              Set up in 2 minutes. Cancel anytime.
            </p>

            {/* Process steps indicator - moved higher for clarity */}
            <div 
              className={`flex flex-wrap items-center justify-center lg:justify-start gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-muted-foreground/70 mb-4 scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '260ms' } as React.CSSProperties}
            >
              <span className="font-medium">Describe ICP</span>
              <span className="text-primary">→</span>
              <span className="font-medium">Get matches</span>
              <span className="text-primary">→</span>
              <span className="font-medium">Export</span>
            </div>
            
            {/* Mini testimonial - moved up for trust */}
            <div 
              className={`mb-4 text-xs sm:text-sm text-muted-foreground italic text-center lg:text-left scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '300ms' } as React.CSSProperties}
            >
              <span className="block sm:inline">"Cut our research time by 70%"</span>
              <span className="hidden sm:inline"> — </span>
              <span className="block sm:inline not-italic font-medium mt-1 sm:mt-0">Sarah Mitchell, Head of Sales, TechFlow</span>
            </div>

            {/* Proof chips - reduced to 2, responsive layout */}
            <div 
              className={`flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center lg:justify-start scroll-reveal ${
                isVisible ? 'visible' : ''
              }`}
              style={{ '--reveal-delay': '340ms' } as React.CSSProperties}
            >
              {[
                { icon: Zap, text: "3× faster than manual prospecting" },
                { icon: Target, text: "85% ICP match accuracy*" },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <stat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary flex-shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{stat.text}</span>
                </div>
              ))}
            </div>
            
            {/* Footnote */}
            <p className={`mt-3 text-[10px] text-muted-foreground/50 scroll-reveal ${
              isVisible ? 'visible' : ''
            }`} style={{ '--reveal-delay': '420ms' } as React.CSSProperties}>
              *Based on beta testing across 10,000+ lead matches
            </p>
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
