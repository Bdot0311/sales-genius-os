import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";

const rows = [
  {
    feature: "Primary use case",
    lusha: "Contact data provider — find phone numbers and emails",
    outreign: "End-to-end outbound platform — find, prioritize, email, reply",
    advantage: "outreign",
  },
  {
    feature: "Finding prospects",
    lusha: "Filter search + Chrome extension on LinkedIn",
    outreign: "Plain English — describe your ICP, get ranked results",
    advantage: "outreign",
  },
  {
    feature: "Phone numbers",
    lusha: "Core strength — direct dials and mobile numbers",
    outreign: "Not included — email-only platform",
    advantage: "lusha",
  },
  {
    feature: "Lead prioritization",
    lusha: "Raw list — you decide who to contact",
    outreign: "Every contact scored by ICP fit before you see it",
    advantage: "outreign",
  },
  {
    feature: "Email verification",
    lusha: "Verified emails included",
    outreign: "SMTP-verified before delivery — bounces caught before send",
    advantage: "neutral",
  },
  {
    feature: "Email sending",
    lusha: "Not included — export to your own sender",
    outreign: "Built-in sending with AI drafts from real company signals",
    advantage: "outreign",
  },
  {
    feature: "Reply management",
    lusha: "Not included",
    outreign: "Built-in reply inbox with AI-suggested responses",
    advantage: "outreign",
  },
  {
    feature: "CRM integrations",
    lusha: "Strong — Salesforce, HubSpot, Outreach, Salesloft push",
    outreign: "HubSpot and Salesforce (Growth and above)",
    advantage: "lusha",
  },
  {
    feature: "AI Roleplay Coach",
    lusha: "Not available",
    outreign: "Included on Growth and Pro — practice objection handling before campaigns",
    advantage: "outreign",
  },
  {
    feature: "Starting price",
    lusha: "Free plan with limited credits; paid from ~$36/user/mo billed annually",
    outreign: "$39/mo (Starter) or free to explore with 10 searches/month",
    advantage: "neutral",
  },
];

const faqs = [
  {
    q: "Is OutReign a Lusha alternative?",
    a: "Partially. Lusha is primarily a contact database — especially strong for phone numbers. OutReign covers the sourcing side too, but adds ICP-scoring, email sending, replies, and coaching in one tool. If you only need phone numbers, Lusha is the more direct fit.",
  },
  {
    q: "Does OutReign have phone numbers?",
    a: "No. OutReign is built exclusively for email outreach. Lusha or a dedicated dialer/data tool is a better fit if phone is core to your motion.",
  },
  {
    q: "Can I use Lusha data inside OutReign?",
    a: "Yes. Export contacts from Lusha as CSV and import them into OutReign. Every imported contact is scored against your ICP profile so you know which to prioritize first.",
  },
  {
    q: "How does contact data quality compare?",
    a: "Lusha's dataset is larger and phone-heavy. OutReign focuses on verified business emails sourced from public records and licensed data partnerships — smaller pool, but every contact is scored and SMTP-verified before delivery.",
  },
  {
    q: "Can I try OutReign without a credit card?",
    a: "Yes. The free plan gives you 10 lead searches per month with no card required.",
  },
];

export default function VsLusha() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="OutReign vs Lusha — Which Should You Use?"
        description="Honest comparison of OutReign and Lusha. Lusha gives you contact data. OutReign scores who to email first, drafts, and manages replies. See where each wins."
        canonicalUrl="https://outreign.io/vs-lusha"
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
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
          <p className="font-serif italic text-base mb-4" style={{ color: "hsl(261 75% 65%)" }}>
            Comparison
          </p>
          <h1
            className="font-display font-bold mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            OutReign vs Lusha
          </h1>
          <p className="text-lg font-light leading-relaxed mb-8" style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "56ch", margin: "0 auto 2rem" }}>
            Lusha gives you contact data — especially phone numbers. OutReign scores who to email first, drafts the message, and manages the reply. Different jobs.
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
              <span style={{ color: "hsl(0 0% 78%)" }}>Lusha</span>
              <span style={{ color: "hsl(261 75% 70%)" }}>OutReign</span>
            </div>

            {rows.map(({ feature, lusha, outreign, advantage }, i) => (
              <div
                key={feature}
                className="grid grid-cols-3 gap-4 py-4 px-6 text-sm"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "hsl(0 0% 100% / 0.01)",
                }}
              >
                <span className="font-medium" style={{ color: "hsl(0 0% 88%)" }}>{feature}</span>
                <span style={{ color: advantage === "lusha" ? "hsl(0 0% 88%)" : "hsl(0 0% 100% / 0.7)" }}>
                  {advantage === "lusha" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {lusha}
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
              When to use Lusha. When to use OutReign.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.08)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(0 0% 88%)" }}>Lusha is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>Phone outreach is core to your motion</li>
                <li>You already run sending inside another platform</li>
                <li>You just need direct dials and mobile numbers</li>
                <li>You push contact data straight into an existing CRM stack</li>
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
                <li>You want sourcing, drafting, and replies in one tool</li>
                <li>You're a founder or small team without a dedicated RevOps setup</li>
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
