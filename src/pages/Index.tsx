import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { WhoItsFor } from "@/components/WhoItsFor";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { WhyThisExists } from "@/components/WhyThisExists";
import { Proof } from "@/components/Proof";
import { Integrations } from "@/components/Integrations";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { 
  SEOHead, 
  OrganizationSchema, 
  SoftwareApplicationSchema, 
  WebSiteSchema,
  ServiceSchema,
  HowToSchema,
  ItemListSchema
} from "@/components/seo";

// Structured content for SEO
const gettingStartedSteps = [
  {
    name: "Search for leads",
    text: "Type a plain-language query describing who you want to reach. SalesOS searches its database and returns matching leads with verified contact info."
  },
  {
    name: "Review and add to pipeline",
    text: "Preview results, filter as needed, and add leads to your pipeline. Each lead gets enriched with company data and scored automatically."
  },
  {
    name: "Send personalized outreach",
    text: "Write emails or use AI-generated content. Set up multi-step sequences with automatic follow-ups scheduled at optimal times."
  },
  {
    name: "Track deals to close",
    text: "Move deals through your pipeline stages. See every touchpoint and conversation in one place. Close deals and track revenue."
  }
];

const keyFeatures = [
  {
    name: "Lead Search",
    description: "Find leads using natural language queries. Get verified emails, company data, and LinkedIn profiles."
  },
  {
    name: "Email Sequences",
    description: "Send personalized outreach with multi-step sequences and automatic follow-ups."
  },
  {
    name: "Deal Pipeline",
    description: "Drag-and-drop kanban board to track deals through your sales stages."
  },
  {
    name: "Performance Analytics",
    description: "Track open rates, reply rates, meetings booked, and deals closed by campaign and rep."
  },
  {
    name: "Sales Coaching",
    description: "AI-powered insights based on your pipeline data to improve close rates."
  },
  {
    name: "Calendar Sync",
    description: "Connect Google Calendar or Outlook. Leads book time directly from emails."
  }
];

const Index = () => {
  return (
    <>
      <SEOHead 
        title="SalesOS - Sales Execution System | Find Leads, Send Emails, Close Deals"
        description="SalesOS is a sales execution system. Search for leads using plain language, enrich and score them automatically, and send personalized outreach from one place. Start your 14-day free trial."
        keywords="sales execution, lead generation, email sequences, sales pipeline, B2B sales, outbound sales, lead enrichment"
        canonicalUrl="https://salesos.com/"
      />
      
      <OrganizationSchema />
      <SoftwareApplicationSchema />
      <WebSiteSchema />
      <ServiceSchema />
      
      <HowToSchema 
        name="How to use SalesOS for outbound sales"
        description="A step-by-step guide to finding leads, sending outreach, and closing deals with SalesOS."
        steps={gettingStartedSteps}
        totalTime="PT15M"
      />
      
      <ItemListSchema 
        name="SalesOS Features"
        items={keyFeatures}
      />
      
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main>
          <Hero />
          <WhoItsFor />
          <Features />
          <HowItWorks />
          <WhyThisExists />
          <Proof />
          <Integrations />
          <FAQ />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
