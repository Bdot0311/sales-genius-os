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
    feature: "What it does best",
    rocketreach: "Massive contact database with email/phone lookups by person or company",
    outreign: "Finding, scoring, and drafting outreach to your ideal prospects before you send",
    advantage: "neutral",
  },
  {
    feature: "Search method",
    rocketreach: "Database-centric filters: name, company, title, location, industry",
    outreign: "Plain-English ICP description — describe who you want, get ranked matches",
    advantage: "outreign",
  },
  {
    feature: "Lead prioritization",
    rocketreach: "Raw results — you decide who to contact and in what order",
    outreign: "Every prospect scored by ICP fit before it enters your queue",
    advantage: "outreign",
  },
  {
    feature: "Email verification",
    rocketreach: "Confidence scores on contact data; verification varies",
    outreign: "SMTP-verified before delivery to reduce bounces",
    advantage: "outreign",
  },
  {
    feature: "AI email drafting",
    rocketreach: "Not included — you export data and write elsewhere",
    outreign: "AI drafts from real company signals per contact",
    advantage: "outreign",
  },
  {
    feature: "Outreach workflow",
    rocketreach: "Data export → external sender/spreadsheet needed",
    outreign: "Integrated: search → score → draft → send → reply tracking",
    advantage: "outreign",
  },
  {
    feature: "Chrome extension",
    rocketreach: "Strong LinkedIn and website contact finder",
    outreign: "Not available — search happens inside the app",
    advantage: "rocketreach",
  },
  {
    feature: "Contact database size",
    rocketreach: "Large — hundreds of millions of profiles",
    outreign: "Smaller, scored set focused on verified business contacts",
    advantage: "rocketreach",
  },
  {
    feature: "Reply management",
    rocketreach: "Not included — separate inbox needed",
    outreign: "Built-in reply inbox with AI-suggested responses and thread tracking",
    advantage: "outreign",
  },
  {
    feature: "AI Roleplay Coach",
    rocketreach: "Not available",
    outreign: "Included on Growth and Pro — practice objection handling before campaigns go out",
    advantage: "outreign",
  },
  {
    feature: "Starting price",
    rocketreach: "Paid plans typically start around $70–80/mo per user",
    outreign: "$39/mo (Starter) or free with 100 searches/month",
    advantage: "neutral",
  },
];

const faqs = [
  {
    q: "Is OutReign a RocketReach alternative?",
    a: "Yes, for teams that want more than contact data. OutReign replaces RocketReach's lookup-and-export workflow with a full discovery-to-send process: describe your ICP, get scored prospects, verify emails, and draft outreach in one place. If you only need a phone/email lookup tool and prefer the Chrome extension, RocketReach still has a role.",
  },
  {
    q: "Can I import RocketReach contacts into OutReign?",
    a: "Yes. You can import contacts via CSV and OutReign will score them against your ICP profile so you know which ones to prioritize.",
  },
  {
    q: "Does RocketReach score leads by ICP fit?",
    a: "No. RocketReach gives you contact data and confidence scores. It does not rank which contacts are a strategic fit for your business. OutReign does that scoring step automatically.",
  },
  {
    q: "Does OutReign have a Chrome extension?",
    a: "Not currently. OutReign is built for batch ICP discovery and AI drafting inside the app, not one-off contact lookups on LinkedIn. If your workflow depends on a browser extension, RocketReach is better suited for that step.",
  },
  {
    q: "Can I try OutReign without a credit card?",
    a: "Yes. The free plan gives you 100 lead searches per month with no card required.",
  },
];

export default function VsRocketReach() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="OutReign vs RocketReach — Best RocketReach Alternative?"
        description="Honest comparison of OutReign and RocketReach. RocketReach gives you contact data. OutReign tells you who to email first and writes the message."
        canonicalUrl="https://outreign.io/vs-rocketreach"
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

        {/* Hero */}
        <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
          <p className="font-serif italic text-base mb-4" style={{ color: "hsl(261 75% 65%)" }}>
            Comparison
          </p>
          <h1
            className="font-display font-bold mb-6"
            style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.02em" }}
          >
            OutReign vs RocketReach
          </h1>
          <p className="text-lg font-light leading-relaxed mb-8" style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "56ch", margin: "0 auto 2rem" }}>
            RocketReach is a powerful contact lookup database. OutReign is a full outbound workflow that finds, scores, and drafts outreach to the right prospects. The best RocketReach alternative depends on where you want the work to happen.
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
            <div
              className="grid grid-cols-3 text-sm font-semibold py-4 px-6"
              style={{ background: "hsl(261 75% 50% / 0.1)", borderBottom: "1px solid hsl(261 75% 50% / 0.15)" }}
            >
              <span style={{ color: "hsl(0 0% 100% / 0.7)" }}>Feature</span>
              <span style={{ color: "hsl(0 0% 78%)" }}>RocketReach</span>
              <span style={{ color: "hsl(261 75% 70%)" }}>OutReign</span>
            </div>

            {rows.map(({ feature, rocketreach, outreign, advantage }, i) => (
              <div
                key={feature}
                className="grid grid-cols-3 gap-4 py-4 px-6 text-sm"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "hsl(0 0% 100% / 0.01)",
                }}
              >
                <span className="font-medium" style={{ color: "hsl(0 0% 88%)" }}>{feature}</span>
                <span style={{ color: advantage === "rocketreach" ? "hsl(0 0% 88%)" : "hsl(0 0% 100% / 0.7)" }}>
                  {advantage === "rocketreach" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {rocketreach}
                </span>
                <span style={{ color: advantage === "outreign" ? "hsl(261 75% 72%)" : "hsl(0 0% 100% / 0.7)" }}>
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
              When to use RocketReach. When to use OutReign.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.08)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(0 0% 88%)" }}>RocketReach is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You need one-off email/phone lookups via a Chrome extension</li>
                <li>You already have a separate outreach and reply management tool</li>
                <li>Contact volume is more important than lead qualification</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(261 75% 72%)" }}>OutReign is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You want the system to rank who's worth emailing before you see the list</li>
                <li>You want AI-drafted first-touch emails from real company signals</li>
                <li>You want discovery, verification, sending, and reply tracking in one workflow</li>
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
