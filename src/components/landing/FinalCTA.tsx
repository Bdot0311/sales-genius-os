import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const FinalCTA = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
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
      className="relative py-32 md:py-40 overflow-hidden"
      aria-labelledby="final-cta-heading"
    >
      {/* Radial glow blob */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none blur-3xl"
        style={{
          background:
            "radial-gradient(circle, hsl(261 75% 50% / 0.05) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div
          className={`flex flex-col items-center text-center scroll-reveal ${isVisible ? "visible" : ""}`}
        >
          {/* Label */}
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/50 mb-6">
            READY WHEN YOU ARE
          </p>

          {/* Headline */}
          <h2
            id="final-cta-heading"
            className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight"
          >
            Your next customer
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
              is already out there.
            </span>
          </h2>

          {/* Subheadline */}
          <p className="text-xl font-light text-muted-foreground text-center max-w-xl mx-auto mt-4">
            Stop researching. Start selling.
          </p>

          {/* CTA */}
          <Button
            size="lg"
            className="mt-10 h-14 px-10 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl group shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-1 transition-all duration-300"
            onClick={() => navigate("/auth")}
          >
            <span>Start for free</span>
            <ArrowRight
              className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform duration-200"
              aria-hidden="true"
            />
          </Button>

          {/* Trust line */}
          <p className="mt-4 text-xs text-muted-foreground/50">
            No credit card required · Plans from $39/mo · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};
