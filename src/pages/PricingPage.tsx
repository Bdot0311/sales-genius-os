import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Check, Shield, Zap, Users, Headphones } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const PricingPage = () => {
  const pricingFAQs = [
    { question: "What are verified prospects?", answer: "Verified prospects are contacts with confirmed, up-to-date data including verified email addresses, job titles, and company information." },
    { question: "Are you charging for searches?", answer: "No. Searches are free. Your plan limit only applies when you access verified prospect data." },
    { question: "Do you offer yearly billing?", answer: "Yes! Save ~20% with annual billing. Your full annual credit pool is granted upfront: Starter gets 12,000, Growth gets 30,000, and Pro gets 60,000 prospects." },
    { question: "What happens when I reach my limit?", answer: "You can still access saved prospects and pipeline features. Purchase a one-time credit pack or upgrade your plan to continue contacting new prospects." },
    { question: "Can I purchase more verified prospects?", answer: "Yes. Purchase one-time credit packs anytime: 200 prospects ($37.50), 400 prospects ($67.50), or 600 prospects ($90). No recurring commitment." },
    { question: "Do unused credits roll over?", answer: "On monthly plans, Starter credits reset each cycle while Growth and Pro credits roll over. Yearly plans grant your full annual pool upfront." },
    { question: "Is there a free plan?", answer: "Yes. The Explore plan includes 10 lead searches per month, up to 5 results per search, and 10 emails per month. Upgrade anytime to unlock verified prospecting, enrichment, and full outbound workflows." },
    { question: "Can I upgrade, downgrade, or cancel anytime?", answer: "Yes. Upgrades are instant. Downgrades apply at end of billing cycle." },
    { question: "Is there a money-back guarantee?", answer: "Yes, 30-day money-back guarantee on all paid plans." },
  ];

  const valueProps = [
    {
      icon: Zap,
      title: "ICP-driven discovery",
      description: "Build Ideal Customer Profiles and get ranked leads with automatic match scores. Find lookalikes from closed deals."
    },
    {
      icon: Users,
      title: "Unified reply inbox",
      description: "Replies auto-classified by intent with AI-drafted responses. Never miss a hot lead again."
    },
    {
      icon: Shield,
      title: "Deliverability suite",
      description: "Mailbox warmup, DNS health checks, and smart sending rules protect your sender reputation."
    },
    {
      icon: Headphones,
      title: "Pre-send quality checks",
      description: "Every email scanned for spam triggers, readability, and personalization before it leaves your outbox."
    }
  ];

  return (
    <>
      <SEOHead
        title="SalesOS Pricing — Outbound Plans for Founders & SDR Teams"
        description="SalesOS plans from $0 to $179/month. Find B2B leads, verify emails, and draft outreach without the tool sprawl. No credit card to start."
        keywords="SalesOS pricing, outbound sales software pricing, lead generation pricing, B2B prospecting tool cost, Apollo alternative pricing, cold email tool pricing"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Pricing", url: "https://salesos.alephwavex.io/pricing" }
      ]} />
      <FAQSchema faqs={pricingFAQs} />

      <div
        className="min-h-screen text-foreground overflow-x-hidden"
        style={{ background: "hsl(261 75% 2%)" }}
      >
        <Navbar />
        <main>
          {/* Hero — matches landing page aesthetic */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-10 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-14"
            aria-labelledby="pricing-heading"
          >
            {/* Dot grid */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
              aria-hidden="true"
            />
            {/* Orbs */}
            <div
              className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
              style={{
                background:
                  "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, hsl(261 75% 55% / 0.04) 50%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-80px] right-[-120px] h-[380px] w-[380px] rounded-full hero-orb pointer-events-none sm:h-[500px] sm:w-[500px]"
              style={{
                background:
                  "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.12) 0%, transparent 70%)",
                filter: "blur(50px)",
                animationDelay: "6s",
              }}
              aria-hidden="true"
            />

            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6">
              <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  Pricing · 30-day money-back guarantee
                </span>

                <h1
                  id="pricing-heading"
                  className="font-display mb-5 text-4xl leading-[1.05] sm:text-5xl md:text-6xl"
                  style={{ color: "hsl(0 0% 95%)", fontWeight: 800, letterSpacing: "-0.02em" }}
                >
                  Pick the plan that fits your{" "}
                  <span
                    className="font-display italic animate-shiny"
                    style={{
                      backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                      backgroundSize: "200% auto",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                      filter: "url(#c3-noise)",
                    }}
                  >
                    outbound motion
                  </span>
                </h1>

                <p className="mb-4 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
                  SalesOS is built for founder-led teams, outbound agencies, and
                  B2B sales teams that want a faster path from ICP definition to
                  live outreach.
                </p>

                <p className="text-xs uppercase tracking-[0.22em] text-white/75">
                  Plans from $39 / month · Upgrade anytime
                </p>
              </div>
            </div>
          </section>

          {/* Why buy now — pulled into the dark canvas */}
          <section className="relative container mx-auto px-5 pb-4 sm:px-6">
            <div
              className="max-w-3xl mx-auto rounded-2xl p-6 sm:p-7 text-center"
              style={{
                background: "hsl(261 75% 50% / 0.05)",
                border: "1px solid hsl(261 75% 50% / 0.15)",
              }}
            >
              <h2 className="font-display text-xl sm:text-2xl font-bold mb-2" style={{ color: "hsl(0 0% 92%)", letterSpacing: "-0.01em" }}>
                Why buy now?
              </h2>
              <p className="text-white/80 leading-relaxed text-sm sm:text-base">
                If SalesOS saves your team even a few hours a week on list
                building, lead prioritization, and first-touch drafting, it pays
                for itself fast. The right plan is about how much prospecting
                volume and workflow support you need.
              </p>
            </div>
          </section>

          {/* Pricing Component */}
          <Pricing />

          {/* Value Props — dark canvas */}
          <section
            className="relative overflow-hidden py-16 sm:py-20"
            style={{ background: "hsl(261 75% 2%)" }}
          >
            <div className="container mx-auto px-5 sm:px-6 relative z-10">
              <p className="font-serif italic font-thin text-base text-center text-purple-500 mb-5">
                Why teams pick SalesOS
              </p>
              <h2
                className="font-display text-center mb-10 sm:mb-12"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Everything you need for modern outbound
              </h2>
              <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-4">
                {valueProps.map((prop) => (
                  <div
                    key={prop.title}
                    className="group relative rounded-2xl p-6 transition-colors duration-300"
                    style={{
                      background: "hsl(261 75% 50% / 0.04)",
                      border: "1px solid hsl(261 75% 50% / 0.14)",
                    }}
                  >
                    <div
                      className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4"
                      style={{ background: "hsl(261 75% 55% / 0.12)", color: "hsl(261 75% 65%)" }}
                    >
                      <prop.icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>{prop.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                      {prop.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* All plans include */}
          <section className="py-16 sm:py-20 container mx-auto px-5 sm:px-6">
            <h2
              className="font-display text-center mb-10"
              style={{
                fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 95%)",
              }}
            >
              All plans include
            </h2>
            <div className="max-w-3xl mx-auto">
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
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
                  "Help center access",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <span
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ background: "hsl(261 75% 55% / 0.12)", color: "hsl(261 75% 65%)" }}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                    <span className="text-white/75">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Related pages */}
          <section
            className="py-12 border-t"
            style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
          >
            <div className="container mx-auto px-5 sm:px-6">
              <p className="mb-5 text-center text-[10px] uppercase tracking-[0.25em] text-white/70">
                Learn more about SalesOS
              </p>
              <nav aria-label="Related pages">
                <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
                  {[
                    { to: "/", label: "Features" },
                    { to: "/help", label: "Help Center" },
                    { to: "/api-docs", label: "API Docs" },
                    { to: "/security", label: "Security" },
                    { to: "/terms", label: "Terms" },
                    { to: "/privacy", label: "Privacy" },
                  ].map((item) => (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className="text-white/80 hover:text-white transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </section>
        </main>
        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default PricingPage;
