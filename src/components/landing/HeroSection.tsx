import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

export const HeroSection = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative hero-fullscreen flex flex-col overflow-hidden pt-[calc(env(safe-area-inset-top)+6rem)] pb-20 sm:pt-[calc(env(safe-area-inset-top)+7.5rem)] sm:pb-28"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="hero-heading"
    >
      {/* Soft warm sunrise wash in the bottom-right corner */}
      <div className="warm-wash" aria-hidden="true" />

      {/* Faint grain */}
      <div className="noise-texture" aria-hidden="true" />

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-6 sm:px-8">
        {/* Eyebrow */}
        <div
          className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
        >
          <div className="flex items-center gap-3">
            <span className="eyebrow">01 / Sales OS</span>
            <span className="hairline w-16 hidden sm:block" />
            <span className="eyebrow-muted hidden sm:inline-flex">A new outbound workflow</span>
          </div>
        </div>

        {/* 12-column editorial layout */}
        <div className="mt-10 grid grid-cols-1 gap-10 sm:mt-14 lg:grid-cols-12 lg:gap-12">
          {/* LEFT — headline + subhead + CTAs */}
          <div className="lg:col-span-7">
            <h1
              id="hero-heading"
              className={`font-display text-balance transition-all duration-700 delay-75 ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{
                fontSize: "clamp(2.8rem, 7.4vw, 5.5rem)",
                fontWeight: 400,
                lineHeight: 1.02,
                letterSpacing: "-0.025em",
                color: "hsl(28 10% 14%)",
              }}
            >
              Sales stops feeling
              <br />
              like <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>cold labor.</span>
            </h1>

            <p
              className={`mt-8 max-w-[34rem] text-[17px] leading-[1.6] transition-all duration-700 delay-150 ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
              style={{ color: "hsl(28 6% 38%)" }}
            >
              Describe your buyer in plain English. SalesOS scores the best-fit
              prospects, verifies their business emails, and drafts a first-touch
              message that reads like you wrote it — all before your coffee cools.
            </p>

            <div
              className={`mt-10 flex flex-col items-start gap-5 transition-all duration-700 delay-200 sm:flex-row sm:items-center sm:gap-6 ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <button
                onClick={() => navigate("/auth")}
                className="cta-pill-glow inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-8 text-[15px] font-semibold group"
                aria-label="Start for free"
              >
                Start for free
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>

              <a
                href="/demo"
                className="cta-ghost inline-flex items-center gap-1.5 text-[15px] font-medium"
              >
                See how it works
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Trust row */}
            <div
              className={`mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm transition-all duration-700 delay-[250ms] ${
                visible ? "opacity-100" : "opacity-0"
              }`}
              style={{ color: "hsl(28 6% 38%)" }}
            >
              <span>No credit card required</span>
              <span className="hairline inline-block h-3 w-px" style={{ background: "hsl(28 10% 78%)" }} />
              <span>30-day money-back</span>
              <span className="hairline inline-block h-3 w-px" style={{ background: "hsl(28 10% 78%)" }} />
              <span>Setup in 2 minutes</span>
            </div>
          </div>

          {/* RIGHT — signed editorial quote / stat block */}
          <aside
            className={`relative lg:col-span-5 lg:pl-8 transition-all duration-700 delay-300 ${
              visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <div className="relative">
              {/* Left rule */}
              <div
                className="absolute top-1 bottom-1 left-0 hidden w-px lg:block"
                style={{ background: "hsl(28 10% 82%)" }}
                aria-hidden="true"
              />

              <div className="lg:pl-10">
                <span className="eyebrow-muted">A Note</span>

                <blockquote
                  className="mt-4 font-display italic"
                  style={{
                    fontSize: "clamp(1.35rem, 2.1vw, 1.75rem)",
                    fontWeight: 400,
                    lineHeight: 1.35,
                    letterSpacing: "-0.01em",
                    color: "hsl(28 10% 14%)",
                  }}
                >
                  "I was paying $500 a month for data and still spending three hours a day on LinkedIn. So I rebuilt the whole workflow."
                </blockquote>

                <div className="mt-6 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: "hsl(14 59% 52%)" }}
                    aria-hidden="true"
                  >
                    B
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: "hsl(28 10% 14%)" }}>
                      Brandon — Founder, NYC
                    </span>
                    <a
                      href="https://www.linkedin.com/in/buildwitbrandon"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium transition-colors"
                      style={{ color: "hsl(14 59% 52%)" }}
                      aria-label="Brandon on LinkedIn"
                    >
                      LinkedIn <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Signature stat */}
                <div className="mt-10 flex items-baseline gap-4">
                  <span className="editorial-stat" style={{ fontSize: "clamp(3rem, 5.5vw, 4.25rem)" }}>
                    &lt; 2
                  </span>
                  <div className="flex flex-col">
                    <span className="stat-unit">min</span>
                    <span className="mt-1 text-sm" style={{ color: "hsl(28 6% 38%)" }}>
                      from ICP to first lead
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className={`absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 transition-all duration-700 delay-[400ms] md:flex ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      >
        <span className="eyebrow-muted" style={{ color: "hsl(28 6% 52%)" }}>Scroll</span>
        <div
          className="h-8 w-px animate-float"
          style={{ background: "linear-gradient(to bottom, hsl(28 10% 60%), transparent)" }}
        />
      </div>
    </section>
  );
};
