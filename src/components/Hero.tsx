import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles, Search, User, Building2, Mail, Linkedin, Zap, TrendingUp, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

// Floating particles component
const FloatingParticles = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-primary/30 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 2}s`,
          }}
        />
      ))}
    </div>
  );
};

// AI Lead Search Demo Component
const LeadSearchDemo = ({ mousePosition }: { mousePosition: { x: number; y: number } }) => {
  const [typedText, setTypedText] = useState("");
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
        setTimeout(() => setShowResults(true), 400);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, []);

  useEffect(() => {
    if (showResults && currentResultIndex < 3) {
      const timer = setTimeout(() => {
        setCurrentResultIndex(prev => prev + 1);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [showResults, currentResultIndex]);

  const leads = [
    { name: "Sarah Johnson", role: "Founder & CEO", company: "TechFlow", location: "London, UK", score: 94 },
    { name: "Marcus Chen", role: "Co-founder", company: "DataSync", location: "Berlin, DE", score: 89 },
    { name: "Emma Wilson", role: "CEO", company: "CloudBase", location: "Amsterdam, NL", score: 87 },
  ];

  return (
    <div 
      className="relative rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl overflow-hidden shadow-2xl shadow-primary/20"
      style={{
        transform: `perspective(1000px) rotateX(${mousePosition.y * 3}deg) rotateY(${mousePosition.x * 3}deg)`,
        transition: 'transform 0.1s ease-out'
      }}
    >
      {/* Animated border glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 animate-gradient-shift opacity-50" />
      
      {/* Spotlight effect */}
      <div 
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${50 + mousePosition.x * 50}% ${50 + mousePosition.y * 50}%, hsl(261 75% 65% / 0.2), transparent 40%)`
        }}
      />

      <div className="relative bg-card/95 m-[1px] rounded-2xl">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-primary/60" />
            <div className="w-3 h-3 rounded-full bg-accent/60" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground font-mono flex items-center gap-2">
              <Zap className="w-3 h-3 text-primary" />
              app.salesos.io/leads
            </div>
          </div>
        </div>

        {/* Search interface */}
        <div className="p-6">
          {/* AI Command input */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">AI Lead Discovery</span>
            </div>
            <div className="relative bg-muted/30 rounded-xl p-4 border border-border/50 group hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-3">
                <Search className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-foreground">{typedText}</span>
                <span className="w-0.5 h-5 bg-primary animate-pulse" />
              </div>
              {/* Shimmer effect on input */}
              <div className="absolute inset-0 rounded-xl animate-shimmer opacity-50 pointer-events-none" />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {showResults ? "Found 847 matching leads" : "Searching..."}
              </span>
              {showResults && (
                <span className="text-primary text-xs font-medium animate-fade-in">AI-scored & ranked</span>
              )}
            </div>

            {leads.map((lead, i) => (
              <div
                key={i}
                className={`group p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background/80 hover:border-primary/30 transition-all duration-500 cursor-pointer ${
                  currentResultIndex > i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{lead.name}</span>
                      <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        {lead.score}% match
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {lead.role} at <span className="text-foreground">{lead.company}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{lead.location}</div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                      <Linkedin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

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
      
      {/* Floating particles */}
      <FloatingParticles />
      
      {/* Multiple floating gradient orbs with parallax */}
      <div 
        className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[120px] pointer-events-none animate-glow-pulse"
        style={{ 
          transform: `translate(${mousePosition.x * 40}px, ${mousePosition.y * 40}px)` 
        }}
      />
      <div 
        className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[100px] pointer-events-none"
        style={{ 
          transform: `translate(${mousePosition.x * -30}px, ${mousePosition.y * -30}px)`,
        }}
      />
      <div 
        className="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[80px] pointer-events-none animate-float"
      />
      
      {/* Animated grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          transform: `translate(${mousePosition.x * 10}px, ${mousePosition.y * 10}px)`
        }}
      />

      <div className="container relative z-10 mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left side - Content */}
          <div className="text-center lg:text-left">
            {/* Animated Badge */}
            <div 
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6 transition-all duration-700 ${
                isVisible ? 'opacity-100 translate-y-0 animate-blur-in' : 'opacity-0 translate-y-4'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-sm font-medium text-primary">Now in Beta</span>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>

            {/* Main headline */}
            <h1 
              className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 transition-all duration-1000 delay-150 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              Find leads that{" "}
              <span className="text-gradient-animated">
                actually convert
              </span>
            </h1>

            {/* Subheadline */}
            <p 
              className={`text-lg sm:text-xl text-muted-foreground max-w-xl mb-8 leading-relaxed transition-all duration-1000 delay-300 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              AI-powered lead discovery that finds your ideal customers in seconds. 
              Just describe who you're looking for in plain English.
            </p>

            {/* CTA Buttons */}
            <div 
              className={`flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center mb-8 transition-all duration-1000 delay-500 ${
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

            {/* Compact stats */}
            <div 
              className={`flex flex-wrap gap-6 justify-center lg:justify-start transition-all duration-1000 delay-700 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {[
                { icon: TrendingUp, value: "3x", label: "faster prospecting" },
                { icon: Users, value: "85%", label: "match accuracy" },
                { icon: Zap, value: "<2min", label: "to first lead" },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <stat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-bold text-foreground">{stat.value}</span>
                    <span className="text-muted-foreground ml-1">{stat.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Lead Search Demo */}
          <div 
            className={`transition-all duration-1000 delay-500 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
          >
            <LeadSearchDemo mousePosition={mousePosition} />
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
};
