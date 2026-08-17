import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CAMPAIGN_SETUP_BOOKING_URL, openCampaignSetupBooking } from "@/lib/campaign-setup";
import { Analytics } from "@/lib/analytics-events";

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:pt-[calc(env(safe-area-inset-top)+7.5rem)]"
      aria-labelledby="hero-heading"
    >
      <div className="relative z-20 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

        {/* Badge — paints immediately (no opacity-0 start) to protect LCP */}
        <div className="mb-6 max-w-full sm:mb-10">
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/95 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-white/95">New</span>
            <span className="text-white/85">·</span>
            <span>an AI SDR that books meetings on its own</span>
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
        <p className="mb-7 max-w-[26rem] text-pretty text-xl font-medium leading-snug text-white sm:mb-8 sm:max-w-2xl sm:text-[1.75rem] sm:leading-relaxed" style={{ textShadow: "0 4px 32px rgba(0,0,0,0.55)" }}>
          Describe your customer in plain English. Get 100 ranked prospects with verified emails and a first draft for each, free. Then we build your first campaign with you, on a call, and your AI SDR keeps it running.
        </p>

        {/* CTAs — entrance deferred with CSS to keep LCP focused on the text above */}
        <div
          className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both"
          style={{ animationDelay: '600ms' }}
        >
          <a
            href={CAMPAIGN_SETUP_BOOKING_URL}
            onClick={(e) => { e.preventDefault(); void openCampaignSetupBooking("hero_book_setup"); }}
            target="_blank"
            rel="noopener noreferrer"
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto transition-transform active:scale-[0.98] hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            aria-label="Claim your free campaign setup"
          >
            Get your free campaign setup
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>

          <a
            href="/demo"
            onClick={(e) => { e.preventDefault(); Analytics.demoCtaClicked("hero_see_how_it_works"); navigate("/demo"); }}
            className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/85 transition-all duration-200 hover:text-white hover:translate-x-0.5 sm:h-[52px]"
            aria-label="See how OutReign works"
          >
            See how it works
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
          </a>
        </div>

        <p
          className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-white/90 sm:flex-nowrap animate-in fade-in duration-700 fill-mode-both"
          style={{ animationDelay: '800ms' }}
        >
          100 free leads
          <span className="w-px h-3 bg-white/20 inline-block" />
          14-day trial on paid plans
          <span className="w-px h-3 bg-white/20 inline-block" />
          Set up with you personally
        </p>

        {/* Social proof line */}
        <p
          className="text-xs text-center animate-in fade-in duration-700 fill-mode-both"
          style={{ color: "hsl(0 0% 100% / 0.5)", animationDelay: '900ms' }}
        >
          Built by operators who run real outbound every day
        </p>
      </div>

    </section>
  );
};
