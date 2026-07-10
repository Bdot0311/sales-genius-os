import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { Copy, Check } from "lucide-react";

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
    question: "What is a B2B Ideal Customer Profile (ICP)?",
    answer:
      "An ICP is a written definition of the company most likely to buy, expand, and stay. It combines firmographics (industry, size, revenue), technographics (stack, tools), operational signals (headcount growth, hiring, funding), and buying triggers. It is not a persona — personas describe individuals; the ICP describes the account those individuals work at.",
  },
  {
    question: "What criteria should a revenue operations ICP include?",
    answer:
      "For revenue operations buyers, focus on: employee count (usually 50–2,000), CRM in use (Salesforce or HubSpot signals maturity), presence of a dedicated RevOps or Sales Ops title on LinkedIn, funding stage (Series B onward), and observable pain signals like fragmented tooling, missed forecast posts, or recent GTM leadership changes.",
  },
  {
    question: "How is an ICP different from a buyer persona?",
    answer:
      "The ICP defines the account you sell to — company traits, industry, revenue, tech stack. The persona defines the person inside that account — role, seniority, goals, objections. You need both, but the ICP comes first: get the account wrong and no persona work will save the deal.",
  },
  {
    question: "How many ICP tiers should I have?",
    answer:
      "Two or three, no more. Tier 1 is your bullseye — every criterion matches, closes fastest, highest ACV. Tier 2 hits most criteria and still converts well. Tier 3 is opportunistic. Anything beyond Tier 3 is a distraction; deprioritize it explicitly.",
  },
  {
    question: "How often should the ICP be updated?",
    answer:
      "Review quarterly against closed-won and closed-lost data. Rewrite it whenever win rate on Tier 1 drops below 25%, sales cycle stretches by more than 30%, or product changes shift who benefits most. The ICP is a living document, not a launch artifact.",
  },
  {
    question: "What signals confirm a company matches my ICP?",
    answer:
      "Beyond firmographics, watch for: recent funding rounds, hiring for roles your product supports (RevOps, SDR leadership, Head of Growth), migrations to a target tech stack, executive changes in the buying committee, and public posts about the exact problem you solve.",
  },
];

const ICP_TEMPLATE = `# Ideal Customer Profile — [Your Company]

## Tier 1 (Bullseye)

### Firmographics
- Industry:            [e.g. B2B SaaS, Series B–D]
- Employee count:      [e.g. 100–500]
- Annual revenue:      [e.g. $10M–$75M ARR]
- Headquarters region: [e.g. North America, EU-27]
- Business model:      [e.g. subscription, mid-market SaaS]

### Technographics
- CRM:                 [e.g. Salesforce or HubSpot]
- Sales engagement:    [e.g. Outreach, Salesloft, Apollo]
- Data / enrichment:   [e.g. ZoomInfo, Clearbit, Apollo]
- Marketing automation:[e.g. Marketo, HubSpot]

### Operational signals
- Dedicated RevOps or Sales Ops role
- Sales team size >= 10 quota-carrying reps
- Marketing team owns pipeline number
- Publicly-stated go-to-market motion (PLG, outbound, hybrid)

### Buying triggers
- Recent funding round (last 6 months)
- New VP of Sales, CRO, or Head of RevOps in the last 90 days
- Migrated CRM in the last 12 months
- Hiring 3+ SDRs / AEs in the last 60 days
- Public complaints about current stack

### Disqualifiers
- Fewer than 25 employees
- No dedicated sales function
- Regulated industries we cannot sell into
- Existing multi-year contract with a direct competitor

## Tier 2 (Strong Fit)
[Same categories — relax 1–2 criteria, usually company size or tech stack.]

## Tier 3 (Opportunistic)
[Only if inbound. Do not spend outbound cycles here.]

## Personas inside the ICP account
- Economic buyer:  [e.g. CRO, VP Sales]
- Champion:        [e.g. Head of RevOps, Director of Sales Ops]
- End user:        [e.g. SDR Manager, Sales Ops Analyst]
- Blocker to watch:[e.g. IT / Security review]

## How we score an account (0–100)
- Firmographic match:   40 pts
- Technographic match:  20 pts
- Buying trigger fired: 25 pts
- Persona identified:   15 pts

Score >= 80  → Tier 1, outbound weekly
Score 60–79  → Tier 2, outbound monthly
Score < 60   → Nurture only
`;

const B2BICPCriteriaGuide = () => {
  const [copied, setCopied] = useState(false);

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(ICP_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([ICP_TEMPLATE], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "b2b-icp-template.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <SEOHead
        title="B2B ICP Criteria & Template: A RevOps Guide to the Ideal Customer Profile | OutReign"
        description="The complete guide to defining a B2B Ideal Customer Profile. ICP criteria for revenue operations, tiering, scoring, buying triggers, and a copy-paste template you can ship this week."
        keywords="icp criteria for revenue operations, b2b icp template, ideal customer profile b2b, icp criteria, icp scoring, revenue operations icp, b2b ideal customer profile template, sales ideal customer profile"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: "Guides", url: "https://outreign.io/guides" },
          { name: "B2B ICP Criteria & Template", url: "https://outreign.io/guides/b2b-icp-criteria-template" },
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
                B2B ICP Criteria & Template
              </h1>
              <p className="text-lg text-muted-foreground mb-8 text-center max-w-2xl mx-auto">
                A revenue operations playbook for defining an Ideal Customer Profile that
                actually filters your pipeline — firmographics, tech stack, buying triggers,
                scoring, and a copy-paste template.
              </p>
            </div>
          </section>

          <article className="container mx-auto px-5 sm:px-6 max-w-3xl pb-24 text-foreground/90 space-y-10 leading-relaxed">
            <section aria-labelledby="what">
              <h2 id="what" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                What an ICP actually is
              </h2>
              <p>
                Your Ideal Customer Profile is a written definition of the <em>account</em> most
                likely to buy, expand, and stay. It is not a wish list, not a persona, and not
                the market you serve today — it is the narrow subset of that market where your
                product wins on repeat.
              </p>
              <p className="mt-3">
                Get it wrong and every downstream RevOps decision compounds the mistake:
                territories are drawn around the wrong accounts, SDRs prospect the wrong logos,
                CS scrambles to save contracts that should never have been signed. Get it right
                and outbound reply rates, win rate, and net retention move together.
              </p>
            </section>

            <section aria-labelledby="criteria">
              <h2 id="criteria" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                ICP criteria for revenue operations
              </h2>
              <p>
                Four layers, in this order. Skip a layer and your ICP fails silently — it looks
                complete on paper but doesn&apos;t filter anything in the CRM.
              </p>

              <h3 className="text-xl font-display mt-6 mb-2 text-foreground">1. Firmographics</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Industry / sub-industry (be specific: &quot;B2B SaaS, Series B–D&quot;, not &quot;tech&quot;)</li>
                <li>Employee count band (100–500 is very different from 500–2,000)</li>
                <li>Annual revenue or ARR</li>
                <li>Geography and regulatory jurisdiction</li>
                <li>Business model (subscription, marketplace, transactional)</li>
              </ul>

              <h3 className="text-xl font-display mt-6 mb-2 text-foreground">2. Technographics</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>CRM (Salesforce vs HubSpot signals GTM maturity and buying power)</li>
                <li>Sales engagement platform in use</li>
                <li>Data / enrichment providers</li>
                <li>Marketing automation stack</li>
              </ul>

              <h3 className="text-xl font-display mt-6 mb-2 text-foreground">3. Operational signals</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Dedicated RevOps, Sales Ops, or Marketing Ops function on LinkedIn</li>
                <li>Quota-carrying rep headcount (>= 10 is a common inflection point)</li>
                <li>Who owns the pipeline number — sales, marketing, or shared</li>
                <li>Stated go-to-market motion (PLG, outbound, hybrid)</li>
              </ul>

              <h3 className="text-xl font-display mt-6 mb-2 text-foreground">4. Buying triggers</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Recent funding (last 6 months)</li>
                <li>New CRO, VP Sales, or Head of RevOps in the last 90 days</li>
                <li>CRM migration in the last 12 months</li>
                <li>Public hiring surge for SDRs / AEs</li>
                <li>Executive posts describing the exact problem you solve</li>
              </ul>
            </section>

            <section aria-labelledby="tiers">
              <h2 id="tiers" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Tier your ICP — no more than three
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-foreground/10">
                      <th className="text-left py-2 pr-4">Tier</th>
                      <th className="text-left py-2 pr-4">Fit</th>
                      <th className="text-left py-2">Motion</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">1 — Bullseye</td>
                      <td className="py-2 pr-4">Every criterion matches</td>
                      <td className="py-2">Weekly outbound, named-account plays</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">2 — Strong</td>
                      <td className="py-2 pr-4">Most criteria match, 1–2 relaxed</td>
                      <td className="py-2">Monthly outbound, sequence-driven</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">3 — Opportunistic</td>
                      <td className="py-2 pr-4">Inbound only</td>
                      <td className="py-2">Nurture, do not spend outbound cycles</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="scoring">
              <h2 id="scoring" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Score every account 0–100
              </h2>
              <p>
                A tiered ICP is the strategy. Scoring is how it survives contact with the CRM.
                Assign point weights per criterion category, sum them, and let the score decide
                the motion — not a rep&apos;s gut.
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Firmographic match — 40 points</li>
                <li>Technographic match — 20 points</li>
                <li>Buying trigger fired — 25 points</li>
                <li>Persona identified in-account — 15 points</li>
              </ul>
              <p className="mt-3">
                Score &gt;= 80 → Tier 1. Score 60–79 → Tier 2. Score &lt; 60 → nurture only. Rebuild
                the weights quarterly against closed-won data.
              </p>
            </section>

            <section aria-labelledby="template">
              <h2 id="template" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Copy-paste template
              </h2>
              <p>
                Fill in the bracketed values, share it with sales and marketing, and treat it as
                a living document. Review quarterly against closed-won and closed-lost.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={copyTemplate}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium text-white"
                  style={{ background: "hsl(261 75% 55%)" }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy template"}
                </button>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium border border-foreground/15 text-foreground"
                >
                  Download .md
                </button>
              </div>
              <pre
                className="mt-6 overflow-x-auto rounded-md border border-foreground/10 p-4 text-xs sm:text-sm text-foreground/90"
                style={{ background: "hsl(261 75% 4%)" }}
              >
                <code>{ICP_TEMPLATE}</code>
              </pre>
            </section>

            <section aria-labelledby="mistakes">
              <h2 id="mistakes" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Common ICP mistakes
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Writing an ICP so wide it doesn&apos;t disqualify anyone.</li>
                <li>Confusing the ICP (the account) with a persona (the person).</li>
                <li>Skipping technographics because the data feels hard to source.</li>
                <li>No explicit disqualifiers — every account looks &quot;kind of&quot; fit.</li>
                <li>Never reviewing it against closed-won and closed-lost data.</li>
              </ul>
            </section>

            <section aria-labelledby="cta" className="pt-6">
              <h2 id="cta" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Turn your ICP into a targeted lead list
              </h2>
              <p>
                OutReign filters lead searches by the same firmographics, technographics, and
                triggers you just wrote down — so the accounts hitting your CRM already match
                the profile.
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

export default B2BICPCriteriaGuide;
