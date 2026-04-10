import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const rows = [
  {
    legacy: "1,000 raw contacts and a spreadsheet",
    truth: "Ranked prospects scored by ICP fit",
  },
  {
    legacy: "Boolean search that takes 45 minutes to configure",
    truth: "Plain English. Leads in under 2 minutes.",
  },
  {
    legacy: "A data tool that stops at the export",
    truth: "From search to sent email in one workflow",
  },
  {
    legacy: "$500/mo for data you still have to manually qualify",
    truth: "Scoring, enrichment, and outreach included",
  },
];

export const DifferentiationSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="differentiation-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(0 0% 100% / 0.06)" }} />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-3xl mx-auto">
          {/* Section label */}
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50 mb-8">
            Why not Apollo?
          </p>

          {/* Headline */}
          <h2
            id="differentiation-heading"
            className={`font-display mb-14 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{
              fontSize: "clamp(2.4rem, 5vw, 4rem)",
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
            }}
          >
            Apollo sells you contacts.
            <br />
            <span className="italic" style={{ color: "hsl(0 0% 55%)" }}>
              We show you who to call next.
            </span>
          </h2>

          {/* Comparison rows */}
          <div className="flex flex-col">
            {rows.map((row, index) => (
              <div
                key={index}
                className={`flex items-center gap-6 py-5 border-b border-border/10 transition-all duration-700 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-3"
                }`}
                style={{ transitionDelay: `${index * 80 + 200}ms` }}
              >
                {/* Legacy / crossed-out side */}
                <span className="flex-1 text-sm text-muted-foreground/40 line-through leading-relaxed">
                  {row.legacy}
                </span>

                {/* Arrow */}
                <ArrowRight
                  className="flex-shrink-0 w-4 h-4 text-muted-foreground/30"
                  aria-hidden="true"
                />

                {/* SalesOS truth */}
                <span className="flex-1 text-sm text-foreground font-medium leading-relaxed">
                  {row.truth}
                </span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div
            className={`mt-12 flex flex-col items-start gap-3 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "500ms" }}
          >
            <Button
              variant="outline"
              size="lg"
              onClick={() => navigate("/pricing")}
              className="group"
            >
              See how it stacks up
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground/50">
              No credit card · Cancel anytime
            </p>
          </div>
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(0 0% 100% / 0.06)" }} />
    </section>
  );
};
