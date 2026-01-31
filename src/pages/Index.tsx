import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Testimonials } from "@/components/Testimonials";
import { Integrations } from "@/components/Integrations";
import { Demo } from "@/components/Demo";
import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";
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


// AEO: Define clear, structured content for AI answer engines
const gettingStartedSteps = [
  {
    name: "Sign up for a free trial",
    text: "Create your SalesOS account in under 2 minutes. No credit card required. Get instant access to all features including AI lead generation and email automation."
  },
  {
    name: "Import or find leads",
    text: "Import your existing leads via CSV or use our AI-powered lead discovery to find prospects that match your ideal customer profile. Our system scores each lead automatically."
  },
  {
    name: "Set up email templates",
    text: "Create personalized email templates or let our AI generate high-converting outreach messages based on each prospect's profile and company data."
  },
  {
    name: "Configure automations",
    text: "Set up automated workflows for lead nurturing, follow-ups, and deal stage transitions. Save hours every week with intelligent automation."
  },
  {
    name: "Start closing deals",
    text: "Use the visual pipeline to track deals, get AI coaching insights, and close more deals faster. Most users see results within the first week."
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
  return (
    <>
      <SEOHead 
        title="SalesOS - AI-Powered Sales Operating System | Close More Deals"
        description="Close more deals with SalesOS. AI-powered lead generation, intelligent outreach automation, automated scheduling, and real-time sales coaching. Trusted by 500+ SaaS companies. Start your free 14-day trial today."
        keywords="sales automation, AI sales, lead generation, CRM, sales intelligence, email automation, sales coaching, SaaS sales, B2B sales, sales pipeline, AI lead scoring, best sales software 2025"
        canonicalUrl="https://salesos.alephwavex.io/"
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
        description="Learn how to set up SalesOS and start closing more deals with AI-powered sales automation in just 5 easy steps."
        steps={gettingStartedSteps}
        totalTime="PT10M"
      />
      
      {/* AEO: ItemList for feature discovery */}
      <ItemListSchema 
        name="SalesOS Key Features"
        items={keyFeatures}
      />
      
      <div className="min-h-screen bg-background text-foreground relative">
        <Navbar />
        <main itemScope itemType="https://schema.org/WebPage">
          <article>
            <Hero />
            <Features />
            <Integrations />
            <Demo />
            <Testimonials />
            <FAQ />
          </article>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
