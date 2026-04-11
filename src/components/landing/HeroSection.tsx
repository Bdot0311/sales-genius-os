import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

export const HeroSection = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative hero-fullscreen flex flex-col items-center justify-start overflow-hidden pt-[calc(env(safe-area-inset-top)+5.75rem)] pb-14 sm:justify-center sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-20"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0 bg-[hsl(0,0%,3%)]" aria-hidden="true" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      <div
        className="absolute bottom-[-80px] left-[-120px] h-[360px] w-[360px] rounded-full hero-orb pointer-events-none sm:bottom-[-120px] sm:left-[-80px] sm:h-[600px] sm:w-[600px]"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, hsl(261 75% 55% / 0.06) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />

      <div
        className="absolute bottom-[-60px] right-[-110px] h-[320px] w-[320px] rounded-full hero-orb pointer-events-none sm:bottom-[-100px] sm:right-[-100px] sm:h-[500px] sm:w-[500px]"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, hsl(280 70% 60% / 0.04) 50%, transparent 70%)",
          filter: "blur(50px)",
          animationDelay: "6s",
        }}
        aria-hidden="true"
      />

      <div
        className="absolute top-0 left-1/2 h-[240px] w-[420px] -translate-x-1/2 pointer-events-none sm:h-[400px] sm:w-[800px]"
        style={{
          background:
            "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.08) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="noise-texture" aria-hidden="true" />

      <div className="relative z-10 container mx-auto flex flex-col items-center px-5 text-center sm:px-6">
        <div
          className={`mb-8 max-w-full transition-all duration-500 sm:mb-10 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}
        >
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/60 backdrop-blur-sm sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-white/80">New</span>
            <span className="text-white/30">·</span>
            <span>Signal-based lead scoring is live</span>
          </span>
        </div>

        <h1
          id="hero-heading"
          className={`font-display mb-6 max-w-[11ch] text-balance transition-all duration-700 delay-75 sm:mb-8 sm:max-w-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
          style={{
            fontSize: "clamp(3rem, 15vw, 7rem)",
            lineHeight: 0.96,
            letterSpacing: "-0.03em",
            fontWeight: 800,
          }}
        >
          <span className="block text-white">Find who to sell to.</span>
          <span
            className="block font-display italic"
            style={{
              fontStyle: "italic",
              fontWeight: 800,
              background:
                "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Then actually sell to them.
          </span>
        </h1>

        <p
          className={`mb-8 max-w-[22rem] text-base font-light leading-relaxed text-white/55 transition-all duration-700 delay-150 sm:mb-12 sm:max-w-xl sm:text-xl ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          SalesOS scores your best-fit prospects, enriches them with verified contact data, and drafts your first email — before you finish your coffee.
        </p>

        <div
          className={`mb-8 flex w-full max-w-[20rem] flex-col items-center gap-3 transition-all duration-700 delay-200 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <button
            onClick={() => navigate("/auth")}
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto"
            style={{
              background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
            }}
            aria-label="Start for free"
          >
            Start for free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>

          <a
            href="/demo"
            className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/60 transition-colors duration-200 group hover:text-white/80 sm:h-[52px]"
          >
            See how it works
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Trust line */}
        <p
          className={`text-xs text-white/25 flex items-center justify-center gap-2.5 mb-4 transition-all duration-700 delay-[250ms] ${visible ? "opacity-100" : "opacity-0"}`}
        >
          No credit card required
          <span className="w-px h-3 bg-white/20 inline-block" />
          30-day money-back guarantee
          <span className="w-px h-3 bg-white/20 inline-block" />
          Setup in 2 minutes
        </p>

        {/* Founder byline */}
        <div
          className={`mb-10 flex items-center justify-center gap-2 transition-all duration-700 delay-[300ms] ${visible ? "opacity-100" : "opacity-0"}`}
        >
          <div
            className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white select-none"
            style={{
              background:
                "linear-gradient(135deg, hsl(261 75% 55%), hsl(280 80% 65%))",
            }}
            aria-hidden="true"
          >
            B
          </div>
          <span className="text-xs" style={{ color: "hsl(0 0% 100% / 0.25)" }}>
            Built by Brandon, Founder · NYC
          </span>
          <a
            href="https://www.linkedin.com/in/buildwitbrandon"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs transition-colors duration-200"
            style={{ color: "hsl(261 75% 55% / 0.6)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "hsl(261 75% 72%)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "hsl(261 75% 55% / 0.6)")
            }
            aria-label="Brandon on LinkedIn"
          >
            ↗ LinkedIn
          </a>
        </div>


      </div>

      <div
        className={`absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1.5 transition-all duration-700 delay-[400ms] sm:flex ${visible ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">Scroll</span>
        <div
          className="h-8 w-px bg-gradient-to-b from-white/20 to-transparent"
          style={{ animation: "float 2s ease-in-out infinite" }}
        />
      </div>
    </section>
  );
};
