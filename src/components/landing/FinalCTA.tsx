import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
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
      className="relative overflow-hidden py-36 sm:py-52"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="final-cta-heading"
    >
      {/* Single warm sunrise wash at the base */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 100%, hsl(14 75% 75% / 0.45) 0%, hsl(30 75% 85% / 0.2) 40%, transparent 75%)",
        }}
        aria-hidden="true"
      />

      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div
          className={`flex flex-col items-center text-center transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="mb-10 flex items-center gap-3">
            <span className="hairline w-10" />
            <span className="eyebrow">Ready when you are</span>
            <span className="hairline w-10" />
          </div>

          <h2
            id="final-cta-heading"
            className="font-display mb-8 max-w-[14ch]"
            style={{
              fontSize: "clamp(2.6rem, 7vw, 5.5rem)",
              fontWeight: 400,
              lineHeight: 1.03,
              letterSpacing: "-0.028em",
              color: "hsl(28 10% 14%)",
            }}
          >
            Every day you wait,{" "}
            <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>
              your competitor doesn't.
            </span>
          </h2>

          <p
            className={`mx-auto mb-12 max-w-md text-[17px] leading-[1.6] transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{ color: "hsl(28 6% 38%)" }}
          >
            See who's worth emailing in under two minutes. No list. No guesswork.
          </p>

          <div
            className={`flex flex-col items-center gap-5 transition-all duration-700 delay-200 sm:flex-row sm:gap-6 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <button
              onClick={() => navigate("/auth")}
              className="cta-pill-glow inline-flex h-14 items-center gap-2 rounded-full px-10 text-[15px] font-semibold group"
              aria-label="Start for free"
            >
              Start for free
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>

            <a
              href="/pricing"
              className="cta-ghost inline-flex items-center gap-1.5 text-[15px] font-medium"
            >
              See plans
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <p
            className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em]"
            style={{ color: "hsl(28 6% 48%)" }}
          >
            No credit card · Plans from $39/mo · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};
