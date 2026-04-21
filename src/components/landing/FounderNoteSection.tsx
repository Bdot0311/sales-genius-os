import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

export const FounderNoteSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-28 sm:py-40"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="founder-note-heading"
    >
      <div className="absolute top-0 left-0 right-0 hairline" />

      {/* Soft warm wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(14 75% 82% / 0.25) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Eyebrow */}
          <div
            className={`mb-10 flex items-center gap-3 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <span className="eyebrow">A letter</span>
            <span className="hairline w-16" />
            <span className="eyebrow-muted">From the founder</span>
          </div>

          {/* Giant opening quotation mark */}
          <div
            className={`select-none font-display transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{
              fontSize: "clamp(4rem, 10vw, 8rem)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "hsl(14 59% 59% / 0.6)",
              lineHeight: 0.6,
              marginBottom: "0.25rem",
            }}
            aria-hidden="true"
          >
            "
          </div>

          {/* Opening line */}
          <p
            id="founder-note-heading"
            className={`font-display mb-10 transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{
              fontSize: "clamp(1.6rem, 3.2vw, 2.4rem)",
              fontWeight: 400,
              lineHeight: 1.25,
              letterSpacing: "-0.018em",
              color: "hsl(28 10% 14%)",
            }}
          >
            <span className="italic">I was paying $500 a month for Apollo</span> and
            still spending three hours a day on LinkedIn.
          </p>

          {/* Body */}
          <div
            className={`mb-14 space-y-6 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <p className="text-[17px] leading-[1.7]" style={{ color: "hsl(28 8% 26%)" }}>
              The data wasn't the problem. The workflow was. I'd export a list,
              paste it into a spreadsheet, score it by hand, write emails one at a
              time, and track replies in a separate inbox. Four tools. Six context
              switches. Most of it was overhead.
            </p>
            <p className="text-[17px] leading-[1.7]" style={{ color: "hsl(28 8% 26%)" }}>
              SalesOS is what I wanted to exist — one place to describe who I
              want to reach, see who's actually worth emailing, and write
              something worth reading. Not magic. Just the workflow that should
              have existed years ago.
            </p>
          </div>

          {/* Signature line */}
          <div
            className={`transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            <div
              className="mb-6 h-px w-16"
              style={{ background: "hsl(14 59% 52%)" }}
            />

            {/* Hand-drawn-feel signature glyph (SVG) */}
            <svg
              width="140"
              height="44"
              viewBox="0 0 140 44"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="mb-4"
              style={{ color: "hsl(28 10% 14%)" }}
            >
              <path
                d="M4 28 C 12 6, 22 36, 30 18 C 36 4, 44 34, 54 16 C 62 2, 70 30, 80 14 C 90 -2, 98 32, 108 12 C 116 0, 126 24, 136 10"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d="M8 36 L 128 36"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.2"
              />
            </svg>

            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ background: "hsl(14 59% 52%)" }}
                aria-hidden="true"
              >
                B
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium" style={{ color: "hsl(28 10% 14%)" }}>
                    Brandon — Founder of SalesOS
                  </p>
                  <a
                    href="https://www.linkedin.com/in/buildwitbrandon"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                    style={{ color: "hsl(14 59% 52%)" }}
                    aria-label="Brandon on LinkedIn"
                  >
                    LinkedIn <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider" style={{ color: "hsl(28 6% 48%)" }}>
                  Built in NYC · Launched 2026
                </p>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div
            className={`mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 transition-all duration-700 delay-[400ms] ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              onClick={() => navigate("/auth")}
              className="cta-ghost inline-flex items-center gap-1.5 text-[15px] font-medium"
            >
              Try it free
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/pricing")}
              className="inline-flex items-center gap-1.5 text-[15px] transition-colors duration-200"
              style={{ color: "hsl(28 6% 48%)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(28 10% 14%)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(28 6% 48%)")}
            >
              View plans
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
