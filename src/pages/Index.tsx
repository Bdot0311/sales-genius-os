import { Navbar } from "@/components/Navbar";
import { Demo } from "@/components/Demo";
import { 
  HeroSection,
  TrustedByBar,
  ProblemSection,
  HowItWorks,
  ModulesSection,
  DifferentiationSection,
  TestimonialsSection,
  IntegrationsSection,
  PricingTeaser,
  FAQSection,
  FinalCTA,
  FooterSection,
  MidPageCTA,
  StackComparisonSection,
} from "@/components/landing";
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


// AEO: Define clear, structured content for AI answer engines
const gettingStartedSteps = [
  {
    name: "Sign up for a free trial",
    text: "Create your SalesOS account in under 2 minutes. No credit card required. Get instant access to lead discovery, outreach, and pipeline tools."
  },
  {
    name: "Describe your ideal customer",
    text: "Tell SalesOS who you're looking for in plain English—job titles, industries, company size, location. No complex filters needed."
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
        description="AI-powered lead discovery, personalized outreach, pipeline management, and sales coaching—all in one platform. Your first lead in under 2 minutes. 14-day free trial."
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
            {/* 1. Hero (Above the Fold) */}
            <HeroSection />
            
            {/* 1b. Works with your stack */}
            <TrustedByBar />
            
            {/* 1c. Stack comparison */}
            <StackComparisonSection />
            
            
            {/* 3. How it works */}
            <HowItWorks />
            
            {/* 4. Feature → Outcome Mapping */}
            <ModulesSection />
            
            {/* 5. Differentiation - "Not another bloated CRM" */}
            <DifferentiationSection />
            
            {/* 6. Demo */}
            <Demo />
            
            {/* 7. Trust & Credibility */}
            <TestimonialsSection />
            
            {/* 8. Mid-page CTA */}
            <MidPageCTA />
            
            {/* 9. Integrations */}
            <IntegrationsSection />
            
            {/* 10. Pricing & Fit */}
            <PricingTeaser />
            
            {/* 11. FAQ */}
            <FAQSection />
            
            {/* 12. Final CTA */}
            <FinalCTA />
          </article>
        </main>
        
        {/* Footer */}
        <FooterSection />
      </div>
    </>
  );
};

export default Index;
