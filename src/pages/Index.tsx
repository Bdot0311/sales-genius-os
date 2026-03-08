import { lazy, Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustedByBar } from "@/components/landing/TrustedByBar";
import { SocialProofComparison } from "@/components/landing/SocialProofComparison";
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
const ModulesSection = lazy(() => import("@/components/landing/ModulesSection").then(m => ({ default: m.ModulesSection })));
const DifferentiationSection = lazy(() => import("@/components/landing/DifferentiationSection").then(m => ({ default: m.DifferentiationSection })));
const Demo = lazy(() => import("@/components/Demo").then(m => ({ default: m.Demo })));
const IntegrationsSection = lazy(() => import("@/components/landing/IntegrationsSection").then(m => ({ default: m.IntegrationsSection })));
const PricingTeaser = lazy(() => import("@/components/landing/PricingTeaser").then(m => ({ default: m.PricingTeaser })));
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
    name: "Sign up for free",
    text: "Create your SalesOS account in under 2 minutes. No credit card required. Explore dashboards, pipeline, and sample data instantly."
  },
  {
    name: "Describe your ideal customer",
    text: "Tell SalesOS who you're looking for in plain English: job titles, industries, company size, location. No complex filters needed."
  },
  {
    name: "Get ranked matches with enriched profiles",
    text: "AI scores each lead by fit. Every profile comes with verified emails, LinkedIn, company data, and tech stack."
  },
  {
    name: "Engage with personalized outreach",
    text: "Generate AI-crafted emails that feel human. Automate follow-ups and track opens, clicks, and replies in real-time."
  },
  {
    name: "Close more deals",
    text: "Manage your pipeline visually, get real-time coaching on objections, and forecast revenue with confidence."
  }
];

const keyFeatures = [
  {
    name: "AI Lead Scoring",
    description: "Machine learning analyzes engagement, company fit, and behavioral signals to predict conversion likelihood with over 85% accuracy.",
    position: 1
  },
  {
    name: "Intelligent Email Generation",
    description: "AI crafts personalized emails for each lead based on their profile, company data, and your specified tone and goals.",
    position: 2
  },
  {
    name: "Visual Pipeline Management",
    description: "Drag-and-drop interface to manage deals through custom stages with real-time analytics and forecasting.",
    position: 3
  },
  {
    name: "Real-Time AI Coaching",
    description: "Get instant suggestions and insights to improve your sales approach and close rates.",
    position: 4
  },
  {
    name: "Workflow Automation",
    description: "Automate repetitive tasks like follow-ups, lead assignments, and status updates with visual workflow builder.",
    position: 5
  },
  {
    name: "CRM Integrations",
    description: "Seamlessly connect with HubSpot, Salesforce, Pipedrive, and 5000+ apps via Zapier.",
    position: 6
  }
];

const Index = () => {
  // Enable cursor-following spotlight effect on cards
  useSpotlightEffect();
  
  return (
    <>
      <SEOHead 
        title="SalesOS - Find, Engage & Close More Deals | AI Sales Platform"
        description="AI-powered lead discovery, personalized outreach, pipeline management, and sales coaching—all in one platform. Start free, upgrade when ready. No credit card required."
        keywords="AI sales platform, lead discovery, sales automation, personalized outreach, pipeline management, B2B sales, AI email generation, sales coaching, CRM"
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
        description="Learn how to find, engage, and close more deals with SalesOS in just 5 easy steps."
        steps={gettingStartedSteps}
        totalTime="PT5M"
      />
      
      {/* AEO: ItemList for feature discovery */}
      <ItemListSchema 
        name="SalesOS Key Features"
        items={keyFeatures}
      />
      
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main itemScope itemType="https://schema.org/WebPage">
          <article>
            {/* Above the fold - eagerly loaded */}
            <HeroSection />
            <TrustedByBar />
            <SocialProofComparison />
            
            {/* Below the fold - lazy loaded */}
            <Suspense fallback={<SectionLoader />}>
              <HowItWorks />
              <ModulesSection />
              <DifferentiationSection />
              <Demo />
              <IntegrationsSection />
              <PricingTeaser />
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
