import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative hero-fullscreen flex flex-col items-center justify-center overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+4.75rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-20"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0 bg-[hsl(261,75%,3%)]/60" aria-hidden="true" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />

      {/* Left orb — multi-keyframe float */}
      <motion.div
        className="absolute bottom-[-80px] left-[-120px] h-[280px] w-[280px] rounded-full pointer-events-none sm:bottom-[-120px] sm:left-[-80px] sm:h-[600px] sm:w-[600px]"
        style={{
          background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, hsl(261 75% 55% / 0.06) 50%, transparent 70%)",
          willChange: "transform",
        }}
        animate={{ y: [0, -28, 14, -8, 0], x: [0, 18, -20, 10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />

      {/* Right orb — offset timing */}
      <motion.div
        className="absolute bottom-[-60px] right-[-110px] h-[260px] w-[260px] rounded-full pointer-events-none sm:bottom-[-100px] sm:right-[-100px] sm:h-[500px] sm:w-[500px]"
        style={{
          background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, hsl(280 70% 60% / 0.04) 50%, transparent 70%)",
          willChange: "transform",
        }}
        animate={{ y: [0, 22, -18, 12, 0], x: [0, -16, 24, -8, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 7 }}
        aria-hidden="true"
      />

      <div
        className="absolute top-0 left-1/2 h-[220px] w-full max-w-[420px] -translate-x-1/2 pointer-events-none sm:h-[400px] sm:max-w-[800px]"
        style={{ background: "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div className="noise-texture" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

        {/* Badge */}
        <motion.div
          className="mb-6 max-w-full sm:mb-10"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/60 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-white/80">New</span>
            <span className="text-white/70">·</span>
            <span>AI SDR now live · see who's ready to buy before you reach out</span>
          </span>
        </motion.div>

        {/* H1 — two lines spring in with stagger */}
        <h1
          id="hero-heading"
          className="font-display mb-5 max-w-[13ch] text-balance sm:mb-8 sm:max-w-none"
          style={{ fontSize: "clamp(2.05rem, 6.4vw, 5.25rem)", lineHeight: 1.02, letterSpacing: "-0.01em", fontWeight: 800 }}
        >
          <motion.span
            className="block text-white"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.1 }}
          >
            Find who to sell to.
          </motion.span>
          <motion.span
            className="block font-display italic animate-shiny"
            style={{
              fontStyle: "italic",
              fontWeight: 800,
              backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "url(#c3-noise)",
            }}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.24 }}
          >
            Then close them.
          </motion.span>
        </h1>

        {/* Subhead */}
        <motion.p
          className="mb-7 max-w-[22rem] text-base font-light leading-relaxed text-white/80 sm:mb-12 sm:max-w-xl sm:text-xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.38 }}
        >
          Type who you want in plain English. Get ranked prospects, verified emails, and a personalized first draft for each. Ready to send in under 2 minutes.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease, delay: 0.5 }}
        >
          <motion.button
            onClick={() => navigate("/auth")}
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            aria-label="Start for free"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Get 10 Free Leads Now
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </motion.button>

          <motion.a
            href="/demo"
            className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/85 transition-colors duration-200 hover:text-white sm:h-[52px]"
            whileHover={{ x: 3 }}
            aria-label="Watch the SalesOS product walkthrough"
          >
            Watch SalesOS product walkthrough
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
          </motion.a>
        </motion.div>

        <motion.p
          className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-white/70 sm:flex-nowrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          No credit card required
          <span className="w-px h-3 bg-white/20 inline-block" />
          Cancel anytime
          <span className="w-px h-3 bg-white/20 inline-block" />
          First leads in 2 minutes
        </motion.p>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.1 }}
        aria-hidden="true"
      >
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">scroll</span>
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-4 w-4 text-white/30" />
        </motion.div>
      </motion.div>
    </section>
  );
};
