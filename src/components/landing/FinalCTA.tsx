import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const FinalCTA = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-40 md:py-52 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="final-cta-heading"
    >
      {/* Radial glow — strong purple */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(261 75% 50% / 0.14) 0%, hsl(280 70% 55% / 0.06) 40%, transparent 65%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />

      {/* Top hairline — purple */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />

      <div className="container relative z-10 mx-auto px-6">
        <div
          className={`flex flex-col items-center text-center transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Label */}
          <p
            className="text-[10px] uppercase tracking-[0.28em] mb-8 font-medium"
            style={{ color: "hsl(261 75% 60%)" }}
          >
            Your next pipeline starts here
          </p>

          {/* Headline — Playfair Display */}
          <h2
            id="final-cta-heading"
            className="font-display mb-6"
            style={{
              fontSize: "clamp(3rem, 8vw, 7rem)",
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 96%)",
            }}
          >
            <span className="block">Stop researching.</span>
            <span
              className="block italic"
              style={{
                background:
                  "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Start conversations.
            </span>
          </h2>

          {/* Sub */}
          <p
            className={`text-lg font-light max-w-md mx-auto mb-12 transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ color: "hsl(0 0% 100% / 0.35)" }}
          >
            Your first qualified prospect, verified email, and draft ready in under 2 minutes. Free to start.
          </p>

          {/* CTA button */}
          <div
            className={`transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <button
              onClick={() => navigate("/auth")}
              className="cta-pill-glow inline-flex items-center gap-2 px-10 rounded-full text-sm font-semibold text-white group"
              style={{
                height: "56px",
                background:
                  "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
              }}
              aria-label="Find my first leads free"
            >
              Find my first leads — free
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
            </button>

            <p
              className="mt-4 text-xs"
              style={{ color: "hsl(0 0% 100% / 0.2)" }}
            >
              No credit card required · Cancel anytime · 30-day money-back
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
