import { useNavigate } from "react-router-dom";
import { Check, Minus, ArrowRight } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";

const rows = [
  {
    feature: "Finding prospects",
    apollo: "Boolean search with dozens of filter dropdowns",
    outreign: "Plain English — describe your ICP, get ranked results",
    advantage: "outreign",
  },
  {
    feature: "Lead prioritization",
    apollo: "Raw list sorted by name or company — you prioritize manually",
    outreign: "Every contact scored by ICP fit before you see it",
    advantage: "outreign",
  },
  {
    feature: "Contact database size",
    apollo: "Large — 275M+ contacts (self-reported)",
    outreign: "Smaller — verified contacts sourced from public records and licensed data partnerships",
    advantage: "apollo",
  },
  {
    feature: "Email verification",
    apollo: "Verification included, accuracy varies",
    outreign: "SMTP-verified before delivery — bounces caught before send",
    advantage: "outreign",
  },
  {
    feature: "Email drafting",
    apollo: "Template sequences, limited personalization",
    outreign: "AI drafts from real company signals — news, roles, growth indicators",
    advantage: "outreign",
  },
  {
    feature: "Reply management",
    apollo: "Separate inbox / CRM required",
    outreign: "Built-in reply inbox with AI-suggested responses",
    advantage: "outreign",
  },
  {
    feature: "CRM integrations",
    apollo: "Strong — HubSpot, Salesforce, Pipedrive native",
    outreign: "HubSpot and Salesforce (Growth and above)",
    advantage: "apollo",
  },
  {
    feature: "Dialer / phone outreach",
    apollo: "Includes a dialer",
    outreign: "Email only — no dialer, no phone numbers",
    advantage: "apollo",
  },
  {
    feature: "AI Roleplay Coach",
    apollo: "Not available",
    outreign: "Included on Growth and Pro — practice objection handling before campaigns",
    advantage: "outreign",
  },
  {
    feature: "White-label portal",
    apollo: "Not available",
    outreign: "Available on Agency plan for client reporting",
    advantage: "outreign",
  },
  {
    feature: "Starting price",
    apollo: "$49/user/mo (Basic) — paid annually; free plan with limited credits",
    outreign: "$39/mo (Starter) or free to explore with 10 searches/month",
    advantage: "neutral",
  },
];

const faqs = [
  {
    q: "Is OutReign better than Apollo?",
    a: "Depends on your workflow. Apollo is stronger if you need a massive contact database, a built-in dialer, or deep CRM sync out of the box. OutReign is stronger if you want the system to tell you who to email first — not hand you a list of 10,000 contacts to manually sort.",
  },
  {
    q: "Can I import my Apollo lists into OutReign?",
    a: "Yes. You can import contacts via CSV. OutReign will score them against your ICP profile so you know which ones to prioritize.",
  },
  {
    q: "Does OutReign have as many contacts as Apollo?",
    a: "No. OutReign's database is smaller. The tradeoff: every contact you see is already scored by fit and verified before you reach out. Volume for its own sake isn't the goal.",
  },
  {
    q: "Does OutReign include a dialer?",
    a: "No. OutReign is built exclusively for email outreach. If phone outreach is a core part of your motion, Apollo or a dedicated dialer tool is the better fit.",
  },
  {
    q: "Can I try OutReign without a credit card?",
    a: "Yes. The free plan gives you 10 lead searches per month with no card required.",
  },
];

export default function VsApollo() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="OutReign vs Apollo — Which Should You Use?"
        description="Honest comparison of OutReign and Apollo. Apollo gives you a database. OutReign tells you who to email first. See where each tool wins."
        canonicalUrl="https://outreign.io/vs-apollo"
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
        {/* Hero */}
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
          <p className="font-serif italic text-base mb-4" style={{ color: "hsl(261 75% 65%)" }}>
            Comparison
          </p>
          <h1
            className="font-display font-bold mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            OutReign vs Apollo
          </h1>
          <p className="text-lg font-light leading-relaxed mb-8" style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "56ch", margin: "0 auto 2rem" }}>
            Apollo gives you a database. OutReign tells you who to email first. Both are legitimate tools — the right one depends on where your bottleneck is.
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

        {/* Comparison table */}
        <div className="max-w-5xl mx-auto px-6 pb-20">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid hsl(261 75% 50% / 0.2)" }}
          >
            {/* Header row */}
            <div
              className="grid grid-cols-3 text-sm font-semibold py-4 px-6"
              style={{ background: "hsl(261 75% 50% / 0.1)", borderBottom: "1px solid hsl(261 75% 50% / 0.15)" }}
            >
              <span style={{ color: "hsl(0 0% 100% / 0.5)" }}>Feature</span>
              <span style={{ color: "hsl(0 0% 78%)" }}>Apollo</span>
              <span style={{ color: "hsl(261 75% 70%)" }}>OutReign</span>
            </div>

            {rows.map(({ feature, apollo, outreign, advantage }, i) => (
              <div
                key={feature}
                className="grid grid-cols-3 gap-4 py-4 px-6 text-sm"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "hsl(0 0% 100% / 0.01)",
                }}
              >
                <span className="font-medium" style={{ color: "hsl(0 0% 88%)" }}>{feature}</span>
                <span style={{ color: advantage === "apollo" ? "hsl(0 0% 88%)" : "hsl(0 0% 100% / 0.5)" }}>
                  {advantage === "apollo" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {apollo}
                </span>
                <span style={{ color: advantage === "outreign" ? "hsl(261 75% 72%)" : "hsl(0 0% 100% / 0.5)" }}>
                  {advantage === "outreign" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {outreign}
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* Frame */}
        <div
          className="max-w-3xl mx-auto px-6 pb-20"
          style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}
        >
          <div className="pt-16 text-center mb-12">
            <h2
              className="font-display font-bold mb-4"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
            >
              When to use Apollo. When to use OutReign.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.08)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(0 0% 88%)" }}>Apollo is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You need a large contact database first, qualifying later</li>
                <li>Phone outreach is core to your motion</li>
                <li>Your team relies heavily on CRM native integrations</li>
                <li>You run enrichment at scale on existing lists</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(261 75% 72%)" }}>OutReign is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You want the system to rank who's worth emailing before you see the list</li>
                <li>Email is your primary outbound channel</li>
                <li>You want drafting, reply management, and sequences in one tool</li>
                <li>You're a founder or small team without a dedicated RevOps setup</li>
              </ul>
            </div>
          </div>
        </div>

        {/* FAQ */}
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

        {/* CTA */}
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
            Free plan. No credit card. 10 lead searches included.
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
      </div>
    </>
  );
}
