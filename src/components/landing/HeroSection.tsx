import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Sparkles, Search, User, Linkedin, Mail, Zap, Target, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

// AI Lead Search Demo Component - labeled as "Live product view"
const LeadSearchDemo = () => {
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
    <div className="relative rounded-2xl border border-border/40 bg-card/90 backdrop-blur-sm overflow-hidden shadow-2xl">
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

          {leads.map((lead, i) => (
            <div
              key={i}
              className={`group p-4 rounded-xl border border-border/40 bg-background/50 hover:bg-background/80 hover:border-primary/30 transition-all duration-300 cursor-pointer ${
                currentResultIndex > i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium text-sm">{lead.name}</span>
                    <div className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {lead.score}% match
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lead.role} at <span className="text-foreground">{lead.company}</span> · {lead.location}
                  </div>
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
  );
};

export const HeroSection = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section 
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16"
      aria-labelledby="hero-heading"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/[0.02] to-background" />
      
      {/* Single subtle orb */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-[1120px] mx-auto">
          {/* Left side - Content */}
          <div className="text-center lg:text-left">
            {/* Beta Badge */}
            <div 
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-6 transition-all duration-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
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
              className={`text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1] transition-all duration-700 delay-100 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              Find leads that{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                actually convert.
              </span>
            </h1>

            {/* Subheadline - rewritten for clarity */}
            <p 
              className={`hero-description text-lg text-muted-foreground max-w-lg mb-8 leading-relaxed transition-all duration-700 delay-200 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              Describe your ideal customer in plain English. Get ranked matches with enriched profiles—your first lead in under 2 minutes.
            </p>

            {/* CTA Buttons */}
            <div 
              className={`flex flex-col sm:flex-row gap-3 justify-center lg:justify-start items-center mb-4 transition-all duration-700 delay-300 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              <Button 
                size="lg" 
                className="h-12 px-6 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-lg group"
                onClick={() => navigate('/auth')}
                aria-label="Start free trial - no credit card required"
              >
                Start free trial — no credit card
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="h-12 px-6 text-base font-medium rounded-lg group"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                aria-label="Watch 90-second demo video"
              >
                <Play className="w-4 h-4 mr-2 fill-current" />
                Watch 90-second demo
              </Button>
            </div>

            {/* Micro-line under CTAs */}
            <p className={`text-sm text-muted-foreground mb-8 transition-all duration-700 delay-400 ${
              isVisible ? 'opacity-100' : 'opacity-0'
            }`}>
              Set up in 2 minutes. Cancel anytime.
            </p>

            {/* Proof chips - fixed formatting */}
            <div 
              className={`flex flex-wrap gap-4 justify-center lg:justify-start transition-all duration-700 delay-500 ${
                isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {[
                { icon: Zap, text: "3× faster prospecting" },
                { icon: Target, text: "85% ICP match accuracy" },
                { icon: Clock, text: "First lead in under 2 min" },
              ].map((stat, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <stat.icon className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span>{stat.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Lead Search Demo */}
          <div 
            className={`transition-all duration-700 delay-400 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
          >
            <LeadSearchDemo />
          </div>
        </div>
      </div>
    </section>
  );
};
