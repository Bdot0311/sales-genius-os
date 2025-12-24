import { useState, useEffect } from "react";
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
import Waitlist from "@/pages/Waitlist";

const LAUNCH_DATE = new Date("2026-01-01T08:00:00-05:00");

const Index = () => {
  const [showWaitlist, setShowWaitlist] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Check if launch date has passed
    const now = new Date();
    if (now >= LAUNCH_DATE) {
      setShowWaitlist(false);
    }

    // Check if user has already seen the launch
    const hasLaunched = localStorage.getItem("salesos_launched");
    if (hasLaunched === "true") {
      setShowWaitlist(false);
    }
  }, []);

  const handleLaunch = () => {
    setIsTransitioning(true);
    localStorage.setItem("salesos_launched", "true");
    setTimeout(() => {
      setShowWaitlist(false);
      setIsTransitioning(false);
    }, 500);
  };

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
      
      {showWaitlist && <Waitlist onSkip={handleLaunch} />}
      
      <div 
        className={`min-h-screen bg-transparent text-foreground relative transition-all duration-1000 ${
          showWaitlist && !isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
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
