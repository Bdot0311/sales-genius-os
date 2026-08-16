import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { CAMPAIGN_SETUP_BOOKING_URL, openCampaignSetupBooking } from "@/lib/campaign-setup";

const ease = [0.16, 1, 0.3, 1] as const;

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:pt-[calc(env(safe-area-inset-top)+7.5rem)]"
      aria-labelledby="hero-heading"
    >
      <div className="relative z-20 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

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
            <span>New · an AI SDR that sources, writes, sends and books meetings on its own</span>
          </span>
        </div>

        {/* H1 — two lines spring in with stagger */}
        <h1
          id="hero-heading"
          className="font-display mb-5 max-w-[13ch] text-balance sm:mb-8 sm:max-w-none"
          style={{ fontSize: "clamp(3rem, 8vw, 5.25rem)", lineHeight: 1.02, letterSpacing: "-0.01em", fontWeight: 800, textShadow: "0 4px 30px rgba(0,0,0,0.35)" }}
        >
          <span className="block text-white">
            Your next 100 prospects,
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
            already qualified.
          </span>
        </h1>

        {/* Subhead — LCP element: rendered fully opaque, no entrance animation */}
        <p className="mb-5 max-w-[22rem] text-base font-light leading-snug text-white/95 sm:max-w-2xl sm:text-xl sm:leading-relaxed" style={{ textShadow: "0 3px 20px rgba(0,0,0,0.3)" }}>
          Describe your customer in plain English. Get 100 ranked prospects with verified emails and a first draft for each, free. Then we set up your first campaign with you, one to one.
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
          100 free leads
          <span className="w-px h-3 bg-white/20 inline-block" />
          Cancel anytime
          <span className="w-px h-3 bg-white/20 inline-block" />
          Set up with you personally
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
