import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Testimonials } from "@/components/Testimonials";
import { Integrations } from "@/components/Integrations";
import { Demo } from "@/components/Demo";
import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";
import { SEOHead, OrganizationSchema, SoftwareApplicationSchema, WebSiteSchema } from "@/components/seo";
import { AnimatedBackground } from "@/components/ui/AnimatedBackground";

const Index = () => {
  return (
    <>
      <SEOHead 
        title="SalesOS - AI-Powered Sales Operating System | Close More Deals"
        description="Close more deals with SalesOS. AI-powered lead generation, intelligent outreach automation, automated scheduling, and real-time sales coaching. Trusted by 500+ SaaS companies."
        keywords="sales automation, AI sales, lead generation, CRM, sales intelligence, email automation, sales coaching, SaaS sales, B2B sales, sales pipeline"
        canonicalUrl="https://salesos.com/"
      />
      <OrganizationSchema />
      <SoftwareApplicationSchema />
      <WebSiteSchema />
      
      <div className="min-h-screen bg-transparent text-foreground relative">
        <AnimatedBackground />
        <Navbar />
        <main>
          <Hero />
          <Features />
          <Integrations />
          <Demo />
          <Testimonials />
          <FAQ />
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Index;
