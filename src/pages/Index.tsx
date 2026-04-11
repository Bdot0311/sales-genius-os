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
    name: "Explore the workflow",
    text: "Preview how SalesOS works before choosing the plan you want for live prospecting and outreach."
  },
  {
    name: "Describe your ideal customer",
    text: "Enter the titles, industries, company size, geography, or buying signals you want in plain English."
  },
  {
    name: "Review matched leads",
    text: "See qualified prospects with company and contact context so your team can prioritize faster."
  },
  {
    name: "Generate outreach",
    text: "Create more relevant outbound messages using the context gathered on each lead."
  },
  {
    name: "Manage follow-up",
    text: "Keep replies, next steps, and outreach activity organized from one workflow instead of juggling separate tools."
  }
];

const keyFeatures = [
  {
    name: "Plain-English lead search",
    description: "Describe your target customer naturally instead of relying on complicated search syntax.",
    position: 1
  },
  {
    name: "Lead prioritization",
    description: "Review best-fit prospects first with useful company and contact context.",
    position: 2
  },
  {
    name: "Personalized outreach",
    description: "Generate more relevant outbound drafts using lead and company information.",
    position: 3
  },
  {
    name: "Reply management",
    description: "Keep responses and follow-ups organized after prospects engage.",
    position: 4
  },
  {
    name: "Workflow automation",
    description: "Reduce repetitive sales work with sequences, handoffs, and automation support.",
    position: 5
  },
  {
    name: "Integrations",
    description: "Connect SalesOS with tools like Google Workspace, Slack, HubSpot, Salesforce, Calendly, and Zapier.",
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
        description="SalesOS turns your ICP into ranked prospects with verified contact data and AI-drafted emails. Less research. More pipeline."
        keywords="B2B lead generation, lead discovery, outbound sales software, plain English lead search, sales outreach, lead enrichment, B2B prospecting"
        ogImage="https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/social-images/salesos-logo.png"
      />

      {/* Core Schema Markup */}
      <OrganizationSchema />
      <SoftwareApplicationSchema />
      <WebSiteSchema />
      <ServiceSchema />
      <SpeakableSchema cssSelectors={["h1", "h2", ".hero-description", ".feature-description"]} />

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
