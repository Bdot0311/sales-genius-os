import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const PricingPage = () => {
  return (
    <>
      <SEOHead 
        title="Pricing Plans - SalesOS"
        description="Choose the right SalesOS plan for your team. Start with a 14-day free trial. Plans from $99/month for Growth to $799/month for Elite with unlimited leads."
        keywords="SalesOS pricing, sales software pricing, CRM pricing, lead generation pricing, sales automation cost"
        canonicalUrl="https://salesos.com/pricing"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.com" },
        { name: "Pricing", url: "https://salesos.com/pricing" }
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
