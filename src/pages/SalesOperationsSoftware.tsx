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
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const faqs = [
  { question: "What is sales operations software?", answer: "Sales operations software is the tooling layer revenue teams use to find prospects, score them against an Ideal Customer Profile, enrich contact data, run outbound sequences, and manage replies — without stitching together five disconnected tools." },
  { question: "How is SalesOS different from a CRM?", answer: "A CRM stores deals you already have. Sales operations software like SalesOS generates the pipeline that fills the CRM — prospect discovery, ICP fit scoring, verified email enrichment, and AI-drafted first-touch outreach in one workflow." },
  { question: "Do I need separate tools for prospecting, enrichment, and sequences?", answer: "No. SalesOS replaces the typical sales ops stack — Apollo for search, ZoomInfo for enrichment, Instantly or Salesloft for sequences — with one platform built around plain-English ICP search." },
  { question: "Is this a fit for sales operations planning (S&OP)?", answer: "No. SalesOS is built for B2B outbound sales operations — pipeline generation, prospecting, and outreach. It is not inventory or supply-chain S&OP software." },
  { question: "Can I try it before paying?", answer: "Yes. The free tier lets you explore the full workflow with sample data. No credit card required." },
];

const features = [
  { icon: Target, title: "Plain-English ICP search", description: "Describe the buyer you want — title, industry, size, geography, signals — and get ranked prospects without boolean syntax." },
  { icon: ShieldCheck, title: "SMTP-verified enrichment", description: "Every business email is verified via SMTP handshake plus multi-source enrichment before it hits your list." },
  { icon: Zap, title: "AI-drafted first-touch", description: "Personalized opening emails written from each prospect's role, company news, and growth signals." },
  { icon: Inbox, title: "Reply management", description: "Replies auto-classified by intent so your team works the hot ones first." },
];

const SalesOperationsSoftware = () => {
  return (
    <>
      <SEOHead
        title="Sales Operations Software for B2B Outbound Teams | SalesOS"
        description="SalesOS is sales operations software built for outbound B2B teams. Plain-English lead search, SMTP-verified emails, AI drafting, and reply management in one platform."
        keywords="sales operations software, sales operations, sales ops, sales management software, sales productivity software, sales operations platform, sales operations tools, B2B sales operations software, outbound sales operations"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Sales Operations Software", url: "https://salesos.alephwavex.io/sales-operations-software" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen text-foreground overflow-x-hidden" style={{ background: "hsl(0 0% 3%)" }}>
        <Navbar />
        <main>
          <section className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-10 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-14" aria-labelledby="sos-heading">
            <div className="container mx-auto px-4 max-w-5xl text-center">
              <p className="inline-block text-xs uppercase tracking-[0.2em] text-primary/80 mb-4">Sales Operations Software</p>
              <h1 id="sos-heading" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
                The sales operations stack,<br className="hidden sm:block" /> collapsed into one workflow.
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                SalesOS replaces the prospecting tool, the enrichment tool, the sequencer, and the reply inbox — so revenue teams ship outbound in minutes, not weeks.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/auth" className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
                  Start free
                </Link>
                <Link to="/pricing" className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-muted/40 transition">
                  See pricing
                </Link>
              </div>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="why-heading">
            <div className="container mx-auto px-4 max-w-5xl">
              <h2 id="why-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 text-center">
                Why sales ops teams are consolidating
              </h2>
              <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
                The average B2B outbound stack runs 5–7 tools. Each tool has its own seat fee, its own data model, and its own broken hand-off. SalesOS replaces the core four with one platform.
              </p>
              <div className="grid sm:grid-cols-2 gap-6">
                {features.map((f) => (
                  <div key={f.title} className="p-6 rounded-xl border border-border/60 bg-card/40">
                    <f.icon className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="compare-heading">
            <div className="container mx-auto px-4 max-w-4xl">
              <h2 id="compare-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
                What SalesOS replaces
              </h2>
              <ul className="space-y-3">
                {[
                  "Apollo or ZoomInfo for prospect search",
                  "Clearbit or Hunter for email verification and enrichment",
                  "Instantly, Salesloft, or Outreach for sequences",
                  "A separate inbox tool for reply triage",
                  "Manual ICP scoring spreadsheets",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="text-center mt-10">
                <Link to="/apollo-alternative" className="text-primary hover:underline text-sm">
                  Compare SalesOS vs Apollo →
                </Link>
              </div>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="faq-heading">
            <div className="container mx-auto px-4 max-w-3xl">
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
                Sales operations software FAQ
              </h2>
              <div className="space-y-4">
                {faqs.map((f) => (
                  <details key={f.question} className="p-5 rounded-lg border border-border/60 bg-card/40">
                    <summary className="font-medium cursor-pointer">{f.question}</summary>
                    <p className="mt-3 text-sm text-muted-foreground">{f.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="py-12 border-t border-border/40">
            <div className="container mx-auto px-4 max-w-3xl text-center">
              <p className="text-sm text-muted-foreground mb-3">Picking between outbound tools?</p>
              <a
                href="/blog/apollo-vs-instantly-vs-salesloft"
                className="inline-flex items-center gap-2 text-base font-semibold text-primary hover:underline"
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
