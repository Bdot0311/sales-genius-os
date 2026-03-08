import { useEffect, useRef, useState } from "react";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const stats = [
  {
    metric: "5+",
    label: "Tools replaced",
    description: "Stop toggling between lead databases, email tools, CRMs, and spreadsheets. One platform handles the full workflow.",
    icon: "🚀",
  },
  {
    metric: "AI",
    label: "Personalized outreach",
    description: "Every email is crafted from enriched lead profiles, not generic templates. Personalization at scale, without the effort.",
    icon: "📈",
  },
  {
    metric: "ICP",
    label: "Fit scoring built in",
    description: "Every lead scored against your ideal customer profile. Know exactly who deserves your attention first.",
    icon: "🎯",
  },
  {
    metric: "1",
    label: "Dashboard for everything",
    description: "Pipeline, outreach, analytics, and lead management, consolidated into one clean workspace.",
    icon: "⚡",
  },
];

// Animated counter
const AnimatedMetric = ({ value, isVisible }: { value: string; isVisible: boolean }) => {
  const [displayed, setDisplayed] = useState("0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!isVisible || hasAnimated.current) return;
    hasAnimated.current = true;

    const numMatch = value.match(/(\d+)/);
    if (!numMatch) { setDisplayed(value); return; }
    
    const target = parseInt(numMatch[1]);
    const prefix = value.slice(0, value.indexOf(numMatch[1]));
    const suffix = value.slice(value.indexOf(numMatch[1]) + numMatch[1].length);
    
    const duration = 1200;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplayed(`${prefix}${Math.floor(ease * target)}${suffix}`);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [isVisible, value]);

  return <span>{displayed}</span>;
};

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
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)",
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              <TrendingUp className="w-3 h-3" />
              Why SalesOS
            </div>
            <h2
              id="social-proof-comparison-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
            >
              What Changes When You Switch
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SalesOS consolidates your entire outbound workflow into one system so you can focus on selling, not managing tools.
            </p>
          </div>

          {/* Stat cards grid */}
          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            {stats.map((stat, index) => (
              <div
                key={index}
                className={`group relative rounded-2xl border border-border/30 bg-card/40 p-6 sm:p-8 overflow-hidden card-hover-lift scroll-reveal ${isVisible ? "visible" : ""}`}
                style={
                  { "--reveal-delay": `${index * 100}ms` } as React.CSSProperties
                }
              >
                {/* Spotlight hover */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />

                <div className="relative z-10">
                  {/* Emoji accent */}
                  <div className="text-2xl mb-3">{stat.icon}</div>
                  
                  {/* Big metric with gradient */}
                  <div className="mb-3">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight gradient-number">
                      <AnimatedMetric value={stat.metric} isVisible={isVisible} />
                    </span>
                  </div>

                  {/* Label */}
                  <h3 className="text-base font-semibold mb-2 group-hover:text-primary transition-colors duration-200">
                    {stat.label}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stat.description}
                  </p>
                </div>

                {/* Subtle accent border on hover */}
                <div className="absolute inset-0 rounded-2xl border border-primary/0 group-hover:border-primary/20 transition-colors duration-300 pointer-events-none" />
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div
            className={`mt-12 text-center scroll-reveal ${isVisible ? "visible" : ""}`}
            style={{ "--reveal-delay": "500ms" } as React.CSSProperties}
          >
            <p className="text-sm text-muted-foreground mb-4">
              Free to start. No credit card required.
            </p>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate("/auth")}
              className="group"
            >
              Start for free
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