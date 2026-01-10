import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

const useTypewriter = (text: string, speed: number = 50, delay: number = 0) => {
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setHasStarted(true);
    }, delay);

    return () => clearTimeout(startTimeout);
  }, [delay]);

  useEffect(() => {
    if (!hasStarted) return;

    let index = 0;
    const timer = setInterval(() => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, hasStarted]);

  return { displayText, isComplete, hasStarted };
};

export const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [showResults, setShowResults] = useState([false, false, false]);
  const sectionRef = useRef<HTMLElement>(null);

  const command = "Find 100 SaaS founders in fintech and send them a 3-step sequence.";
  const { displayText, isComplete } = useTypewriter(command, 40, 1500);

  useEffect(() => {
    setIsVisible(true);
    
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isComplete) {
      const timers = [
        setTimeout(() => setShowResults(prev => [true, prev[1], prev[2]]), 400),
        setTimeout(() => setShowResults(prev => [prev[0], true, prev[2]]), 800),
        setTimeout(() => setShowResults(prev => [prev[0], prev[1], true]), 1200),
      ];
      return () => timers.forEach(clearTimeout);
    }
  }, [isComplete]);
  
  return (
    <section 
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero"
      aria-label="Hero section"
    >
      {/* Parallax background layers */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Deep background layer - slowest */}
        <div 
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]"
          style={{ transform: `translate3d(0, ${scrollY * 0.1}px, 0)` }}
        />
        <div 
          className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[80px]"
          style={{ transform: `translate3d(0, ${scrollY * 0.08}px, 0)` }}
        />
        
        {/* Mid layer - medium speed */}
        <div 
          className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse"
          style={{ transform: `translate3d(0, ${scrollY * 0.25}px, 0)` }}
        />
        <div 
          className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-glow-pulse"
          style={{ transform: `translate3d(0, ${scrollY * 0.2}px, 0)`, animationDelay: "1s" }}
        />
        
        {/* Foreground layer - faster */}
        <div 
          className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary/15 rounded-full blur-3xl animate-float"
          style={{ transform: `translate(-50%, -50%) translate3d(0, ${scrollY * 0.4}px, 0)`, animationDelay: "2s" }}
        />
        <div 
          className="absolute top-[20%] right-[15%] w-32 h-32 bg-accent/25 rounded-full blur-2xl"
          style={{ transform: `translate3d(0, ${scrollY * 0.5}px, 0)` }}
        />
        <div 
          className="absolute bottom-[30%] left-[10%] w-40 h-40 bg-primary/20 rounded-full blur-2xl"
          style={{ transform: `translate3d(0, ${scrollY * 0.45}px, 0)` }}
        />

        {/* Floating particles */}
        <div 
          className="absolute top-[15%] left-[20%] w-2 h-2 bg-primary/60 rounded-full"
          style={{ transform: `translate3d(0, ${scrollY * 0.6}px, 0)` }}
        />
        <div 
          className="absolute top-[40%] right-[25%] w-1.5 h-1.5 bg-accent/60 rounded-full"
          style={{ transform: `translate3d(0, ${scrollY * 0.55}px, 0)` }}
        />
        <div 
          className="absolute bottom-[40%] left-[30%] w-1 h-1 bg-primary/50 rounded-full"
          style={{ transform: `translate3d(0, ${scrollY * 0.7}px, 0)` }}
        />
        <div 
          className="absolute top-[60%] right-[10%] w-2 h-2 bg-accent/40 rounded-full"
          style={{ transform: `translate3d(0, ${scrollY * 0.5}px, 0)` }}
        />
      </div>

      {/* Content with subtle parallax */}
      <div 
        className="container relative z-10 mx-auto px-4 sm:px-6 py-20 sm:py-28 md:py-32 text-center"
        style={{ transform: `translate3d(0, ${scrollY * 0.15}px, 0)` }}
      >
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

        {/* AI Command Demo with Typing Animation */}
        <figure 
          className={`max-w-2xl mx-auto mb-8 sm:mb-12 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-card/80 border border-border backdrop-blur-md shadow-card card-interactive transition-all duration-700 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
        >
          <div className="flex items-center gap-2 mb-3 sm:mb-4" aria-hidden="true">
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-destructive animate-pulse" />
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-yellow-500 animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500 animate-pulse" style={{ animationDelay: "0.4s" }} />
            <span className="ml-2 text-xs text-muted-foreground/60 font-mono">salesos-terminal</span>
          </div>
          <figcaption className="sr-only">AI Command Demo showing how SalesOS processes a lead generation request</figcaption>
          <div className="text-left font-mono text-xs sm:text-sm">
            <div className="flex items-start gap-1">
              <span className="text-primary shrink-0" aria-hidden="true">→</span>
              <span className="text-foreground">
                "{displayText}"
                {!isComplete && (
                  <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse" />
                )}
              </span>
            </div>
            
            {isComplete && (
              <div className="mt-3 space-y-1.5" role="status" aria-label="AI processing results">
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showResults[0] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <span className="text-green-400 animate-bounce" style={{ animationDuration: '0.5s', animationIterationCount: '1' }}>✓</span>
                  <span className="text-muted-foreground">Found <span className="text-primary font-semibold">127</span> qualified leads</span>
                </div>
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showResults[1] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <span className="text-green-400">✓</span>
                  <span className="text-muted-foreground">Personalized outreach generated</span>
                </div>
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showResults[2] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <span className="text-green-400">✓</span>
                  <span className="text-muted-foreground">Sequences scheduled for optimal send times</span>
                </div>
              </div>
            )}
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
          <strong>Trusted by 50+ beta testers</strong> • <span className="text-primary">94% would recommend</span>
        </p>
      </div>

      {/* Bottom gradient fade for smooth transition */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none"
        style={{ transform: `translate3d(0, ${scrollY * 0.1}px, 0)` }}
      />
    </section>
  );
};
