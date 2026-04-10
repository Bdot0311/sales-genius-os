import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Clock, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef, lazy, Suspense } from "react";

// Lazy-load the heavy DashboardMockup to reduce critical JS bundle
const DashboardMockup = lazy(() => import("@/components/landing/DashboardMockup"));

export const HeroSection = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative flex items-center justify-center overflow-hidden pt-24 sm:pt-28 lg:pt-28 pb-4 sm:pb-6 lg:pb-6"
      aria-labelledby="hero-heading"
    >
      {/* Background layers */}
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-30" aria-hidden="true" />
      <div className="absolute top-1/3 left-1/2 w-[800px] h-[600px] aurora-ambient pointer-events-none" aria-hidden="true" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.06) 0%, transparent 60%)" }}
        aria-hidden="true"
      />
      {/* Slow gradient sweep */}
      <div
        className="absolute inset-0 pointer-events-none animate-hero-sweep"
        aria-hidden="true"
      />
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-[1120px] mx-auto">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">

            {/* Headline */}
            <h1
              id="hero-heading"
              className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight mb-4 leading-[1.12]"
            >
              Find qualified B2B leads with{" "}
              <span
                className="relative inline-block text-[1.08em] bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent"
                style={{
                  filter: "drop-shadow(0 0 20px hsl(261 75% 65% / 0.35))",
                }}
              >
                plain-English search.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className="hero-description text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed"
            >
              Tell SalesOS who you want to reach. It finds best-fit prospects, enriches them with verified contact and company data, and helps you launch personalized outreach in minutes.
            </p>

            {/* CTAs */}
            <div
              className={`flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-3 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              <div className="animated-border inline-block rounded-xl">
                <Button
                  size="lg"
                  className="h-14 px-8 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-[calc(1rem-1px)] group shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => navigate("/auth")}
                  aria-label="Start for free"
                >
                  Get your first 10 leads free
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" />
                </Button>
              </div>
              <button
                className="h-14 px-6 text-base text-muted-foreground hover:text-foreground transition-colors duration-200 relative group inline-flex items-center justify-center gap-2"
                onClick={() => { window.location.href = "/demo?build=de834a3-debug"; }}
              >
                <Play className="w-4 h-4 fill-current" />
                <span className="relative">
                  See how it works
                  <span className="absolute left-0 -bottom-0.5 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                </span>
              </button>
            </div>

            {/* Trust strip */}
            <div
              className={`transition-all duration-700 delay-[400ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="flex flex-wrap justify-center lg:justify-start gap-x-6 gap-y-2 mb-2">
                {[
                  "MX-verified before every send",
                  "30-day money-back guarantee",
                  "No credit card required on free plan",
                  "SOC 2 compliant",
                ].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                    {label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-center lg:text-left text-muted-foreground/70 max-w-lg mx-auto lg:mx-0 mb-4">
                Prospect data verified in real time — bounce rates under 5% guaranteed or credits refunded.
              </p>
            </div>

            {/* Social proof signal — visible without scrolling */}
            <div
              className={`flex flex-col gap-2 text-center lg:text-left transition-all duration-700 delay-[350ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-muted-foreground/60">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary">
                  <Clock className="w-3 h-3" />
                  First qualified lead in under 2 minutes
                </span>
                <span>No boolean gymnastics</span>
                <span className="hidden sm:inline w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span>Verified contact data</span>
                <span className="hidden sm:inline w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span>Personalized outreach</span>
              </div>
            </div>
          </div>

          {/* Right: Dashboard mockup - lazy loaded to reduce critical JS */}
          <div
            className={`w-full max-w-[560px] lg:max-w-none mx-auto transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          >
            <Suspense fallback={
              <div className="rounded-xl border border-border/30 bg-card/90 backdrop-blur-sm overflow-hidden shadow-2xl shadow-primary/5 aspect-[4/3]" />
            }>
              <DashboardMockup />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none" aria-hidden="true" />
    </section>
  );
};
