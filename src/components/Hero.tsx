import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);
  
  return (
    <section 
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero"
      aria-label="Hero section"
    >
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />
      </div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6 py-20 sm:py-28 md:py-32 text-center">
        {/* Badge */}
        <div 
          className={`inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-6 sm:mb-8 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-primary animate-pulse" aria-hidden="true" />
          <span className="text-xs sm:text-sm text-muted-foreground">AI-Powered Sales Operating System</span>
        </div>

        {/* Main headline - H1 for SEO */}
        <h1 
          className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4 sm:mb-6 px-2 transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          Close More Deals with
          <br />
          <span className="text-gradient-animated">
            AI-Powered Sales Intelligence
          </span>
        </h1>

        {/* Subheadline */}
        <p 
          className={`text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 sm:mb-12 px-4 transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          SalesOS automates everything from lead generation to deal closing. Get real-time AI coaching, 
          intelligent outreach automation, and predictive analytics that help you sell like a pro.
        </p>

        {/* AI Command Demo */}
        <figure 
          className={`max-w-2xl mx-auto mb-8 sm:mb-12 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-card border border-border backdrop-blur-sm shadow-card card-interactive transition-all duration-700 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4" aria-hidden="true">
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-destructive animate-pulse" />
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-yellow-500 animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
          <figcaption className="sr-only">AI Command Demo showing how SalesOS processes a lead generation request</figcaption>
          <div className="text-left font-mono text-xs sm:text-sm">
            <span className="text-primary" aria-hidden="true">→</span> <span className="text-foreground">"Find 100 SaaS founders in fintech and send them a 3-step sequence."</span>
            <div className="mt-2 text-muted-foreground" role="status" aria-label="AI processing results">
              <span className={`inline-block transition-all duration-500 delay-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                <span aria-hidden="true" className="text-green-400">✓</span> Found 127 qualified leads
              </span><br />
              <span className={`inline-block transition-all duration-500 delay-700 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                <span aria-hidden="true" className="text-green-400">✓</span> Personalized outreach generated
              </span><br />
              <span className={`inline-block transition-all duration-500 delay-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                <span aria-hidden="true" className="text-green-400">✓</span> Sequences scheduled for optimal send times
              </span>
            </div>
          </div>
        </figure>

        {/* CTA Buttons */}
        <nav 
          className={`flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center px-4 transition-all duration-700 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          aria-label="Call to action"
        >
          <Button variant="hero" size="lg" className="group w-full sm:w-auto magnetic-btn" onClick={() => navigate('/pricing')}>
            Start Free Trial
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
          </Button>
          <Button variant="glass" size="lg" className="w-full sm:w-auto magnetic-btn" onClick={() => {
            document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Watch Demo
          </Button>
        </nav>

        {/* Social proof */}
        <p 
          className={`mt-8 sm:mt-12 text-xs sm:text-sm text-muted-foreground px-4 transition-all duration-700 delay-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <strong>Trusted by 500+ SaaS companies</strong> • Average 3.2x increase in qualified meetings
        </p>
      </div>
    </section>
  );
};
