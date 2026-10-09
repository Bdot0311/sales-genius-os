import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CAMPAIGN_SETUP_BOOKING_URL, openCampaignSetupBooking } from "@/lib/campaign-setup";
import { useIsSignedIn } from "@/hooks/use-signed-in";
import { Analytics } from "@/lib/analytics-events";
import { FeaturedBadges } from "@/components/landing/FeaturedBadges";

export const HeroSection = () => {
  const signedIn = useIsSignedIn();
  const navigate = useNavigate();

  return (
    <section
      className="relative flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:pt-[calc(env(safe-area-inset-top)+7.5rem)]"
      aria-labelledby="hero-heading"
    >
      <div className="relative z-20 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

        {/* Badge — paints immediately (no opacity-0 start) to protect LCP */}
        <div className="mb-6 max-w-full sm:mb-10">
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-border bg-muted/50 px-3 py-2 text-[11px] leading-tight text-foreground/95 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-foreground/95">New</span>
            <span className="text-foreground/85">·</span>
            <span>every plan ships an AI SDR, the free one included</span>
          </span>
        </div>

        {/* H1 — two lines spring in with stagger */}
        <h1
          id="hero-heading"
          className="font-display mb-5 max-w-[13ch] text-balance sm:mb-8 sm:max-w-none"
          style={{ fontSize: "clamp(3rem, 8vw, 5.25rem)", lineHeight: 1.02, letterSpacing: "-0.01em", fontWeight: 800, textShadow: "0 4px 30px rgba(0,0,0,0.35)" }}
        >
          <span className="block text-foreground">
            The output of a sales team.
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
            Headcount of one.
          </span>
        </h1>

        {/* Subhead — LCP element: rendered fully opaque, no entrance animation */}
        <p className="mb-7 max-w-[26rem] text-pretty text-xl font-medium leading-snug text-foreground sm:mb-8 sm:max-w-2xl sm:text-[1.75rem] sm:leading-relaxed" style={{ textShadow: "0 4px 32px rgba(0,0,0,0.55)" }}>
          Describe your customer in plain English. Get ranked prospects with verified emails, a first draft for each, and an AI SDR that works the replies from your Gmail.
        </p>

        {/* CTAs paint immediately so visual completion is not artificially delayed. */}
        <div
          className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4"
        >
          {/* The href stays "/auth" in the markup whatever the session is: the
              hero is prerendered to static HTML and hydrated, so anything
              rendered from `signedIn` would differ between the server pass and
              the first client paint. The session is read in the handler, which
              is the same thing the booking CTA below already does. */}
          <a
            href="/auth"
            onClick={(e) => { e.preventDefault(); navigate(signedIn ? "/dashboard" : "/auth"); }}
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto transition-transform active:scale-[0.98] hover:scale-[1.02]"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            aria-label="Start free with 100 lead searches"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>

          {/* The old label read like a coupon and never said a person would be
              on the other end of it. This one says what actually happens. */}
          <a
            href={CAMPAIGN_SETUP_BOOKING_URL}
            onClick={(e) => { e.preventDefault(); void openCampaignSetupBooking("hero_book_setup", null, { signedIn }); }}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full border border-border bg-muted/50 px-7 text-sm font-medium text-white transition-colors hover:bg-muted sm:w-auto"
            aria-label="Book a call and we build your first campaign with you"
          >
            Or build it with us on a call
          </a>
        </div>

        {/* Kept as a quiet third option rather than a button. It was competing
            with the two actions that actually start something, and the product
            tour is the next section down anyway. */}
        <a
          href="/demo"
          onClick={(e) => { e.preventDefault(); Analytics.demoCtaClicked("hero_see_how_it_works"); navigate("/demo"); }}
          className="mb-5 inline-flex items-center gap-1 text-sm text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
          aria-label="See how OutReign works"
        >
          See how it works
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <p
          className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-foreground/90 sm:flex-nowrap"
        >
          100 free lead searches
          <span className="w-px h-3 bg-foreground/20 inline-block" />
          14-day trial on paid plans
          <span className="w-px h-3 bg-foreground/20 inline-block" />
          Built with you on a call
        </p>

        {/* Social proof line */}
        <p
          className="text-xs text-center"
          style={{ color: "hsl(var(--foreground) / 0.5)" }}
        >
          Built by operators who run outbound every day
        </p>

        {/* Three directory badges, not the footer's nineteen. See
            lib/directory-badges.ts for why the rest stay below. */}
        <FeaturedBadges className="mt-5" />
      </div>

    </section>
  );
};
