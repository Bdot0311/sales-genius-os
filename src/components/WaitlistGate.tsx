import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

interface WaitlistGateProps {
  onLaunch: () => void;
}

const LAUNCH_DATE = new Date("2026-01-01T08:00:00-05:00"); // Jan 1, 2026 8:00 AM EST

const WaitlistGate = ({ onLaunch }: WaitlistGateProps) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isLaunching, setIsLaunching] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; delay: number }>>([]);

  // Generate floating particles
  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
  }, []);

  const calculateTimeLeft = useCallback(() => {
    const now = new Date();
    const difference = LAUNCH_DATE.getTime() - now.getTime();

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, launched: true };
    }

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
      launched: false,
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const time = calculateTimeLeft();
      setTimeLeft(time);

      if (time.launched && !isLaunching) {
        setIsLaunching(true);
        setTimeout(() => {
          onLaunch();
        }, 2500);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [calculateTimeLeft, isLaunching, onLaunch]);

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
        .insert({ email, source: 'landing_page' });

      if (error) {
        if (error.code === '23505') {
          // Duplicate email - still show success to avoid revealing if email exists
          toast.success("You're on the list! We'll notify you at launch.");
        } else {
          throw error;
        }
      } else {
        toast.success("You're on the list! We'll notify you at launch.");
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

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden transition-all duration-1000 ${
        isLaunching ? "opacity-0 scale-110 blur-xl" : "opacity-100 scale-100 blur-0"
      }`}
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 50%, #0a0a0f 100%)",
      }}
    >
      {/* Animated Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
            animation: "gridMove 20s linear infinite",
          }}
        />
      </div>

      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 rounded-full bg-primary/40"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animation: `floatParticle 8s ease-in-out infinite`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Gradient Orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-purple-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[150px]" />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-6 text-center max-w-3xl mx-auto">
        {/* Logo Mark */}
        <div className="mb-8 relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-primary/30">
            <span className="text-2xl font-bold text-white">S</span>
          </div>
          <div className="absolute -inset-2 bg-gradient-to-r from-primary to-purple-600 rounded-3xl blur-xl opacity-30 animate-pulse" />
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight">
          <span className="bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            SalesOS Is Almost Online.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-gray-400 mb-12 max-w-xl leading-relaxed">
          An AI-powered sales operating system built for modern teams.
        </p>

        {/* Countdown Timer */}
        <div className="mb-12">
          <p className="text-sm text-gray-500 uppercase tracking-widest mb-4 font-medium">Launching In</p>
          <div className="flex items-center gap-3 sm:gap-4">
            {[
              { value: timeLeft.days, label: "Days" },
              { value: timeLeft.hours, label: "Hours" },
              { value: timeLeft.minutes, label: "Mins" },
              { value: timeLeft.seconds, label: "Secs" },
            ].map((item, index) => (
              <div key={item.label} className="flex items-center gap-3 sm:gap-4">
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-purple-600/50 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity" />
                  <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 sm:px-6 py-4 sm:py-5 min-w-[70px] sm:min-w-[90px]">
                    <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tabular-nums">
                      {formatNumber(item.value)}
                    </span>
                    <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mt-1">{item.label}</p>
                  </div>
                </div>
                {index < 3 && (
                  <span className="text-2xl sm:text-3xl text-gray-600 font-light">:</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Waitlist Form */}
        <form onSubmit={handleSubmit} className="w-full max-w-md mb-6">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-blue-500 to-purple-600 rounded-2xl blur opacity-30 group-hover:opacity-50 transition-opacity" />
            <div className="relative flex flex-col sm:flex-row gap-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-2">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 bg-transparent border-0 text-white placeholder:text-gray-500 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 text-base"
                disabled={isSubmitting || isSubmitted}
              />
              <Button
                type="submit"
                disabled={isSubmitting || isSubmitted}
                className="h-12 px-6 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 text-white font-medium rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-primary/25 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </span>
                ) : isSubmitted ? (
                  "You're In! ✓"
                ) : (
                  "Join the Waitlist"
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Micro-text */}
        <p className="text-sm text-gray-600">
          Early access. No spam.
        </p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 left-0 right-0 text-center space-y-3">
        <button
          onClick={onLaunch}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors underline underline-offset-2 opacity-50 hover:opacity-100"
        >
          Skip for testing →
        </button>
        <p className="text-sm text-gray-600">© SalesOS</p>
      </div>

      {/* Launch Transition Particles */}
      {isLaunching && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: 100 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-primary rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `disintegrate 2s ease-out forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes gridMove {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        
        @keyframes floatParticle {
          0%, 100% { 
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          50% { 
            transform: translateY(-30px) translateX(10px);
            opacity: 0.8;
          }
        }
        
        @keyframes disintegrate {
          0% {
            opacity: 1;
            transform: scale(1) translate(0, 0);
          }
          100% {
            opacity: 0;
            transform: scale(0) translate(${Math.random() > 0.5 ? '' : '-'}${Math.random() * 200}px, ${Math.random() > 0.5 ? '' : '-'}${Math.random() * 200}px);
          }
        }
      `}</style>
    </div>
  );
};

export default WaitlistGate;
