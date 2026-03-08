import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { Check, Shield, Zap, Users, Headphones } from "lucide-react";

const PricingPage = () => {
  const pricingFAQs = [
    { question: "What are verified prospects?", answer: "Verified prospects are contacts with confirmed, up-to-date data including verified email addresses, job titles, and company information." },
    { question: "Are you charging for searches?", answer: "No. Searches are free. Your plan limit only applies when you access verified prospect data." },
    { question: "What happens when I reach my monthly limit?", answer: "You can still access saved prospects and pipeline features. To contact new prospects, wait for your reset or purchase an add-on." },
    { question: "Can I purchase more verified prospects?", answer: "Yes. Add-on packs: +500 for $49/mo or +1,500 for $119/mo." },
    { question: "Is there a free plan?", answer: "Yes. Explore the full interface for free. Contacting verified prospects requires a paid plan." },
    { question: "Can I upgrade, downgrade, or cancel anytime?", answer: "Yes. Upgrades are instant. Downgrades apply at end of billing cycle." },
    { question: "Is there a money-back guarantee?", answer: "Yes, 30-day money-back guarantee on all paid plans." },
  ];

  const valueProps = [
    {
      icon: Zap,
      title: "Instant Lead Discovery",
      description: "Find qualified prospects in seconds using natural language queries. No complex filters required."
    },
    {
      icon: Users,
      title: "Unlimited Team Members",
      description: "All Pro and Elite plans include unlimited team seats at no extra cost."
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "SOC 2 compliant with AES-256 encryption, SSO, and comprehensive audit logs."
    },
    {
      icon: Headphones,
      title: "Priority Support",
      description: "Get help when you need it with dedicated support channels and faster response times."
    }
  ];

  return (
    <>
      <SEOHead 
        title="Pricing Plans - Free Plan & Paid Plans | SalesOS"
        description="Start free, upgrade when ready. SalesOS plans from $49/month for Growth to $399/month for Elite with 1,500 search credits. No credit card required for free plan."
        keywords="SalesOS pricing, sales software pricing, CRM pricing, lead generation pricing, sales automation cost"
        ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1768238149761-SalesOS full logo.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Pricing", url: "https://salesos.alephwavex.io/pricing" }
      ]} />
      <FAQSchema faqs={pricingFAQs} />
      
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main>
          {/* Hero Section */}
           <section className="pt-24 pb-8 container mx-auto px-6 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Start Free. Scale When Ready.
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
              Explore the full platform with a free account. When you're ready to find leads, 
              choose the plan that fits your workflow, all with a 14-day free trial.
            </p>
            <p className="text-sm text-muted-foreground">
              No credit card for free plan • Cancel anytime • 30-day money-back guarantee
            </p>
          </section>

          {/* Pricing Component */}
          <Pricing />

          {/* Value Props Section */}
          <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-6">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
                Why Teams Choose SalesOS
              </h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                {valueProps.map((prop) => (
                  <div key={prop.title} className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                      <prop.icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-semibold mb-2">{prop.title}</h3>
                    <p className="text-sm text-muted-foreground">{prop.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Comparison Summary */}
          <section className="py-16 container mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">
              All Plans Include
            </h2>
            <div className="max-w-3xl mx-auto">
              <ul className="grid sm:grid-cols-2 gap-4">
                {[
                  "AI-powered lead scoring",
                  "AI Sales Coach",
                  "Visual pipeline management",
                  "AI Outreach Studio",
                  "Smart Deal Pipeline",
                  "Real-time analytics dashboard",
                  "Secure data encryption",
                  "Email support"
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>





          <section className="py-12 border-t border-border">
            <div className="container mx-auto px-6">
              <h2 className="text-xl font-semibold mb-6 text-center">Learn More About SalesOS</h2>
              <nav aria-label="Related pages">
                <ul className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm">
                  <li>
                    <Link to="/" className="text-primary hover:underline">Features Overview</Link>
                  </li>
                  <li>
                    <Link to="/help" className="text-primary hover:underline">Help Center</Link>
                  </li>
                  <li>
                    <Link to="/api-docs" className="text-primary hover:underline">API Documentation</Link>
                  </li>
                  <li>
                    <Link to="/security" className="text-primary hover:underline">Security Practices</Link>
                  </li>
                  <li>
                    <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  </li>
                  <li>
                    <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                  </li>
                </ul>
              </nav>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default PricingPage;
