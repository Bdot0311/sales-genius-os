import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

const integrations = ["Gmail", "HubSpot", "Salesforce", "Slack", "Calendly", "Zapier", "LinkedIn"];

export const HeroSection = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      className="relative hero-fullscreen flex flex-col items-center justify-center overflow-hidden"
      aria-labelledby="hero-heading"
    >
      {/* ── Background ── */}
      <div className="absolute inset-0 bg-[hsl(0,0%,3%)]" aria-hidden="true" />

      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      {/* Large ambient orb — bottom left */}
      <div
        className="absolute bottom-[-120px] left-[-80px] w-[600px] h-[600px] rounded-full hero-orb pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, hsl(261 75% 55% / 0.06) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />

      {/* Large ambient orb — bottom right */}
      <div
        className="absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full hero-orb pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, hsl(280 70% 60% / 0.04) 50%, transparent 70%)",
          filter: "blur(50px)",
          animationDelay: "6s",
        }}
        aria-hidden="true"
      />

      {/* Very top center glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.08) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      {/* Noise grain */}
      <div className="noise-texture" aria-hidden="true" />

      {/* ── Content ── */}
      <div className="relative z-10 container mx-auto px-6 flex flex-col items-center text-center">

        {/* Announcement pill */}
        <div
          className={`mb-10 transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}
        >
          <span className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/10 bg-white/5 text-xs text-white/60 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-500" />
            </span>
            <span className="font-medium text-white/80">New</span>
            <span className="text-white/30">·</span>
            Signal-based lead scoring is live
          </span>
        </div>

        {/* ── Headline — serif display ── */}
        <h1
          id="hero-heading"
          className={`font-display mb-8 transition-all duration-700 delay-75 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
          style={{
            fontSize: "clamp(3.2rem, 7.5vw, 7rem)",
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            fontWeight: 800,
          }}
        >
          {/* Line 1: white upright */}
          <span className="block text-white">Find who to sell to.</span>
          {/* Line 2: italic, primary gradient */}
          <span
            className="block font-display italic"
            style={{
              fontStyle: "italic",
              fontWeight: 800,
              background: "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Then actually sell to them.
          </span>
        </h1>

        {/* Subheadline */}
        <p
          className={`text-lg sm:text-xl font-light text-white/50 max-w-xl mx-auto mb-12 leading-relaxed transition-all duration-700 delay-150 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          SalesOS scores your best-fit prospects, enriches them with verified contact data, and drafts your first email — before you finish your coffee.
        </p>

        {/* CTAs */}
        <div
          className={`flex flex-col sm:flex-row items-center gap-4 mb-8 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          {/* Primary pill */}
          <button
            onClick={() => navigate("/auth")}
            className="cta-pill-glow inline-flex items-center gap-2 h-13 px-8 rounded-full text-sm font-semibold text-white group"
            style={{
              height: "52px",
              background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
            }}
            aria-label="Start for free"
          >
            Start for free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
          </button>

          {/* Ghost CTA */}
          <a
            href="/demo"
            className="inline-flex items-center gap-1.5 h-[52px] px-5 text-sm text-white/50 hover:text-white/80 transition-colors duration-200 group"
          >
            See how it works
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-200" />
          </a>
        </div>

        {/* Trust line */}
        <p
          className={`text-xs text-white/25 flex items-center justify-center gap-2.5 mb-10 transition-all duration-700 delay-[250ms] ${visible ? "opacity-100" : "opacity-0"}`}
        >
          No credit card required
          <span className="w-px h-3 bg-white/20 inline-block" />
          30-day money-back guarantee
          <span className="w-px h-3 bg-white/20 inline-block" />
          Setup in 2 minutes
        </p>

        {/* Integration trust strip */}
        <div
          className={`flex flex-col items-center gap-3 transition-all duration-700 delay-[320ms] ${visible ? "opacity-100" : "opacity-0"}`}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/18 font-medium"
            style={{ color: "hsl(0 0% 100% / 0.18)" }}
          >
            Connects with the tools you already use
          </p>
          <div className="flex items-center flex-wrap justify-center gap-x-5 gap-y-2">
            {integrations.map((name) => (
              <span
                key={name}
                className="text-xs font-medium tracking-wide"
                style={{ color: "hsl(0 0% 100% / 0.22)" }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>

      </div>

      {/* Scroll hint */}
      <div
        className={`absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 transition-all duration-700 delay-[400ms] ${visible ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">Scroll</span>
        <div
          className="w-px h-8 bg-gradient-to-b from-white/20 to-transparent"
          style={{ animation: "float 2s ease-in-out infinite" }}
        />
      </div>
    </section>
  );
};
