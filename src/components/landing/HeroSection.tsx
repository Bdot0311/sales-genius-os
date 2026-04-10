import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, lazy, Suspense } from "react";

// Lazy-load the heavy DashboardMockup to reduce critical JS bundle
const DashboardMockup = lazy(() => import("@/components/landing/DashboardMockup"));

export const HeroSection = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [mockupHovered, setMockupHovered] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex flex-col items-center justify-center overflow-hidden pt-32 pb-0 text-center"
      aria-labelledby="hero-heading"
    >
      {/* Background layers */}
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-30" aria-hidden="true" />

      {/* Centered radial glow blob behind headline */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.12) 0%, hsl(261 75% 55% / 0.04) 45%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Slow gradient sweep */}
      <div
        className="absolute inset-0 pointer-events-none animate-hero-sweep"
        aria-hidden="true"
      />
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="flex flex-col items-center max-w-[860px] mx-auto">

          {/* Announcement pill */}
          <div
            className={`mb-8 transition-all duration-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/40 bg-muted/30 text-xs text-muted-foreground">
              {/* Pulsing green dot */}
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              </span>
              <span className="font-medium text-foreground">New</span>
              <span className="text-muted-foreground/60">·</span>
              Signal-based lead scoring is live
            </span>
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className={`text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold mb-6 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ letterSpacing: "-0.04em", lineHeight: 1.05 }}
          >
            Find who to sell to.
            <br />
            <span
              className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
            >
              Then actually sell to them.
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className={`text-lg sm:text-xl font-light text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-150 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            SalesOS scores your best-fit prospects, enriches them with verified contact data, and drafts your first email — before you finish your coffee.
          </p>

          {/* CTA row */}
          <div
            className={`flex flex-col sm:flex-row items-center gap-4 mb-6 transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            <Button
              size="lg"
              className="h-12 px-7 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-0.5 transition-all duration-200 group"
              onClick={() => navigate("/auth")}
              aria-label="Start for free"
            >
              Start for free
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
            </Button>

            <button
              className="inline-flex items-center gap-2 h-12 px-4 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 group"
              onClick={() => navigate("/demo")}
            >
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
              <span className="relative">
                Watch a 2-min demo
                <span className="absolute left-0 -bottom-px w-0 h-px bg-current group-hover:w-full transition-all duration-300" />
              </span>
            </button>
          </div>

          {/* Trust line */}
          <p
            className={`text-xs text-muted-foreground/60 mb-16 flex items-center justify-center gap-2 transition-all duration-700 delay-[250ms] ${isVisible ? "opacity-100" : "opacity-0"}`}
          >
            No credit card required
            <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40 inline-block" />
            30-day guarantee
            <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/40 inline-block" />
            Setup in 2 minutes
          </p>

          {/* Product mockup — full width, perspective tilt */}
          <div
            className={`w-full transition-all duration-700 delay-[350ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            onMouseEnter={() => setMockupHovered(true)}
            onMouseLeave={() => setMockupHovered(false)}
          >
            <div
              className="relative w-full ring-1 ring-white/10 rounded-xl overflow-hidden shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)]"
              style={{
                transform: mockupHovered
                  ? "perspective(1000px) rotateX(0deg)"
                  : "perspective(1000px) rotateX(8deg)",
                transition: "transform 0.4s ease",
                transformOrigin: "center bottom",
              }}
            >
              <Suspense
                fallback={
                  <div className="rounded-xl border border-border/30 bg-card/90 backdrop-blur-sm overflow-hidden aspect-[16/9]" />
                }
              >
                <DashboardMockup />
              </Suspense>

              {/* Bottom fade overlay */}
              <div
                className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none"
                aria-hidden="true"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
