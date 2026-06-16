import { useNavigate } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";

const rows = [
  {
    feature: "What it does best",
    instantly: "High-volume email sending with inbox rotation and warmup",
    outreign: "Finding who's worth emailing — scoring and ranking before you write a word",
    advantage: "neutral",
  },
  {
    feature: "Prospect sourcing",
    instantly: "Has a lead database (B2B leads add-on) — basic filters",
    outreign: "Plain-English ICP search with scored, ranked results",
    advantage: "outreign",
  },
  {
    feature: "Lead prioritization",
    instantly: "No scoring — you decide who to contact",
    outreign: "Every prospect scored by ICP fit before it enters your queue",
    advantage: "outreign",
  },
  {
    feature: "Email sending volume",
    instantly: "Built for high volume — warmup, inbox rotation, sending infrastructure",
    outreign: "Solid sending limits per plan; sending infrastructure via Gmail",
    advantage: "instantly",
  },
  {
    feature: "Inbox warmup",
    instantly: "Built-in warmup network",
    outreign: "Deliverability dashboard and warmup included on Growth and above",
    advantage: "instantly",
  },
  {
    feature: "Email verification",
    instantly: "Basic verification",
    outreign: "SMTP-verified before delivery",
    advantage: "outreign",
  },
  {
    feature: "AI email drafting",
    instantly: "Template-based with some personalization variables",
    outreign: "AI drafts from real company signals per contact",
    advantage: "outreign",
  },
  {
    feature: "Reply management",
    instantly: "Centralized inbox for replies",
    outreign: "Built-in reply inbox with AI-suggested responses and thread tracking",
    advantage: "neutral",
  },
  {
    feature: "AI Roleplay Coach",
    instantly: "Not available",
    outreign: "Available on Growth and Pro — practice objection handling before campaigns go out",
    advantage: "outreign",
  },
  {
    feature: "Agency / white-label",
    instantly: "Agency plan available",
    outreign: "White-label portal on Agency plan",
    advantage: "neutral",
  },
  {
    feature: "Starting price",
    instantly: "TODO: verify current Instantly pricing before publishing",
    outreign: "$39/mo (Starter) or free with 10 searches/month",
    advantage: "neutral",
  },
];

const faqs = [
  {
    q: "Is OutReign a replacement for Instantly?",
    a: "Partially. OutReign handles lead discovery, scoring, email drafting, and reply tracking. Instantly specializes in high-volume sending infrastructure. If you're sending thousands of cold emails per day and need inbox rotation at scale, Instantly's sending layer is purpose-built for that. If you want one tool that handles who to email and how to email them, OutReign covers it.",
  },
  {
    q: "Can OutReign replace both Apollo and Instantly?",
    a: "For many founder-led and small teams, yes. OutReign combines prospect search, ICP scoring, email drafting, and reply management. For teams that need a massive contact database (Apollo's strength) or extremely high-volume sending infrastructure (Instantly's strength), you'd be trading depth in those areas.",
  },
  {
    q: "Does OutReign have inbox warming?",
    a: "Yes — a deliverability dashboard and warmup features are included on Growth and Pro plans.",
  },
  {
    q: "Does Instantly score leads by fit?",
    a: "No. Instantly is primarily a sending tool. Lead qualification is something you do before importing contacts. OutReign does that qualification step for you.",
  },
  {
    q: "Can I try OutReign without a credit card?",
    a: "Yes. The free plan gives you 10 lead searches per month with no card required.",
  },
];

export default function VsInstantly() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="OutReign vs Instantly — Which Should You Use?"
        description="Honest comparison of OutReign and Instantly. Instantly is a sender. OutReign is a sender that first tells you who's worth emailing."
        canonicalUrl="https://outreign.io/vs-instantly"
      />

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
            OutReign vs Instantly
          </h1>
          <p className="text-lg font-light leading-relaxed mb-8" style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "56ch", margin: "0 auto 2rem" }}>
            Instantly is a sender. OutReign is a sender that first tells you who's worth sending to. Both are useful — the question is where you want to start.
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
              <span style={{ color: "hsl(0 0% 100% / 0.5)" }}>Feature</span>
              <span style={{ color: "hsl(0 0% 78%)" }}>Instantly</span>
              <span style={{ color: "hsl(261 75% 70%)" }}>OutReign</span>
            </div>

            {rows.map(({ feature, instantly, outreign, advantage }, i) => (
              <div
                key={feature}
                className="grid grid-cols-3 gap-4 py-4 px-6 text-sm"
                style={{
                  borderBottom: i < rows.length - 1 ? "1px solid hsl(261 75% 50% / 0.08)" : undefined,
                  background: i % 2 === 0 ? "transparent" : "hsl(0 0% 100% / 0.01)",
                }}
              >
                <span className="font-medium" style={{ color: "hsl(0 0% 88%)" }}>{feature}</span>
                <span style={{ color: advantage === "instantly" ? "hsl(0 0% 88%)" : "hsl(0 0% 100% / 0.5)" }}>
                  {advantage === "instantly" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {instantly}
                </span>
                <span style={{ color: advantage === "outreign" ? "hsl(261 75% 72%)" : "hsl(0 0% 100% / 0.5)" }}>
                  {advantage === "outreign" && <Check className="inline w-3.5 h-3.5 mr-1 text-green-500" />}
                  {outreign}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs mt-3 text-center" style={{ color: "hsl(0 0% 100% / 0.35)" }}>
            Rows marked TODO contain pricing or feature details that need verification before publishing.
          </p>
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
              When to use Instantly. When to use OutReign.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.08)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(0 0% 88%)" }}>Instantly is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You're sending thousands of emails per day and need robust inbox rotation</li>
                <li>You already have your lists qualified and just need the sending infrastructure</li>
                <li>Warmup at scale is a primary concern</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-6"
              style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
            >
              <p className="font-semibold mb-3" style={{ color: "hsl(261 75% 72%)" }}>OutReign is the better fit if:</p>
              <ul className="space-y-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                <li>You want the system to find AND rank prospects before you send anything</li>
                <li>You want drafting, warmup, and reply management in one place</li>
                <li>You're a founder or SDR who doesn't want to stitch together Apollo + Instantly + a drafting tool</li>
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
