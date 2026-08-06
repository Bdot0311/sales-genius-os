import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { CAMPAIGN_SETUP_BOOKING_URL, openCampaignSetupBooking } from "@/lib/campaign-setup";

const ease = [0.16, 1, 0.3, 1] as const;

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative hero-fullscreen flex flex-col items-center justify-center overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+4.75rem)] pb-4 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-8"
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

      {/* Bottom fade so the mockup melds seamlessly into the hero */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none sm:h-48"
        style={{ background: "linear-gradient(to top, hsl(261 75% 2%) 0%, transparent 100%)" }}
        aria-hidden="true"
      />

      <div className="noise-texture" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

        {/* Badge */}
        {/* Badge — paints immediately (no opacity-0 start) to protect LCP */}
        <div className="mb-6 max-w-full sm:mb-10">
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/95 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-white/95">New</span>
            <span className="text-white/85">·</span>
            <span>AI SDR now live · see who's ready to buy before you reach out</span>
          </span>
        </div>

        {/* H1 — two lines spring in with stagger */}
        <h1
          id="hero-heading"
          className="font-display mb-5 max-w-[13ch] text-balance sm:mb-8 sm:max-w-none"
          style={{ fontSize: "clamp(3rem, 8vw, 5.25rem)", lineHeight: 1.02, letterSpacing: "-0.01em", fontWeight: 800 }}
        >
          <span className="block text-white">
            Find who to sell to.
          </span>
          <span
            className="block font-display italic animate-shiny"
            style={{
              fontStyle: "italic",
              fontWeight: 800,
              // Stops stay light enough to remain legible on the dark hero at
              // every point of the shimmer sweep — the old near-black stops
              // made half the headline disappear, especially on mobile.
              backgroundImage: "linear-gradient(to right, #a78bfa 0%, #8b5cf6 15%, #c4b5fd 35%, #e9d5ff 50%, #c4b5fd 65%, #8b5cf6 85%, #a78bfa 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Then close them.
          </span>
        </h1>

        {/* Subhead — LCP element: rendered fully opaque, no entrance animation */}
        <p className="mb-5 max-w-[22rem] text-base font-light leading-snug text-white/95 sm:max-w-2xl sm:text-xl sm:leading-relaxed">
          Know exactly who's ready to buy. OutReign scores every prospect by fit and intent, verifies their inbox, and drafts the opener, so your team focuses on closing.
        </p>



        {/* CTAs */}
        <motion.div
          className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease, delay: 0.5 }}
        >
          <motion.a
            href={CAMPAIGN_SETUP_BOOKING_URL}
            onClick={(e) => { e.preventDefault(); void openCampaignSetupBooking("hero_book_setup"); }}
            target="_blank"
            rel="noopener noreferrer"
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            aria-label="Claim your free campaign setup"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Get your free campaign setup
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </motion.a>

          <motion.a
            href="/demo"
            onClick={(e) => { e.preventDefault(); navigate("/demo"); }}
            className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/85 transition-colors duration-200 hover:text-white sm:h-[52px]"
            whileHover={{ x: 3 }}
            aria-label="See how OutReign works"
          >
            See how it works
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
          </motion.a>
        </motion.div>

        <motion.p
          className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-white/90 sm:flex-nowrap"
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

        {/* Social proof line */}
        <motion.p
          className="text-xs text-center"
          style={{ color: "hsl(0 0% 100% / 0.5)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.75 }}
        >
          Built in public by a founder running real outbound daily
        </motion.p>
      </div>

    </section>
  );
};
