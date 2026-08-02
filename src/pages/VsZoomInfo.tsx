import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";
import { Navbar } from "@/components/Navbar";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const rows = [
  {
    feature: "Primary use case",
    zoominfo: "Enterprise B2B data platform — intent, org charts, contacts",
    outreign: "End-to-end outbound platform — find, prioritize, email, reply",
    advantage: "neutral",
  },
  {
    feature: "Finding prospects",
    zoominfo: "Advanced filter search across a massive database",
    outreign: "Plain English — describe your ICP, get ranked results",
    advantage: "outreign",
  },
  {
    feature: "Contact database size",
    zoominfo: "Very large — one of the biggest B2B datasets on the market",
    outreign: "Smaller — verified contacts from public records and licensed data partnerships",
    advantage: "zoominfo",
  },
  {
    feature: "Intent data & signals",
    zoominfo: "Strong — buyer intent, technographics, org changes",
    outreign: "Company signals used to draft messages (news, roles, growth)",
    advantage: "zoominfo",
  },
  {
    feature: "Lead prioritization",
    zoominfo: "Filter and score inside the platform — you configure it",
    outreign: "Every contact scored by ICP fit before you see it",
    advantage: "outreign",
  },
  {
    feature: "Email sending",
    zoominfo: "Sending available on higher tiers (Engage)",
    outreign: "Built-in sending with AI drafts from real company signals",
    advantage: "outreign",
  },
  {
    feature: "Reply management",
    zoominfo: "Available on Engage tier",
    outreign: "Built-in reply inbox with AI-suggested responses",
    advantage: "neutral",
  },
  {
    feature: "CRM integrations",
    zoominfo: "Deep — Salesforce, HubSpot, Dynamics, Marketo",
    outreign: "HubSpot and Salesforce (Growth and above)",
    advantage: "zoominfo",
  },
  {
    feature: "AI Sales Coach",
    zoominfo: "Not available",
    outreign: "Included on Growth and up. Sharpen objection handling in your email replies before campaigns go out",
    advantage: "outreign",
  },
  {
    feature: "Contract model",
    zoominfo: "Annual contracts, custom quoted, typically enterprise pricing",
    outreign: "Monthly or annual, self-serve, published pricing",
    advantage: "outreign",
  },
  {
    feature: "Starting price",
    zoominfo: "Custom quote — typically several thousand per year, per seat",
    outreign: "$39/mo (Starter) or free to explore with 100 searches/month",
    advantage: "outreign",
  },
];

const faqs = [
  {
    q: "Is OutReign a ZoomInfo alternative?",
    a: "For small teams and founders, yes. ZoomInfo is built for enterprise revenue orgs with intent data, org charts, and deep integrations — and priced accordingly. OutReign covers sourcing, ICP scoring, sending, and replies in one tool at self-serve pricing.",
  },
  {
    q: "Does OutReign have intent data?",
    a: "Not in the ZoomInfo sense (buying signals, technographics, org changes). OutReign uses public company signals — news, hiring, growth indicators — to draft messages, not to score buying stage.",
  },
  {
    q: "How does contact database size compare?",
    a: "ZoomInfo's dataset is significantly larger. OutReign is smaller but every contact is scored by ICP fit and SMTP-verified before delivery. Different tradeoffs — volume vs. curation.",
  },
  {
    q: "How does pricing compare?",
    a: "ZoomInfo is annual, custom-quoted, typically starting in the low-five-figures per year. OutReign is self-serve from $39/mo, with a free plan that includes 100 lead searches per month.",
  },
  {
    q: "Can I try OutReign without a credit card?",
    a: "Yes. The free plan gives you 100 lead searches per month with no card required.",
  },
];

export default function VsZoomInfo() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="OutReign vs ZoomInfo — Which Should You Use?"
        description="Honest comparison of OutReign and ZoomInfo. ZoomInfo is enterprise B2B data with intent signals. OutReign is self-serve outbound for founders and small teams."
        canonicalUrl="https://outreign.io/vs-zoominfo"
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      }) }} />

      <div
        className="min-h-screen"
        style={{ background: "hsl(261 75% 2%)", color: "hsl(0 0% 92%)" }}
      >
        <Navbar />

        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
          <p className="font-serif italic text-base mb-4" style={{ color: "hsl(261 75% 65%)" }}>
            Comparison
          </p>
          <h1
            className="font-display font-bold mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            OutReign vs ZoomInfo
          </h1>
          <p className="text-lg font-light leading-relaxed mb-8" style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "56ch", margin: "0 auto 2rem" }}>
            ZoomInfo is enterprise B2B data — huge database, intent signals, custom contracts. OutReign is self-serve outbound for founders and small teams. Different buyers.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
          >
            Try OutReign free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="max-w-5xl mx-auto px-6 pb-20">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid hsl(261 75% 50% / 0.2)" }}
          >
            <div
              className="grid grid-cols-3 text-sm font-semibold py-4 px-6"
              style={{ background: "hsl(261 75% 50% / 0.1)", borderBottom: "1px solid hsl(261 75% 50% / 0.15)" }}
            >
              <span style={{ color: "hsl(0 0% 100% / 0.7)" }}>Feature</span>
              <span style={{ color: "hsl(0 0% 78%)" }}>ZoomInfo</span>
              <span style={{ color: "hsl(261 75% 70%)" }}>OutReign</span>
            </div>

            {rows.map(({ feature, zoominfo, outreign, advantage }, i) => (
              <div
                key={feature}
                className="grid grid-cols-3 gap-4 py-4 px-6 text-sm"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "hsl(0 0% 100% / 0.01)",
                }}
              >
                <span className="font-medium" style={{ color: "hsl(0 0% 88%)" }}>{feature}</span>
                <span style={{ color: advantage === "zoominfo" ? "hsl(0 0% 88%)" : "hsl(0 0% 100% / 0.7)" }}>
                  {advantage === "zoominfo" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {zoominfo}
                </span>
                <span style={{ color: advantage === "outreign" ? "hsl(261 75% 72%)" : "hsl(0 0% 100% / 0.7)" }}>
                  {advantage === "outreign" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {outreign}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="max-w-3xl mx-auto px-6 pb-20"
          style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}
        >
          <div className="pt-16 text-center mb-12">
            <h2
              className="font-display font-bold mb-4"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
            >
              When to use ZoomInfo. When to use OutReign.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.08)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(0 0% 88%)" }}>ZoomInfo is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You're an enterprise revenue org with a RevOps team</li>
                <li>Buyer intent and technographics are core to your motion</li>
                <li>You need deep org charts and account-based data</li>
                <li>You already own an annual data budget</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(261 75% 72%)" }}>OutReign is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You're a founder or small team without enterprise budget</li>
                <li>You want the system to rank who's worth emailing before you see the list</li>
                <li>Email is your primary outbound channel</li>
                <li>You prefer self-serve, month-to-month pricing over annual contracts</li>
              </ul>
            </div>
          </div>
        </div>

        <div
          className="max-w-3xl mx-auto px-6 pb-20"
          style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}
        >
          <h2
            className="font-display font-bold text-center pt-16 mb-10"
            style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", letterSpacing: "-0.02em" }}
          >
            Common questions
          </h2>
          <dl className="space-y-8">
            {faqs.map(({ q, a }) => (
              <div key={q}>
                <dt className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>{q}</dt>
                <dd className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>{a}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div
          className="py-20 text-center px-6"
          style={{ borderTop: "1px solid hsl(261 75% 50% / 0.15)" }}
        >
          <h2
            className="font-display font-bold mb-4"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
          >
            Try it and decide for yourself.
          </h2>
          <p className="mb-8 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Free plan. No credit card. 100 lead searches included.
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
          >
            Find your first lead free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
}
