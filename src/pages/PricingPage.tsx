import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";

const PricingPage = () => {
  const pricingFAQs = [
    {
      question: "What's included in the free trial?",
      answer: "All plans include a 14-day free trial with full access to features. No credit card required to start."
    },
    {
      question: "Can I change plans later?",
      answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle."
    },
    {
      question: "How do search credits work?",
      answer: "Search credits are used when discovering new leads. Previewing results, enrichment, and exports are free."
    }
  ];

  return (
    <>
      <SEOHead 
        title="Pricing Plans & Free Trial - SalesOS Sales Automation"
        description="Choose the right SalesOS plan for your team. Start with a 14-day free trial. Plans from $149/month for Growth to $799/month for Elite with unlimited leads."
        keywords="SalesOS pricing, sales software pricing, CRM pricing, lead generation pricing, sales automation cost"
        ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1768238149761-SalesOS full logo.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Pricing", url: "https://salesos.alephwavex.io/pricing" }
      ]} />
      <FAQSchema faqs={pricingFAQs} />
      
      <div className="min-h-screen bg-background text-foreground pt-16">
        <Navbar />
        <main>
          <Pricing />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default PricingPage;
