import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { SEOHead, SoftwareApplicationSchema, FAQSchema } from "@/components/seo";

const HOMEPAGE_FAQS = [
  { question: "What is OutReign?", answer: "OutReign is a B2B prospecting and outreach platform that helps teams go from ICP definition to live outreach faster." },
  { question: "Do I need boolean search skills to use it?", answer: "No. OutReign is built around plain-English targeting." },
  { question: "Can I try it before paying?", answer: "Yes. You can start free and upgrade when you are ready." },
  { question: "Who is OutReign best for?", answer: "It is strongest for founder-led sales teams, outbound agencies, SDR teams, and B2B operators running outbound motions." },
  { question: "What integrations are available?", answer: "OutReign currently supports Google Workspace and is expanding support for tools like Slack, HubSpot, Salesforce, Calendly, and Zapier." },
  { question: "Is OutReign a fit for every business?", answer: "No. It is generally not the right fit for e-commerce, B2C, or companies that do not run outbound." },
];

// Below-the-fold sections are lazy-loaded to keep Total Blocking Time low.
// Above-the-fold components (Navbar, Hero) remain static to ensure immediate LCP.
const ProductShowcase = lazy(() => import("@/components/landing/ProductShowcase").then(m => ({ default: m.ProductShowcase })));
const HowItWorks = lazy(() => import("@/components/landing/HowItWorks").then(m => ({ default: m.HowItWorks })));
const ProblemSection = lazy(() => import("@/components/landing/ProblemSection").then(m => ({ default: m.ProblemSection })));
const ModulesSection = lazy(() => import("@/components/landing/ModulesSection").then(m => ({ default: m.ModulesSection })));
const BigStatSection = lazy(() => import("@/components/landing/BigStatSection").then(m => ({ default: m.BigStatSection })));
const AISdrSection = lazy(() => import("@/components/landing/AISdrSection").then(m => ({ default: m.AISdrSection })));
const DifferentiationSection = lazy(() => import("@/components/landing/DifferentiationSection").then(m => ({ default: m.DifferentiationSection })));
const FounderNoteSection = lazy(() => import("@/components/landing/FounderNoteSection").then(m => ({ default: m.FounderNoteSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const FinalCTA = lazy(() => import("@/components/landing/FinalCTA").then(m => ({ default: m.FinalCTA })));
const TrustBar = lazy(() => import("@/components/landing/TrustBar").then(m => ({ default: m.TrustBar })));
const BlogStrip = lazy(() => import("@/components/landing/BlogStrip").then(m => ({ default: m.BlogStrip })));
const ExitIntentModal = lazy(() => import("@/components/landing/ExitIntentModal").then(m => ({ default: m.ExitIntentModal })));
const FooterSection = lazy(() => import("@/components/landing/FooterSection").then(m => ({ default: m.FooterSection })));

const DeferredSection = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

const Index = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mountVideo, setMountVideo] = useState(false);
  const navigate = useNavigate();

  // The homepage is prerendered to static HTML and adopted via hydrateRoot
  // (see scripts/prerender.mjs + src/main.tsx). Only the above-the-fold hero is
  // prerendered; the code-split below-the-fold sections mount one render after
  // hydration. Gating them on state (false on the server AND on the client's
  // first paint) guarantees the hydrated markup matches deterministically —
  // unlike gating on lazy-chunk readiness, which races with hydration. On
  // non-prerendered mounts (createRoot) this just defers the sections by a tick.
  const [showBelowFold, setShowBelowFold] = useState(false);
  useEffect(() => setShowBelowFold(true), []);

  // The cinematic background video is a ~16MB download. It is a decoration, not
  // content, so it only loads for visitors who can clearly afford it.
  useEffect(() => {
    const canAffordVideo = () => {
      if (typeof window === "undefined") return false;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
      if (!window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)").matches) return false;
      const conn = (navigator as unknown as {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      if (conn?.saveData) return false;
      if (conn?.effectiveType && !["4g", "5g"].includes(conn.effectiveType)) return false;
      return true;
    };

    if (!canAffordVideo()) return;

    // Wait for the first real interaction (scroll, pointer, key, touch) before
    // fetching the video.
    const events = ["pointermove", "pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;
    const start = () => {
      cleanup();
      setMountVideo(true);
    };
    const cleanup = () => {
      events.forEach((e) => window.removeEventListener(e, start));
    };
    events.forEach((e) => window.addEventListener(e, start, { once: true, passive: true }));
    return cleanup;
  }, []);

  // Resume OAuth flows if returning to root
  useEffect(() => {
    const stored = sessionStorage.getItem("post_auth_next");
    if (!stored || !stored.startsWith("/") || stored.startsWith("//")) return;
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session) return;
      sessionStorage.removeItem("post_auth_next");
      navigate(stored, { replace: true });
    });
    return () => { active = false; };
  }, [navigate]);


  useEffect(() => {
    if (!mountVideo) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    const hideVideo = () => {
      video.style.opacity = "0";
    };
    const showVideo = () => {
      video.style.opacity = "0.5";
    };

    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(showVideo).catch(() => {
          setTimeout(() => {
            video.play().then(showVideo).catch(hideVideo);
          }, 300);
        });
      }
    };

    tryPlay();

    const handleVisibility = () => {
      if (!document.hidden) tryPlay();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [mountVideo]);


  return (
    <>
      <SEOHead
        title="Your Next 100 B2B Prospects, Already Qualified"
        description="Describe your customer in plain English. Get 100 ranked B2B prospects with verified emails and a first draft for each, free, with campaign setup included."
        keywords="B2B lead generation, lead discovery, outbound email software, ICP scoring, SMTP verified emails, plain English lead search, B2B prospecting, AI email drafting, email enrichment, outbound sales automation, find B2B leads, lead scoring software, B2B email outreach"
        ogImage="https://outreign.io/__l5e/assets-v1/54ff0c6f-955e-4073-9348-98d79eba4c4f/outreign-social-card.jpg"
      />
      <SoftwareApplicationSchema />
      <FAQSchema faqs={HOMEPAGE_FAQS} />

      {/* Fixed cinematic video background with purple tint */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        {mountVideo && (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            controls={false}
            width="100%"
            height="100%"
            poster="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%230a0612'/%3E%3C/svg%3E"
            style={{ transition: "opacity 400ms ease", opacity: 0, filter: "saturate(1.35) hue-rotate(18deg)" }}
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
              type="video/mp4"
            />
          </video>
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, hsl(261 75% 4% / 0.45), hsl(261 75% 3% / 0.72))' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'hsl(263 80% 45%)', mixBlendMode: 'color', opacity: 0.35 }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 25%, hsl(261 75% 2% / 0.78) 100%)' }}
        />
      </div>

      <div className="hidden lg:block fixed inset-y-0 left-1/2 w-px -translate-x-[36rem] bg-white/[0.04] pointer-events-none z-0" aria-hidden="true" />
      <div className="hidden lg:block fixed inset-y-0 left-1/2 w-px translate-x-[36rem] bg-white/[0.04] pointer-events-none z-0" aria-hidden="true" />

      <div className="min-h-screen bg-transparent text-foreground overflow-x-hidden">
        <Navbar />
        <main itemScope itemType="https://schema.org/WebPage">
          <article>
            <HeroSection />
            {showBelowFold && (
              <>
                <DeferredSection><ProductShowcase /></DeferredSection>
                <DeferredSection><ProblemSection /></DeferredSection>
                <DeferredSection><HowItWorks /></DeferredSection>
                <DeferredSection><ModulesSection /></DeferredSection>
                <DeferredSection><AISdrSection /></DeferredSection>
                <DeferredSection><BigStatSection /></DeferredSection>
                <DeferredSection><DifferentiationSection /></DeferredSection>
                <DeferredSection><FounderNoteSection /></DeferredSection>
                <DeferredSection><FAQSection /></DeferredSection>
                <DeferredSection><BlogStrip /></DeferredSection>
                <DeferredSection><FinalCTA /></DeferredSection>
                <DeferredSection><TrustBar /></DeferredSection>
              </>
            )}
          </article>
        </main>
        {showBelowFold && (
          <>
            <DeferredSection><FooterSection /></DeferredSection>
            <DeferredSection><ExitIntentModal /></DeferredSection>
          </>
        )}
      </div>
    </>
  );
};

export default Index;
