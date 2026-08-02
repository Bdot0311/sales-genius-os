import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ArrowRight } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const faqs = [
  { question: "Why do people leave Apollo?", answer: "Three reasons come up over and over: the seat + credit pricing gets expensive fast for small teams, boolean search has a learning curve non-technical founders don't want, and the workflow assumes you already have a full SDR stack (dialer, CRM sync, sequencer) — which most lean teams don't." },
  { question: "How long does it take to migrate off Apollo?", answer: "Most teams are running in under an hour. Export your Apollo contacts as CSV, import into OutReign, and your ICP scores + first-touch drafts are generated automatically. Sequences you had in Apollo need to be recreated — OutReign uses AI drafting instead of static templates, so a direct copy usually isn't what you want anyway." },
  { question: "Will I lose my Apollo data if I switch?", answer: "No. Apollo lets you export contacts, lists, and sequence history as CSV. You keep everything. OutReign only reads what you import — nothing is pulled from Apollo automatically." },
  { question: "Is OutReign cheaper than Apollo in practice?", answer: "For solo operators and teams under 5 users, yes — meaningfully. OutReign is $0 to start and $39/mo for the entry paid plan with prospect, enrichment, and outreach included. Apollo's comparable bundle usually runs higher once you add data credits and engagement seats. For 20+ seat SDR orgs the math changes — Apollo's scale pricing can win there." },
  { question: "What if I need the exact Apollo features?", answer: "OutReign doesn't try to replace every Apollo module. It does prospect search, enrichment, ICP scoring, AI drafting, sending, and reply inbox. If your workflow depends on Apollo's dialer, deep CRM integrations, or their intent data, keep Apollo for those and use OutReign alongside — many teams do." },
  { question: "Can I try before I commit?", answer: "Yes. The Explore plan is free forever with 100 real lead searches a month, up to 25 results each, and 100 emails a month. No credit card, no time limit. When you're ready to prospect at volume, the entry paid plan is $39/mo and starts with a 14-day free trial." },
];

const painPoints = [
  {
    title: "Seat pricing that punishes small teams",
    body: "Apollo is priced for orgs with dedicated SDRs. A founder running outbound solo pays the same per-seat rate as a 50-person sales team — plus data credits on top. For lean teams the per-lead economics rarely work out.",
  },
  {
    title: "Boolean search you have to learn",
    body: "Apollo's power comes from stacking filters — job title contains X, company size between Y and Z, technology equals W, excluded industry, and so on. It's genuinely powerful once you master it. Most founders don't want to master it.",
  },
  {
    title: "A stack that assumes you have a stack",
    body: "Apollo works best when it plugs into an existing setup: your CRM, your dialer, your sequencer, your inbox routing. If you don't have those, half of Apollo is dark. You end up paying for a platform and using it like a database.",
  },
  {
    title: "Volume-first, prioritization-later",
    body: "Apollo hands you 10,000 contacts and expects you to figure out who's worth emailing first. That triage work is where lean teams lose the week — and it's the exact thing an ICP-scored feed is supposed to solve.",
  },
];

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const ApolloAlternative = () => {
  return (
    <>
      <SEOHead
        title="Why Switch from Apollo | OutReign"
        description="Switching from Apollo? Here's why lean teams leave, how to migrate in under an hour, and what OutReign does differently. From $0."
        keywords="apollo alternative, apollo.io alternative, apollo io alternative, alternative to apollo, apollo competitors, apollo replacement, switch from apollo, migrate from apollo"
        ogImage="https://outreign.io/outreign-social-card.jpg"
        canonicalUrl="https://outreign.io/apollo-alternative"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Why Switch", url: "https://outreign.io/apollo-alternative" }
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
                Why Switch
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
                Leaving Apollo? Here's what actually changes.
              </h1>
              <p
                className="text-lg font-light max-w-2xl mx-auto mb-10"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
              >
                Apollo is built for full SDR teams. If you're a founder or a lean outbound crew, the seat pricing, boolean search, and multi-tool stack are usually the reason you're looking. This page is about the switch — not another feature grid.
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
                  to="/vs-apollo"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-colors"
                  style={{ border: "1px solid hsl(261 75% 50% / 0.3)", color: "hsl(0 0% 80%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                >
                  See feature-by-feature comparison
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </section>

          {/* Why people leave */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="pain-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl">
              <h2
                id="pain-heading"
                className="font-display text-center mb-3"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                The four reasons people leave Apollo
              </h2>
              <p className="text-center text-sm mb-12 max-w-2xl mx-auto" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                Apollo is a legitimate tool. These aren't complaints — they're mismatches. If none of them are true for you, Apollo is probably the right fit.
              </p>
              <div className="grid sm:grid-cols-2 gap-5">
                {painPoints.map((p) => (
                  <div
                    key={p.title}
                    className="p-6 rounded-xl"
                    style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
                  >
                    <p className="font-semibold mb-2 text-base" style={{ color: "hsl(0 0% 92%)" }}>{p.title}</p>
                    <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>{p.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Migration */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="migrate-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="migrate-heading"
                className="font-display text-center mb-3"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Migrating from Apollo, step by step
              </h2>
              <p className="text-center text-sm mb-12" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                Most teams finish in under an hour. No connector, no data pipeline.
              </p>
              <ol className="space-y-6">
                {[
                  { n: "1", t: "Export from Apollo", b: "In Apollo: Search → your saved lists → Export as CSV. You own the contacts you already paid to enrich." },
                  { n: "2", t: "Import into OutReign", b: "Drag the CSV onto the Leads page. OutReign maps standard columns automatically and flags anything unusual." },
                  { n: "3", t: "Let ICP scoring run", b: "Describe your ideal customer in plain English once. Every imported contact gets a fit score, ranked from best to worst — no manual sorting." },
                  { n: "4", t: "Draft outreach with AI", b: "First-touch emails are generated per contact using real company signals — news, hiring, growth. You review and edit, not write from scratch." },
                  { n: "5", t: "Send and manage replies", b: "Connect your inbox, send from your own domain, and get replies auto-classified in a built-in inbox. No separate sequencer needed." },
                ].map((s) => (
                  <li key={s.n} className="flex gap-4">
                    <span
                      className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold"
                      style={{ background: "hsl(261 75% 50% / 0.15)", color: "hsl(261 75% 72%)", border: "1px solid hsl(261 75% 50% / 0.3)" }}
                    >
                      {s.n}
                    </span>
                    <div>
                      <p className="font-semibold mb-1" style={{ color: "hsl(0 0% 92%)" }}>{s.t}</p>
                      <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>{s.b}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Comparison callout */}
          <section className="py-14" style={divider}>
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <div
                className="p-8 rounded-2xl text-center"
                style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
              >
                <p className="font-serif italic text-sm mb-2" style={{ color: "hsl(261 75% 65%)" }}>Want the detail?</p>
                <h3 className="font-display font-bold mb-3" style={{ fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)", color: "hsl(0 0% 95%)" }}>
                  See OutReign vs Apollo, feature by feature
                </h3>
                <p className="text-sm mb-6 max-w-lg mx-auto" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                  Database size, verification, dialer, CRM depth, pricing — the honest side-by-side, including where Apollo wins.
                </p>
                <Link
                  to="/vs-apollo"
                  className="inline-flex items-center gap-2 text-sm font-semibold transition-colors"
                  style={{ color: "hsl(261 75% 72%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 85%)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 72%)")}
                >
                  Open the OutReign vs Apollo comparison
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
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
                Who actually switches
              </h2>
              <ul className="space-y-4">
                {[
                  "Founders running outbound themselves who don't want to learn boolean filters",
                  "Lean sales teams paying for Apollo plus a separate sequencer plus a separate inbox tool",
                  "Outbound agencies that need ICP scoring per client without standing up a custom stack",
                  "Operators who want one bill, one data model, and one workflow",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      className="mt-2 h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ background: "hsl(261 75% 65%)" }}
                    />
                    <span className="text-base" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm mt-8 text-center italic" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                If you're a 20+ seat SDR org with a working Apollo setup, don't switch. It works.
              </p>
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
                Questions people ask before switching
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
              <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center text-sm font-semibold">
                <Link to="/vs-apollo" style={{ color: "hsl(261 75% 65%)" }}>OutReign vs Apollo</Link>
                <Link to="/vs-instantly" style={{ color: "hsl(261 75% 65%)" }}>OutReign vs Instantly</Link>
                <Link to="/vs-lusha" style={{ color: "hsl(261 75% 65%)" }}>OutReign vs Lusha</Link>
                <Link to="/vs-zoominfo" style={{ color: "hsl(261 75% 65%)" }}>OutReign vs ZoomInfo</Link>
              </div>
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
