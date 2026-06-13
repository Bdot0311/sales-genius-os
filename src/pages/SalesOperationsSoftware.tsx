import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Check, Zap, Target, Inbox, ShieldCheck } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const faqs = [
  { question: "What is sales operations software?", answer: "Sales operations software is the tooling layer revenue teams use to find prospects, score them against an Ideal Customer Profile, enrich contact data, run outbound sequences, and manage replies — without stitching together five disconnected tools." },
  { question: "How is OutReign different from a CRM?", answer: "A CRM stores deals you already have. Sales operations software like OutReign generates the pipeline that fills the CRM — prospect discovery, ICP fit scoring, verified email enrichment, and AI-drafted first-touch outreach in one workflow." },
  { question: "Do I need separate tools for prospecting, enrichment, and sequences?", answer: "No. OutReign replaces the typical sales ops stack — Apollo for search, ZoomInfo for enrichment, Instantly or Salesloft for sequences — with one platform built around plain-English ICP search." },
  { question: "Is this a fit for sales operations planning (S&OP)?", answer: "No. OutReign is built for B2B outbound sales operations — pipeline generation, prospecting, and outreach. It is not inventory or supply-chain S&OP software." },
  { question: "Can I try it before paying?", answer: "Yes. The free tier lets you explore the full workflow with sample data. No credit card required." },
];

const features = [
  { icon: Target, title: "Plain-English ICP search", description: "Describe the buyer you want — title, industry, size, geography, signals — and get ranked prospects without boolean syntax." },
  { icon: ShieldCheck, title: "SMTP-verified enrichment", description: "Every business email is verified via SMTP handshake plus multi-source enrichment before it hits your list." },
  { icon: Zap, title: "AI-drafted first-touch", description: "Personalized opening emails written from each prospect's role, company news, and growth signals." },
  { icon: Inbox, title: "Reply management", description: "Replies auto-classified by intent so your team works the hot ones first." },
];

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const SalesOperationsSoftware = () => {
  return (
    <>
      <SEOHead
        title="Sales Operations Software for B2B Outbound Teams | OutReign"
        description="OutReign is sales operations software built for outbound B2B teams. Plain-English lead search, SMTP-verified emails, AI drafting, and reply management in one platform."
        keywords="sales operations software, sales operations, sales ops, sales management software, sales productivity software, sales operations platform, sales operations tools, B2B sales operations software, outbound sales operations"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Sales Operations Software", url: "https://outreign.io/sales-operations-software" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="sos-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl text-center relative z-10">
              <p className="font-serif italic font-thin text-base text-purple-500 mb-5">
                Sales Operations Software
              </p>
              <h1
                id="sos-heading"
                className="font-display mb-6"
                style={{
                  fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                The sales operations stack,{" "}
                <br className="hidden sm:block" />
                collapsed into one workflow.
              </h1>
              <p
                className="text-lg font-light max-w-2xl mx-auto mb-10"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
              >
                OutReign replaces the prospecting tool, the enrichment tool, the sequencer, and the reply inbox — so revenue teams ship outbound in minutes, not weeks.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full font-semibold text-sm text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
                >
                  Start free
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm font-medium transition-colors"
                  style={{ border: "1px solid hsl(261 75% 50% / 0.3)", color: "hsl(0 0% 80%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                >
                  See pricing
                </Link>
              </div>
            </div>
          </section>

          {/* Feature grid */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="why-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-5xl">
              <h2
                id="why-heading"
                className="font-display text-center mb-4"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Why sales ops teams are consolidating
              </h2>
              <p className="text-center max-w-2xl mx-auto mb-12" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                The average B2B outbound stack runs 5–7 tools. Each has its own seat fee, its own data model, and its own broken hand-off. OutReign replaces the core four with one platform.
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="p-6 rounded-xl transition-colors"
                    style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                  >
                    <f.icon className="w-6 h-6 mb-3" style={{ color: "hsl(261 75% 65%)" }} />
                    <h3 className="text-base font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>{f.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* What it replaces */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="compare-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl">
              <h2
                id="compare-heading"
                className="font-display text-center mb-10"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                What OutReign replaces
              </h2>
              <ul className="space-y-4 max-w-xl mx-auto">
                {[
                  "Apollo or ZoomInfo for prospect search",
                  "Clearbit or Hunter for email verification and enrichment",
                  "Instantly, Salesloft, or Outreach for sequences",
                  "A separate inbox tool for reply triage",
                  "Manual ICP scoring spreadsheets",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "hsl(261 75% 65%)" }} />
                    <span className="text-base" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="text-center mt-10">
                <Link
                  to="/apollo-alternative"
                  className="text-sm transition-colors"
                  style={{ color: "hsl(261 75% 65%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 80%)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")}
                >
                  Compare OutReign vs Apollo →
                </Link>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="faq-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="faq-heading"
                className="font-display text-center mb-10"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Sales operations software FAQ
              </h2>
              <div className="space-y-3">
                {faqs.map((f) => (
                  <details
                    key={f.question}
                    className="p-5 rounded-xl"
                    style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                  >
                    <summary className="font-medium cursor-pointer" style={{ color: "hsl(0 0% 88%)" }}>{f.question}</summary>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{f.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* Related */}
          <section className="py-12" style={divider}>
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl text-center">
              <p className="text-sm mb-3" style={{ color: "hsl(0 0% 100% / 0.6)" }}>Picking between outbound tools?</p>
              <a
                href="/blog/apollo-vs-instantly-vs-salesloft"
                className="inline-flex items-center gap-2 text-base font-semibold transition-colors"
                style={{ color: "hsl(261 75% 65%)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 80%)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")}
              >
                Read: Apollo vs Instantly vs Salesloft — which one to actually use →
              </a>
            </div>
          </section>

          <Suspense fallback={<SectionLoader />}>
            <FooterSection />
          </Suspense>
        </main>
      </div>
    </>
  );
};

export default SalesOperationsSoftware;
