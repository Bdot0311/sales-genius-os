import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import salesosLogo from "@/assets/salesos-logo.webp";
import { Sparkles, Zap, Shield, Users, ArrowRight, Rocket } from "lucide-react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const LAUNCH_DATE = new Date("2026-01-01T08:00:00-05:00");

const Waitlist = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeFeature, setActiveFeature] = useState(0);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchPhase, setLaunchPhase] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if launch date has passed
  useEffect(() => {
    const checkLaunchDate = () => {
      const now = new Date();
      if (now >= LAUNCH_DATE) {
        triggerLaunchSequence();
      }
    };

    // Check immediately
    checkLaunchDate();

    // Also check every second in case the user is viewing the page at launch time
    const interval = setInterval(checkLaunchDate, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerLaunchSequence = () => {
    if (isLaunching) return;
    setIsLaunching(true);

    // Phase 1: Flash effect (0-500ms)
    setLaunchPhase(1);
    
    // Phase 2: Zoom and dissolve (500-1500ms)
    setTimeout(() => setLaunchPhase(2), 500);
    
    // Phase 3: Final fade out (1500-2500ms)
    setTimeout(() => setLaunchPhase(3), 1500);
    
    // Navigate to home after animation completes
    setTimeout(() => {
      navigate("/home");
    }, 2500);
  };

  // Fetch waitlist count
  useEffect(() => {
    const fetchCount = async () => {
      const { data, error } = await supabase.rpc('get_waitlist_count');
      if (!error && data !== null) {
        setWaitlistCount(data);
      }
    };
    fetchCount();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('waitlist-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'waitlist_signups' },
        () => {
          setWaitlistCount(prev => (prev !== null ? prev + 1 : 1));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Track mouse for parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMousePosition({
          x: (e.clientX - rect.left - rect.width / 2) / 50,
          y: (e.clientY - rect.top - rect.height / 2) / 50,
        });
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Rotate features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const calculateTimeLeft = useCallback(() => {
    const now = new Date();
    const difference = LAUNCH_DATE.getTime() - now.getTime();

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateTimeLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase
        .from('waitlist_signups')
        .insert({ email, source: 'waitlist_page' });

      if (error) {
        if (error.code === '23505') {
          toast.success("You're already on the list! We'll notify you at launch.");
        } else {
          throw error;
        }
      } else {
        toast.success("🎉 You're on the list! Check your email for confirmation.");
        
        // Send confirmation email with source and count for admin notification
        supabase.functions.invoke('send-waitlist-confirmation', {
          body: { 
            email, 
            source: 'waitlist_page',
            waitlistCount: (waitlistCount || 0) + 1
          }
        }).catch(err => console.error('Failed to send confirmation email:', err));
      }
      
      setIsSubmitted(true);
      setEmail("");
    } catch (error) {
      console.error('Waitlist signup error:', error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatNumber = (num: number) => String(num).padStart(2, "0");

  const features = [
    { icon: Zap, title: "AI-Powered Leads", desc: "Find perfect-fit prospects instantly" },
    { icon: Sparkles, title: "Smart Automation", desc: "Workflows that work while you sleep" },
    { icon: Shield, title: "Enterprise Security", desc: "Bank-grade protection for your data" },
    { icon: Users, title: "Team Collaboration", desc: "Built for modern sales teams" },
  ];

  // Launch sequence overlay
  if (isLaunching) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center"
        style={{
          background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(261 75% 20% / 0.4), transparent), hsl(0 0% 4%)",
        }}
      >
        {/* Phase 1: Bright flash */}
        <div 
          className={`absolute inset-0 bg-white transition-opacity duration-500 ${
            launchPhase >= 1 ? "opacity-100" : "opacity-0"
          } ${launchPhase >= 2 ? "opacity-0" : ""}`}
          style={{ transitionDuration: launchPhase >= 2 ? "1000ms" : "300ms" }}
        />

        {/* Phase 2 & 3: Content dissolve with particles */}
        <div 
          className={`relative z-10 text-center transition-all ${
            launchPhase >= 2 ? "scale-150 opacity-0 blur-xl" : "scale-100 opacity-100 blur-0"
          }`}
          style={{ 
            transitionDuration: "1500ms",
            transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)"
          }}
        >
          {/* Rocket icon */}
          <div className={`mb-6 transition-transform duration-1000 ${
            launchPhase >= 1 ? "translate-y-[-100vh]" : "translate-y-0"
          }`}
            style={{ transitionDelay: "200ms" }}
          >
            <Rocket className="w-24 h-24 mx-auto text-primary animate-pulse" />
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-bold text-foreground mb-4">
            🚀 We're Live!
          </h1>
          <p className="text-xl text-muted-foreground">
            Welcome to the future of sales...
          </p>
        </div>

        {/* Particle explosion effect */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          launchPhase >= 2 ? "opacity-100" : "opacity-0"
        }`}>
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-primary"
              style={{
                left: "50%",
                top: "50%",
                transform: launchPhase >= 2 
                  ? `translate(${(Math.random() - 0.5) * 200}vw, ${(Math.random() - 0.5) * 200}vh) scale(${Math.random() * 2})` 
                  : "translate(-50%, -50%) scale(1)",
                opacity: launchPhase >= 3 ? 0 : 1,
                transition: `all ${1000 + Math.random() * 500}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                transitionDelay: `${Math.random() * 200}ms`,
                backgroundColor: `hsl(${260 + Math.random() * 60} 75% ${50 + Math.random() * 30}%)`,
              }}
            />
          ))}
        </div>

        {/* Radial wipe effect */}
        <div 
          className={`absolute inset-0 transition-all duration-1000 ${
            launchPhase >= 3 ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background: "radial-gradient(circle at center, transparent 0%, hsl(0 0% 4%) 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(261 75% 20% / 0.4), transparent), hsl(0 0% 4%)",
      }}
    >
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute w-[800px] h-[800px] rounded-full opacity-30 blur-[120px]"
          style={{
            background: "radial-gradient(circle, hsl(261 75% 50%), transparent 70%)",
            left: `calc(30% + ${mousePosition.x * 2}px)`,
            top: `calc(20% + ${mousePosition.y * 2}px)`,
            transition: "left 0.3s ease-out, top 0.3s ease-out",
          }}
        />
        <div 
          className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-[100px]"
          style={{
            background: "radial-gradient(circle, hsl(280 75% 60%), transparent 70%)",
            right: `calc(20% + ${-mousePosition.x * 1.5}px)`,
            bottom: `calc(30% + ${-mousePosition.y * 1.5}px)`,
            transition: "right 0.3s ease-out, bottom 0.3s ease-out",
          }}
        />
        <div 
          className="absolute w-[400px] h-[400px] rounded-full opacity-15 blur-[80px]"
          style={{
            background: "radial-gradient(circle, hsl(320 75% 50%), transparent 70%)",
            left: `calc(60% + ${mousePosition.x}px)`,
            top: `calc(60% + ${mousePosition.y}px)`,
            transition: "left 0.3s ease-out, top 0.3s ease-out",
          }}
        />
      </div>

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(261 75% 65% / 0.3) 1px, transparent 1px),
            linear-gradient(90deg, hsl(261 75% 65% / 0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Subtle ambient glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col">
        {/* Header */}
        <header className="py-6 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-primary/30 p-1.5">
                <img src={salesosLogo} alt="SalesOS" className="w-full h-full object-contain" />
              </div>
              <span className="text-xl font-bold text-foreground">SalesOS</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span>
                {waitlistCount !== null && waitlistCount > 0 
                  ? `${waitlistCount.toLocaleString()} joined` 
                  : 'Launching Soon'}
              </span>
            </div>
          </div>
        </header>

        {/* Hero section */}
        <main className="flex flex-col items-center justify-center px-6 py-12">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8 animate-fade-in">
              <Sparkles className="w-4 h-4" />
              <span>Coming January 2026</span>
            </div>

            {/* Main headline with animated gradient */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight leading-[0.9]">
              <span className="text-foreground">The Future of</span>
              <br />
              <span className="text-gradient-animated">Sales is Here.</span>
            </h1>

            <p className="text-xl sm:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              An AI-powered sales operating system that turns your team into a revenue machine.
            </p>

            {/* Countdown timer */}
            <div className="mb-12">
              <p className="text-xs text-muted-foreground uppercase tracking-[0.3em] mb-6 font-medium">Launching In</p>
              <div className="flex items-center justify-center gap-2 sm:gap-4">
                {[
                  { value: timeLeft.days, label: "Days" },
                  { value: timeLeft.hours, label: "Hours" },
                  { value: timeLeft.minutes, label: "Mins" },
                  { value: timeLeft.seconds, label: "Secs" },
                ].map((item, index) => (
                  <div key={item.label} className="flex items-center gap-2 sm:gap-4">
                    <div className="relative group">
                      {/* Glow effect */}
                      <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 to-purple-600/40 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl px-4 sm:px-6 py-4 sm:py-6 min-w-[70px] sm:min-w-[100px] overflow-hidden">
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                        
                        <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tabular-nums block">
                          {formatNumber(item.value)}
                        </span>
                        <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mt-2">{item.label}</p>
                      </div>
                    </div>
                    {index < 3 && (
                      <span className="text-2xl sm:text-3xl text-muted-foreground/50 font-light animate-pulse">:</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Email form */}
            <form onSubmit={handleSubmit} className="w-full max-w-lg mx-auto mb-8">
              <div className="relative group">
                {/* Outer glow */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary via-purple-500 to-pink-500 rounded-2xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-500" />
                
                <div className="relative flex flex-col sm:flex-row gap-3 bg-card/90 backdrop-blur-xl border border-border/50 rounded-2xl p-2">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 bg-transparent border-0 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 h-14 text-lg px-4"
                    disabled={isSubmitting || isSubmitted}
                  />
                  <Button
                    type="submit"
                    disabled={isSubmitting || isSubmitted}
                    size="lg"
                    className="h-14 px-8 bg-gradient-to-r from-primary via-purple-500 to-pink-500 hover:opacity-90 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98] group"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Joining...
                      </span>
                    ) : isSubmitted ? (
                      <span className="flex items-center gap-2">
                        You're In! <Sparkles className="w-5 h-5" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Get Early Access
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </form>

            <p className="text-sm text-muted-foreground mb-12">
              🔒 No spam, ever. Unsubscribe anytime.
            </p>

            {/* Rotating features */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto mb-16">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-xl border transition-all duration-500 ${
                    activeFeature === index
                      ? "bg-primary/10 border-primary/30 scale-105"
                      : "bg-card/50 border-border/30 opacity-60"
                  }`}
                >
                  <feature.icon className={`w-6 h-6 mx-auto mb-2 transition-colors duration-500 ${
                    activeFeature === index ? "text-primary" : "text-muted-foreground"
                  }`} />
                  <p className="text-sm font-medium text-foreground">{feature.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{feature.desc}</p>
                </div>
              ))}
            </div>

            {/* Social proof & benefits */}
            <div className="max-w-4xl mx-auto">
              {/* Early access benefits */}
              <div className="bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-primary/20 rounded-2xl p-8 mb-8">
                <h3 className="text-xl font-bold text-foreground mb-4">🎁 Early Access Benefits</h3>
                <div className="grid sm:grid-cols-3 gap-4 text-left">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary text-sm">✓</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">50% Lifetime Discount</p>
                      <p className="text-xs text-muted-foreground">Lock in founder pricing forever</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary text-sm">✓</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Priority Onboarding</p>
                      <p className="text-xs text-muted-foreground">1-on-1 setup with our team</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-primary text-sm">✓</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Shape the Product</p>
                      <p className="text-xs text-muted-foreground">Direct input on features</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <span>SOC 2 Compliant</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  <span>99.9% Uptime SLA</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Built for Teams of All Sizes</span>
                </div>
              </div>

            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-8 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
};

export default Waitlist;