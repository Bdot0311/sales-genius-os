import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Check, X } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const faqs = [
  { question: "Why look for an Apollo alternative?", answer: "Apollo is powerful but priced and built for full SDR teams running boolean searches across enormous filter sets. Founders and lean outbound teams typically need plain-English search, ICP scoring, and AI drafting in one place — without the seat economics." },
  { question: "Is SalesOS cheaper than Apollo?", answer: "SalesOS plans start at $0 and top out at $179/month with prospect, enrichment, and outreach included. Apollo's comparable bundles typically run higher once you add data credits and engagement seats." },
  { question: "Does SalesOS verify emails like Apollo?", answer: "Yes. Every business email is verified via SMTP handshake plus multi-source enrichment before it reaches your list — the same standard Apollo's verified tier offers." },
  { question: "Can I import my Apollo lists?", answer: "Yes. Export from Apollo as CSV and import into SalesOS. Your ICP scores and outreach drafts are generated on the SalesOS side." },
  { question: "Do I have to learn boolean search?", answer: "No. SalesOS is built around plain-English ICP descriptions, not boolean filter trees. That is the core difference for non-technical founders and growth teams." },
];

const compareRows: { feature: string; salesos: string | boolean; apollo: string | boolean }[] = [
  { feature: "Plain-English ICP search", salesos: true, apollo: false },
  { feature: "Boolean / filter-based search", salesos: false, apollo: true },
  { feature: "SMTP-verified business emails", salesos: true, apollo: true },
  { feature: "AI-drafted first-touch emails", salesos: true, apollo: "Add-on" },
  { feature: "ICP fit scoring out of the box", salesos: true, apollo: false },
  { feature: "Reply inbox + auto-classification", salesos: true, apollo: "Add-on" },
  { feature: "Free tier", salesos: "Yes — full UI with sample data", apollo: "Limited credits" },
  { feature: "Entry paid plan", salesos: "$39/mo", apollo: "$59/mo (varies)" },
];

const renderCell = (v: string | boolean) => {
  if (v === true) return <Check className="w-5 h-5 text-primary mx-auto" />;
  if (v === false) return <X className="w-5 h-5 text-muted-foreground/50 mx-auto" />;
  return <span className="text-sm">{v}</span>;
};

const ApolloAlternative = () => {
  return (
    <>
      <SEOHead
        title="Apollo Alternative for Founders & Lean Sales Teams | SalesOS"
        description="Looking for an Apollo alternative? SalesOS bundles plain-English lead search, SMTP-verified emails, ICP scoring, and AI outreach from $0. No boolean filters required."
        keywords="apollo alternative, apollo.io alternative, apollo io alternative, alternative to apollo, apollo competitors, apollo replacement, instantly alternative, salesloft alternative, outreach alternative"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Apollo Alternative", url: "https://salesos.alephwavex.io/apollo-alternative" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen text-foreground overflow-x-hidden" style={{ background: "hsl(0 0% 3%)" }}>
        <Navbar />
        <main>
          <section className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-10 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-14" aria-labelledby="apollo-heading">
            <div className="container mx-auto px-4 max-w-5xl text-center">
              <p className="inline-block text-xs uppercase tracking-[0.2em] text-primary/80 mb-4">Apollo Alternative</p>
              <h1 id="apollo-heading" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6">
                The Apollo alternative built for founders, not SDR armies.
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                Plain-English lead search, SMTP-verified emails, ICP scoring, and AI-drafted outreach in a single workflow — from $0. No boolean filters, no five-tool stack.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/auth" className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
                  Try SalesOS free
                </Link>
                <Link to="/pricing" className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-muted/40 transition">
                  Compare pricing
                </Link>
              </div>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="table-heading">
            <div className="container mx-auto px-4 max-w-4xl">
              <h2 id="table-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
                SalesOS vs Apollo
              </h2>
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-left">
                  <thead className="bg-card/60">
                    <tr>
                      <th className="p-4 font-medium">Feature</th>
                      <th className="p-4 font-medium text-center">SalesOS</th>
                      <th className="p-4 font-medium text-center">Apollo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.feature} className="border-t border-border/40">
                        <td className="p-4">{row.feature}</td>
                        <td className="p-4 text-center">{renderCell(row.salesos)}</td>
                        <td className="p-4 text-center">{renderCell(row.apollo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Apollo pricing and feature availability change. Verify on Apollo's site before deciding.
              </p>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="who-heading">
            <div className="container mx-auto px-4 max-w-3xl">
              <h2 id="who-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-6 text-center">
                Who switches to SalesOS
              </h2>
              <ul className="space-y-3">
                {[
                  "Founders running outbound themselves who don't want to learn boolean search",
                  "Lean sales teams paying for Apollo plus a separate sequencer plus a separate inbox tool",
                  "Outbound agencies that need ICP scoring per client without standing up a custom stack",
                  "Operators who want one bill, one data model, and one workflow",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="faq-heading">
            <div className="container mx-auto px-4 max-w-3xl">
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-8 text-center">
                Apollo alternative FAQ
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
              <p className="text-sm text-muted-foreground mb-3">Comparing more than just Apollo?</p>
              <a
                href="/blog/apollo-vs-instantly-vs-salesloft"
                className="inline-flex items-center gap-2 text-base font-semibold text-primary hover:underline"
              >
                Read: Apollo vs Instantly vs Salesloft — which one to actually use →
              </a>
            </div>
          </section>


            <FooterSection />
          </Suspense>
        </main>
      </div>
    </>
  );
};

export default ApolloAlternative;
