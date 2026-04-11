import { lazy, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import {
  SEOHead,
  OrganizationSchema,
  SoftwareApplicationSchema,
  WebSiteSchema,
  ServiceSchema,
  SpeakableSchema,
  HowToSchema,
  ItemListSchema
} from "@/components/seo";
import { useSpotlightEffect } from "@/hooks/use-spotlight-effect";

// Lazy load below-the-fold sections to reduce initial bundle size
const HowItWorks = lazy(() => import("@/components/landing/HowItWorks").then(m => ({ default: m.HowItWorks })));
const ProblemSection = lazy(() => import("@/components/landing/ProblemSection").then(m => ({ default: m.ProblemSection })));
const ModulesSection = lazy(() => import("@/components/landing/ModulesSection").then(m => ({ default: m.ModulesSection })));
const BigStatSection = lazy(() => import("@/components/landing/BigStatSection").then(m => ({ default: m.BigStatSection })));
const DifferentiationSection = lazy(() => import("@/components/landing/DifferentiationSection").then(m => ({ default: m.DifferentiationSection })));
const FounderNoteSection = lazy(() => import("@/components/landing/FounderNoteSection").then(m => ({ default: m.FounderNoteSection })));
const FAQSection = lazy(() => import("@/components/landing/FAQSection").then(m => ({ default: m.FAQSection })));
const FinalCTA = lazy(() => import("@/components/landing/FinalCTA").then(m => ({ default: m.FinalCTA })));
const TrustBar = lazy(() => import("@/components/landing/TrustBar").then(m => ({ default: m.TrustBar })));
const FooterSection = lazy(() => import("@/components/landing/FooterSection").then(m => ({ default: m.FooterSection })));

// Minimal fallback for lazy sections
const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// AEO: Define clear, structured content for AI answer engines
const gettingStartedSteps = [
  {
    name: "Describe your ideal customer in plain English",
    text: "Type who you want to reach — job title, industry, company size, location, or hiring signals. No boolean search, no filters. SalesOS interprets natural language."
  },
  {
    name: "Review prospects ranked by ICP fit",
    text: "SalesOS returns a ranked list of B2B prospects scored against your ICP. Each entry includes company context, growth signals, and an ICP match percentage."
  },
  {
    name: "Get SMTP-verified business emails",
    text: "Every prospect comes enriched with a verified business email — validated via SMTP handshake and multi-source enrichment before it reaches you."
  },
  {
    name: "Send an AI-drafted first-touch email",
    text: "SalesOS drafts a personalized first-touch email using the prospect's role, company news, and growth signals. Edit it in under 30 seconds and send directly from the platform."
  },
  {
    name: "Track replies and manage follow-up",
    text: "Replies, sequences, and follow-up tasks stay organized in one place. Connect to HubSpot, Salesforce, or Gmail to keep your CRM in sync automatically."
  }
];

const keyFeatures = [
  {
    name: "Plain-English ICP-based lead search",
    description: "Describe your target customer in plain English — title, industry, company size, location. No boolean syntax required.",
    position: 1
  },
  {
    name: "ICP fit scoring",
    description: "Every prospect is scored against your Ideal Customer Profile so you know who to email first.",
    position: 2
  },
  {
    name: "SMTP-verified business email enrichment",
    description: "Business emails are verified via SMTP handshake before delivery, reducing bounce rates and protecting sender reputation.",
    position: 3
  },
  {
    name: "AI-drafted first-touch emails",
    description: "SalesOS writes a personalized first-touch email for each prospect using their company context and growth signals.",
    position: 4
  },
  {
    name: "Reply management and sequence automation",
    description: "Manage replies, follow-ups, and multi-step email sequences from one unified workflow.",
    position: 5
  },
  {
    name: "CRM and tool integrations",
    description: "Connect with Gmail, HubSpot, Salesforce, Slack, Calendly, and Zapier. Leads and replies sync automatically.",
    position: 6
  }
];

const Index = () => {
  // Enable cursor-following spotlight effect on cards
  useSpotlightEffect();

  return (
    <>
      <SEOHead
        title="SalesOS — Find Who to Sell To. Then Actually Sell to Them."
        description="Describe your ideal customer in plain English. SalesOS returns ranked B2B prospects with SMTP-verified emails and an AI-drafted first-touch message — in under 2 minutes."
        keywords="B2B lead generation, lead discovery, outbound email software, ICP scoring, SMTP verified emails, plain English lead search, B2B prospecting, AI email drafting, email enrichment, outbound sales automation, find B2B leads, lead scoring software, B2B email outreach"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />

      {/* Core Schema Markup */}
      <OrganizationSchema />
      <SoftwareApplicationSchema />
      <WebSiteSchema />
      <ServiceSchema />
      <SpeakableSchema cssSelectors={["h1", "h2", "h3", "#hero-heading", "#how-it-works-heading", "#faq-heading", "#founder-note-heading"]} />

      {/* AEO: HowTo Schema for "How to use SalesOS" queries */}
      <HowToSchema
        name="How to Get Started with SalesOS"
        description="Learn how to preview the SalesOS workflow, identify qualified leads, and move toward live outreach in 5 clear steps."
        steps={gettingStartedSteps}
        totalTime="PT5M"
      />

      {/* AEO: ItemList for feature discovery */}
      <ItemListSchema
        name="SalesOS Key Features"
        items={keyFeatures}
      />

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Navbar />
        <main itemScope itemType="https://schema.org/WebPage">
          <article>
            {/* Above the fold - eagerly loaded */}
            <HeroSection />
            <ProductShowcase />

            {/* Below the fold - lazy loaded */}
            <Suspense fallback={<SectionLoader />}>
              <ProblemSection />
              <HowItWorks />
              <ModulesSection />
              <BigStatSection />
              <DifferentiationSection />
              <FounderNoteSection />
              <FAQSection />
              <FinalCTA />
              <TrustBar />
            </Suspense>
          </article>
        </main>

        {/* Footer */}
        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default Index;
