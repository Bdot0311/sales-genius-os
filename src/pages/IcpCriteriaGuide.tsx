import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div
      className="w-6 h-6 rounded-full border-2 animate-spin"
      style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }}
    />
  </div>
);

const faqs = [
  {
    question: "What are ICP criteria for revenue operations?",
    answer:
      "ICP (Ideal Customer Profile) criteria are the concrete, measurable attributes revenue operations teams use to decide which accounts to prioritize. For B2B RevOps that usually means firmographic filters (industry, company size, revenue, geography), technographic filters (the tools an account already runs), and behavioral signals (hiring, funding, product usage, intent). RevOps owns the definition because it feeds every downstream system — routing, scoring, forecasting, and quota planning.",
  },
  {
    question: "How is an ICP different from a buyer persona?",
    answer:
      "The ICP describes the account you want to sell to; the persona describes the human inside that account who signs, uses, or blocks the deal. RevOps teams need both, but the ICP comes first — you cannot score a persona at a company that never should have entered the pipeline.",
  },
  {
    question: "What firmographic criteria matter most?",
    answer:
      "Industry (NAICS or SIC codes), employee count, annual revenue, funding stage, growth rate, and headquarters geography. Start with three to five hard filters that describe your best twenty closed-won accounts, then add tiebreakers instead of stacking more hard filters.",
  },
  {
    question: "How should RevOps score intent signals?",
    answer:
      "Weight intent by recency and specificity. A hiring signal for a role that owns your category (e.g. a company hiring a Head of Revenue Operations) is worth more than generic content downloads. Combine third-party intent (topic surges from B2B intent providers) with first-party signals (site visits, pricing page views, demo requests) inside a single normalized 0–100 score.",
  },
  {
    question: "How often should the ICP be refreshed?",
    answer:
      "Review the ICP every quarter against closed-won and closed-lost data from the previous 90 days. Recalibrate weights whenever win rate on the top scoring tier drops more than 15% quarter over quarter, when the sales motion changes (new segment, new region, PLG bolt-on), or when average contract value shifts materially.",
  },
  {
    question: "What tools does a RevOps team need to operationalize the ICP?",
    answer:
      "A source of truth for account data (CRM plus an enrichment layer), a scoring engine that can combine firmographic, technographic, and intent signals, a routing rule set that assigns accounts to the right rep automatically, and a reporting layer that shows conversion by ICP tier. OutReign consolidates the enrichment, scoring, and routing pieces into one workflow.",
  },
];

const IcpCriteriaGuide = () => {
  return (
    <>
      <SEOHead
        title="ICP Criteria for Revenue Operations: The Complete 2026 Guide | OutReign"
        description="How B2B revenue operations teams define, score, and operationalize an Ideal Customer Profile — firmographic filters, intent signals, scoring frameworks, and quarterly refresh workflows."
        keywords="icp criteria for revenue operations, ideal customer profile, revenue operations, icp scoring, b2b lead scoring, firmographic scoring, intent-based scoring, revops icp"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: "Guides", url: "https://outreign.io/guides" },
          {
            name: "ICP Criteria for Revenue Operations",
            url: "https://outreign.io/guides/icp-criteria-revenue-operations",
          },
        ]}
      />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="icp-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)",
              }}
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl relative z-10">
              <p className="font-serif italic font-thin text-base text-purple-500 mb-5 text-center">
                Revenue Operations Guide
              </p>
              <h1
                id="icp-heading"
                className="font-display mb-6 text-center text-foreground"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", lineHeight: 1.05 }}
              >
                ICP Criteria for Revenue Operations
              </h1>
              <p className="text-lg text-muted-foreground mb-8 text-center max-w-2xl mx-auto">
                A practical framework for defining, scoring, and refreshing the Ideal Customer
                Profile — the definition RevOps teams need before routing, scoring, or forecasting
                anything else.
              </p>
            </div>
          </section>

          {/* Body */}
          <article className="container mx-auto px-5 sm:px-6 max-w-3xl pb-24 text-foreground/90 space-y-10 leading-relaxed">
            <section aria-labelledby="why">
              <h2 id="why" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Why RevOps owns the ICP
              </h2>
              <p>
                Marketing sourced the lead. Sales closed the deal. But the definition of who
                belongs in the pipeline — and who never should have entered it — sits with revenue
                operations. RevOps is the only function that touches every system the ICP feeds:
                the CRM, the enrichment layer, the scoring engine, routing, forecasting, and
                quota planning. When those systems disagree on what a good-fit account looks like,
                the pipeline fills with noise and win rate collapses.
              </p>
              <p className="mt-3">
                A clear ICP is a written definition, not a shared instinct. It lists the
                firmographic filters that decide qualification, the signals that increase or
                decrease priority, and the thresholds that trigger routing. Everything else in the
                RevOps stack is downstream of that document.
              </p>
            </section>

            <section aria-labelledby="firmographics">
              <h2 id="firmographics" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 1 — Start with firmographic filters
              </h2>
              <p>
                Firmographics are the hard filters. Any account that misses one should not enter
                the qualified pipeline, regardless of intent. Keep the list short: three to five
                filters is enough to describe most B2B ICPs.
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  <strong>Industry</strong> — Use NAICS or SIC codes rather than free text. Free
                  text drifts across enrichment providers and breaks downstream reports.
                </li>
                <li>
                  <strong>Company size</strong> — Employee count is more reliable than revenue for
                  private companies; combine both when you can.
                </li>
                <li>
                  <strong>Geography</strong> — Filter on the legal HQ, not the billing address.
                  Sales tax, GDPR, and support coverage all follow the HQ.
                </li>
                <li>
                  <strong>Funding or growth stage</strong> — A Series B SaaS company buys
                  differently to a bootstrapped agency. Bucket accounts into two or three growth
                  tiers.
                </li>
                <li>
                  <strong>Business model</strong> — B2B versus B2C, subscription versus
                  transactional, self-serve versus sales-led. This filter alone eliminates the
                  most misrouted deals.
                </li>
              </ul>
            </section>

            <section aria-labelledby="technographics">
              <h2 id="technographics" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 2 — Layer technographic and behavioral signals
              </h2>
              <p>
                Firmographics tell you who qualifies. Technographics and behaviour tell you who to
                call first. These are weighted signals, not hard filters — they move a qualified
                account up or down the priority list.
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  <strong>Installed tools</strong> — The presence (or absence) of a competitor, a
                  complementary product, or a required integration.
                </li>
                <li>
                  <strong>Hiring signals</strong> — Roles that own your category. A company
                  posting a Head of Revenue Operations role is buying a RevOps stack in the next
                  two quarters.
                </li>
                <li>
                  <strong>Funding events</strong> — Fresh capital shortens sales cycles. A
                  Series A within the last 90 days is a strong compounding signal.
                </li>
                <li>
                  <strong>Product or web behaviour</strong> — Pricing page visits, demo requests,
                  documentation reads, and repeat sessions.
                </li>
                <li>
                  <strong>Third-party intent</strong> — Topic surges from intent data providers.
                  Weight recency: a surge from the last 14 days is worth much more than a 90-day
                  average.
                </li>
              </ul>
            </section>

            <section aria-labelledby="scoring">
              <h2 id="scoring" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 3 — Move from filters to a normalized score
              </h2>
              <p>
                A binary "in ICP / out of ICP" decision is easy to build and impossible to
                prioritize. Convert every signal into a normalized 0–100 score so routing rules
                can act on tiers instead of thresholds.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-foreground/10">
                      <th className="text-left py-2 pr-4">Tier</th>
                      <th className="text-left py-2 pr-4">Score</th>
                      <th className="text-left py-2">Suggested action</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">Tier 1</td>
                      <td className="py-2 pr-4">80–100</td>
                      <td className="py-2">Named-account motion, human outreach within 24h</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">Tier 2</td>
                      <td className="py-2 pr-4">55–79</td>
                      <td className="py-2">Automated sequence + SDR review</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">Tier 3</td>
                      <td className="py-2 pr-4">30–54</td>
                      <td className="py-2">Nurture, retarget, revisit next quarter</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">Out</td>
                      <td className="py-2 pr-4">&lt; 30</td>
                      <td className="py-2">Suppress from outbound, exclude from forecast</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4">
                Weights are opinions, not facts. Start with equal weights across firmographic,
                technographic, and intent categories, then calibrate quarterly against closed-won
                and closed-lost data.
              </p>
            </section>

            <section aria-labelledby="refresh">
              <h2 id="refresh" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 4 — Refresh the ICP on a fixed cadence
              </h2>
              <p>
                An ICP that never changes is an ICP nobody trusts. Set a recurring quarterly
                review with the same three inputs each time:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  <strong>Closed-won analysis</strong> — What firmographic and behavioural
                  attributes did the last 90 days of new customers share?
                </li>
                <li>
                  <strong>Closed-lost analysis</strong> — Which accounts scored Tier 1 or 2 but
                  never converted, and why?
                </li>
                <li>
                  <strong>Rep feedback</strong> — Which criteria did reps ignore or override, and
                  where were they right to do so?
                </li>
              </ul>
              <p className="mt-3">
                Trigger an off-cycle refresh whenever win rate on Tier 1 drops more than 15%
                quarter over quarter, average contract value shifts materially, or the sales
                motion changes (new segment, new region, new product line).
              </p>
            </section>

            <section aria-labelledby="mistakes">
              <h2 id="mistakes" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Common mistakes RevOps teams make
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Stacking ten hard filters and wondering why the pipeline is empty.</li>
                <li>Treating intent data as a filter instead of a weighted signal.</li>
                <li>Scoring in the CRM with formula fields nobody can audit.</li>
                <li>
                  Refreshing the ICP once a year at kickoff and then leaving it untouched.
                </li>
                <li>
                  Letting marketing, sales, and RevOps each keep a private version of the ICP.
                </li>
              </ul>
            </section>

            <section aria-labelledby="cta" className="pt-6">
              <h2 id="cta" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Operationalize your ICP with OutReign
              </h2>
              <p>
                OutReign combines enrichment, ICP match scoring, and routing in one workflow so
                RevOps teams can move from a written ICP to a live scoring model without gluing
                three tools together. Define the criteria once, and every new account gets
                enriched, scored, and routed automatically.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium text-white"
                  style={{ background: "hsl(261 75% 55%)" }}
                >
                  Start free
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium border border-foreground/15 text-foreground"
                >
                  See pricing
                </Link>
              </div>
            </section>

            <section aria-labelledby="faq" className="pt-6">
              <h2 id="faq" className="text-2xl sm:text-3xl font-display mb-6 text-foreground">
                Frequently asked questions
              </h2>
              <dl className="space-y-6">
                {faqs.map((f) => (
                  <div key={f.question}>
                    <dt className="font-semibold text-foreground mb-1">{f.question}</dt>
                    <dd className="text-muted-foreground">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </article>
        </main>

        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default IcpCriteriaGuide;
