import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const PricingPage = () => {
  return (
    <>
      <SEOHead 
        title="Pricing Plans - SalesOS"
        description="Choose the right SalesOS plan for your team. Start with a 14-day free trial. Plans from $49/month for Growth to $299/month for Elite with unlimited leads."
        keywords="SalesOS pricing, sales software pricing, CRM pricing, lead generation pricing, sales automation cost"
        canonicalUrl="https://salesos.alephwavex.io/pricing"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Pricing", url: "https://salesos.alephwavex.io/pricing" }
      ]} />
      
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
