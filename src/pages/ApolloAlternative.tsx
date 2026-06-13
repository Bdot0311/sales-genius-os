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
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const faqs = [
  { question: "Why look for an Apollo alternative?", answer: "Apollo is powerful but priced and built for full SDR teams running boolean searches across enormous filter sets. Founders and lean outbound teams typically need plain-English search, ICP scoring, and AI drafting in one place — without the seat economics." },
  { question: "Is OutReign cheaper than Apollo?", answer: "OutReign plans start at $0 and top out at $179/month with prospect, enrichment, and outreach included. Apollo's comparable bundles typically run higher once you add data credits and engagement seats." },
  { question: "Does OutReign verify emails like Apollo?", answer: "Yes. Every business email is verified via SMTP handshake plus multi-source enrichment before it reaches your list — the same standard Apollo's verified tier offers." },
  { question: "Can I import my Apollo lists?", answer: "Yes. Export from Apollo as CSV and import into OutReign. Your ICP scores and outreach drafts are generated on the OutReign side." },
  { question: "Do I have to learn boolean search?", answer: "No. OutReign is built around plain-English ICP descriptions, not boolean filter trees. That is the core difference for non-technical founders and growth teams." },
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
  if (v === true) return <Check className="w-5 h-5 mx-auto" style={{ color: "hsl(261 75% 65%)" }} />;
  if (v === false) return <X className="w-5 h-5 mx-auto" style={{ color: "hsl(0 0% 100% / 0.2)" }} />;
  return <span className="text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{v}</span>;
};

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const ApolloAlternative = () => {
  return (
    <>
      <SEOHead
        title="Apollo Alternative for Founders & Lean Sales Teams | OutReign"
        description="The Apollo alternative: plain-English lead search, verified emails, ICP scoring, and AI outreach from $0. No boolean filters required."
        keywords="apollo alternative, apollo.io alternative, apollo io alternative, alternative to apollo, apollo competitors, apollo replacement, instantly alternative, salesloft alternative, outreach alternative"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Apollo Alternative", url: "https://outreign.io/apollo-alternative" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="apollo-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl text-center relative z-10">
              <p className="font-serif italic font-thin text-base text-purple-500 mb-5">
                Apollo Alternative
              </p>
              <h1
                id="apollo-heading"
                className="font-display mb-6"
                style={{
                  fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                The Apollo alternative built for founders, not SDR armies.
              </h1>
              <p
                className="text-lg font-light max-w-2xl mx-auto mb-10"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
              >
                Plain-English lead search, SMTP-verified emails, ICP scoring, and AI-drafted outreach in one workflow — from $0. No boolean filters, no five-tool stack.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full font-semibold text-sm text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
                >
                  Try OutReign free
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm font-medium transition-colors"
                  style={{ border: "1px solid hsl(261 75% 50% / 0.3)", color: "hsl(0 0% 80%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                >
                  Compare pricing
                </Link>
              </div>
            </div>
          </section>

          {/* Comparison table */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="table-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl">
              <h2
                id="table-heading"
                className="font-display text-center mb-10"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                OutReign vs Apollo
              </h2>
              <div
                className="overflow-x-auto rounded-xl"
                style={{ border: "1px solid hsl(261 75% 50% / 0.2)" }}
              >
                <table className="w-full text-left">
                  <thead style={{ background: "hsl(261 75% 50% / 0.06)" }}>
                    <tr>
                      <th className="p-4 text-sm font-semibold" style={{ color: "hsl(0 0% 85%)" }}>Feature</th>
                      <th className="p-4 text-sm font-semibold text-center" style={{ color: "hsl(261 75% 65%)" }}>OutReign</th>
                      <th className="p-4 text-sm font-semibold text-center" style={{ color: "hsl(0 0% 55%)" }}>Apollo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((row) => (
                      <tr key={row.feature} style={{ borderTop: "1px solid hsl(261 75% 50% / 0.1)" }}>
                        <td className="p-4 text-sm" style={{ color: "hsl(0 0% 80%)" }}>{row.feature}</td>
                        <td className="p-4 text-center">{renderCell(row.salesos)}</td>
                        <td className="p-4 text-center">{renderCell(row.apollo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs mt-4 text-center" style={{ color: "hsl(0 0% 100% / 0.25)" }}>
                Apollo pricing and feature availability change. Verify on Apollo's site before deciding.
              </p>
            </div>
          </section>

          {/* Who switches */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="who-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="who-heading"
                className="font-display text-center mb-8"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Who switches to OutReign
              </h2>
              <ul className="space-y-4">
                {[
                  "Founders running outbound themselves who don't want to learn boolean search",
                  "Lean sales teams paying for Apollo plus a separate sequencer plus a separate inbox tool",
                  "Outbound agencies that need ICP scoring per client without standing up a custom stack",
                  "Operators who want one bill, one data model, and one workflow",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <Check className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: "hsl(261 75% 65%)" }} />
                    <span className="text-base" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{item}</span>
                  </li>
                ))}
              </ul>
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
                Apollo alternative FAQ
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
              <p className="text-sm mb-3" style={{ color: "hsl(0 0% 100% / 0.6)" }}>Comparing more than just Apollo?</p>
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

export default ApolloAlternative;
