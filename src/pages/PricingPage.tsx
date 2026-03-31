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
    { question: "Do you offer yearly billing?", answer: "Yes! Save ~20% with annual billing. Your full annual credit pool is granted upfront: Starter gets 4,800, Growth gets 14,400, and Pro gets 36,000 prospects." },
    { question: "What happens when I reach my limit?", answer: "You can still access saved prospects and pipeline features. Purchase a one-time credit pack or upgrade your plan to continue contacting new prospects." },
    { question: "Can I purchase more verified prospects?", answer: "Yes. Purchase one-time credit packs anytime: 200 prospects ($37.50), 400 prospects ($67.50), or 600 prospects ($90). No recurring commitment." },
    { question: "Do unused credits roll over?", answer: "On monthly plans, Starter credits reset each cycle while Growth and Pro credits roll over. Yearly plans grant your full annual pool upfront." },
    { question: "Is there a free plan?", answer: "Yes. Explore the full interface for free. Contacting verified prospects requires a paid plan." },
    { question: "Can I upgrade, downgrade, or cancel anytime?", answer: "Yes. Upgrades are instant. Downgrades apply at end of billing cycle." },
    { question: "Is there a money-back guarantee?", answer: "Yes, 30-day money-back guarantee on all paid plans." },
  ];

  const valueProps = [
    {
      icon: Zap,
      title: "ICP-Driven Discovery",
      description: "Build Ideal Customer Profiles and get ranked leads with automatic match scores. Find lookalikes from closed deals."
    },
    {
      icon: Users,
      title: "Unified Reply Inbox",
      description: "All replies auto-classified by intent with AI-drafted responses. Never miss a hot lead again."
    },
    {
      icon: Shield,
      title: "Deliverability Suite",
      description: "Mailbox warmup, DNS health checks, and smart sending rules protect your sender reputation."
    },
    {
      icon: Headphones,
      title: "Pre-Send Quality Checks",
      description: "Every email scanned for spam triggers, readability, and personalization before it leaves your outbox."
    }
  ];

  return (
    <>
      <SEOHead 
        title="SalesOS Pricing - Choose the Right Outbound Plan"
        description="Choose the SalesOS plan that fits your outbound workflow. Starter from $39/month, Growth from $89/month, and Pro from $179/month."
        keywords="SalesOS pricing, outbound sales software pricing, lead generation pricing, B2B prospecting pricing, sales outreach software cost"
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
              Pick the plan that fits your outbound motion
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
              SalesOS is built for founder-led teams, outbound agencies, and B2B sales teams that want a faster path from ICP definition to live outreach.
            </p>
            <p className="text-sm text-muted-foreground">
              Plans from $39/month • Upgrade anytime • 30-day money-back guarantee
            </p>
          </section>

          {/* Pricing Component */}
          <Pricing />

          {/* Value Props Section */}
          <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-6">
              <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
                Why buyers choose SalesOS
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
                  "ICP Builder with lead match scoring",
                  "Email Quality Pre-Send Checker",
                  "Unified Reply Inbox with AI drafts",
                  "Sequence branching and A/B testing",
                  "Deliverability dashboard and warmup",
                  "Visual pipeline management",
                  "AI Sales Coach",
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
