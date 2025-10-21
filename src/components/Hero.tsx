import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero">
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="container relative z-10 mx-auto px-6 py-32 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-8 animate-fade-in">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">AI-Powered Sales Operating System</span>
        </div>

        {/* Main headline */}
        <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          Close More Deals with
          <br />
          <span className="bg-gradient-primary bg-clip-text text-transparent">
            AI-Powered Sales Intelligence
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-12 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          SalesOS automates everything from lead generation to deal closing. Get real-time AI coaching, 
          intelligent outreach automation, and predictive analytics that help you sell like a pro.
        </p>

        {/* AI Command Demo */}
        <div className="max-w-2xl mx-auto mb-12 p-6 rounded-2xl bg-card border border-border backdrop-blur-sm shadow-card animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <div className="text-left font-mono text-sm">
            <span className="text-primary">→</span> <span className="text-foreground">"Find 100 SaaS founders in fintech and send them a 3-step sequence."</span>
            <div className="mt-2 text-muted-foreground">
              ✓ Found 127 qualified leads<br />
              ✓ Personalized outreach generated<br />
              ✓ Sequences scheduled for optimal send times
            </div>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in" style={{ animationDelay: "0.4s" }}>
          <Button variant="hero" size="lg" className="group">
            Start Free Trial
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button variant="glass" size="lg">
            Watch Demo
          </Button>
        </div>

        {/* Social proof */}
        <p className="mt-12 text-sm text-muted-foreground animate-fade-in" style={{ animationDelay: "0.5s" }}>
          Trusted by 500+ SaaS companies • Average 3.2x increase in qualified meetings
        </p>
      </div>
    </section>
  );
};
