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
  return (
    <>
      <SEOHead
        title="SalesOS — Find Who to Sell To. Then Actually Sell to Them."
        description="Describe your ideal customer in plain English. SalesOS returns ranked B2B prospects with verified emails and AI-drafted outreach in under 2 minutes."

        keywords="B2B lead generation, lead discovery, outbound email software, ICP scoring, SMTP verified emails, plain English lead search, B2B prospecting, AI email drafting, email enrichment, outbound sales automation, find B2B leads, lead scoring software, B2B email outreach"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />

      {/* Fixed cinematic video background with purple tint */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full object-cover"
          style={{ height: '100%' }}
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
            type="video/mp4"
          />
        </video>
        {/* Purple-tinted dark overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, hsl(261 75% 5% / 0.85), hsl(261 75% 3% / 0.92))' }}
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
