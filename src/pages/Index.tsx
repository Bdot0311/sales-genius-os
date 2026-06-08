import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { SEOHead } from "@/components/seo";

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Force muted + play for strict mobile autoplay policies
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    const hideVideo = () => {
      // If autoplay is blocked (e.g. iOS Low Power Mode), hide the element
      // so the native play-button placeholder never shows. The dark purple
      // gradient overlay alone becomes the background.
      video.style.opacity = "0";
    };
    const showVideo = () => {
      video.style.opacity = "1";
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
  }, []);


  return (
    <>
      <SEOHead
        title="SalesOS — Find Who to Sell To, Then Sell"
        description="Describe your ideal customer in plain English. SalesOS returns ranked B2B prospects with verified emails and AI-drafted outreach in under 2 minutes."

        keywords="B2B lead generation, lead discovery, outbound email software, ICP scoring, SMTP verified emails, plain English lead search, B2B prospecting, AI email drafting, email enrichment, outbound sales automation, find B2B leads, lead scoring software, B2B email outreach"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />

      {/* Fixed cinematic video background with purple tint */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          controls={false}
          width="100%"
          height="100%"
          poster="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%230a0612'/%3E%3C/svg%3E"
          style={{ transition: "opacity 400ms ease" }}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
            type="video/mp4"
          />
        </video>
        {/* Purple-tinted overlay — light enough to keep the aura visible */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, hsl(261 75% 4% / 0.35), hsl(261 75% 3% / 0.55))' }}
        />
        {/* Brand purple color shift — forces video hue toward violet-purple */}
        <div
          className="absolute inset-0"
          style={{ background: 'hsl(261 75% 40%)', mixBlendMode: 'color', opacity: 0.45 }}
        />
        {/* Soft vignette to keep text legible at edges */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 40%, hsl(261 75% 2% / 0.6) 100%)' }}
        />
      </div>

      {/* Desktop vertical guide lines */}
      <div className="hidden lg:block fixed inset-y-0 left-1/2 w-px -translate-x-[36rem] bg-white/[0.04] pointer-events-none z-0" aria-hidden="true" />
      <div className="hidden lg:block fixed inset-y-0 left-1/2 w-px translate-x-[36rem] bg-white/[0.04] pointer-events-none z-0" aria-hidden="true" />

      <div className="min-h-screen bg-transparent text-foreground overflow-x-hidden">
        <Navbar />
        <main itemScope itemType="https://schema.org/WebPage">
          <article>
            <HeroSection />
            <ProductShowcase />
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
          </article>
        </main>
        <DeferredSection><FooterSection /></DeferredSection>
        <DeferredSection><ExitIntentModal /></DeferredSection>
      </div>
    </>
  );
};

export default Index;
