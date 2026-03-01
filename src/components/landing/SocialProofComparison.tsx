import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const transformations = [
  {
    before: "Hours toggling between tools",
    after: "3x faster lead-to-outreach time",
  },
  {
    before: "Manual follow-up tracking",
    after: "Automated sequences with real-time signals",
  },
  {
    before: "Generic batch emails",
    after: "AI-personalized outreach, 2–4x higher reply rates",
  },
  {
    before: "Scattered pipeline data",
    after: "Single dashboard with deal intelligence",
  },
  {
    before: "Guesswork on lead quality",
    after: "AI scoring with 85%+ fit accuracy",
  },
];

export const SocialProofComparison = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-20 md:py-28 overflow-hidden"
      aria-labelledby="social-proof-comparison-heading"
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(261 75% 50% / 0.05) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Top hairline */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div
            className={`text-center mb-14 scroll-reveal ${isVisible ? "visible" : ""}`}
          >
            <h2
              id="social-proof-comparison-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
            >
              What Changes When You Switch
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Teams that consolidate onto SalesOS see measurable improvements
              across their entire sales operation.
            </p>
          </div>

          {/* Column headers */}
          <div className="hidden md:grid md:grid-cols-2 gap-6 mb-4 px-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
              Before
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary/80">
              With SalesOS
            </span>
          </div>

          {/* Transformation rows */}
          <div className="space-y-3">
            {transformations.map((row, index) => (
              <div
                key={index}
                className={`grid md:grid-cols-2 gap-3 md:gap-6 scroll-reveal ${isVisible ? "visible" : ""}`}
                style={
                  { "--reveal-delay": `${index * 80}ms` } as React.CSSProperties
                }
              >
                {/* Before */}
                <div className="rounded-xl border border-border/30 bg-card/30 px-5 py-4 text-sm text-muted-foreground/70 flex items-center">
                  <span className="md:hidden text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 mr-3 shrink-0">
                    Before
                  </span>
                  {row.before}
                </div>

                {/* After */}
                <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-5 py-4 text-sm text-foreground font-medium flex items-center">
                  <span className="md:hidden text-[10px] font-semibold uppercase tracking-widest text-primary/60 mr-3 shrink-0">
                    After
                  </span>
                  {row.after}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div
            className={`mt-12 text-center scroll-reveal ${isVisible ? "visible" : ""}`}
            style={{ "--reveal-delay": "500ms" } as React.CSSProperties}
          >
            <p className="text-sm text-muted-foreground mb-4">
              Join 500+ sales teams already using SalesOS
            </p>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate("/auth")}
              className="group"
            >
              Start free trial
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
