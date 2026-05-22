import { useState, useEffect, useRef } from "react";
import { Check, X, HelpCircle, Coins, Zap, ArrowRight, Bot } from "lucide-react";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { useNavigate } from "react-router-dom";
import { QuickBuyCreditsDialog } from "@/components/dashboard/QuickBuyCreditsDialog";

type BillingInterval = "monthly" | "yearly";

interface PaidPlan {
  key: "starter" | "growth" | "pro" | "agency";
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyTotal: number;
  description: string;
  mainValue: string;
  monthlyProspects: number;
  yearlyProspects: number;
  dailyLimit: string;
  features: string[];
  highlighted?: boolean;
  monthlyPriceId: string;
  yearlyPriceId: string;
}

interface FreePlan {
  key: "free";
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaRoute: string;
}

type Plan = FreePlan | PaidPlan;

const freePlan: FreePlan = {
  key: "free",
  name: "Explore",
  price: "$0",
  period: "",
  description: "Preview the workflow before choosing a paid plan",
  features: [
    "View-only dashboard access",
    "Sample data exploration",
    "Pipeline overview",
    "Analytics summary",
    "Help center access",
  ],
  cta: "Explore the product",
  ctaRoute: "/auth",
};

const paidPlans: PaidPlan[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyPrice: 39,
    yearlyPrice: 31,
    yearlyTotal: 372,
    description: "For solo founders and early outbound",
    mainValue: "Contact up to 1,000 verified prospects",
    monthlyProspects: 1000,
    yearlyProspects: 12000,
    dailyLimit: "100 prospects per day",
    features: [
      "Prospect search & verified emails",
      "ICP Builder (3 profiles)",
      "Email quality checker",
      "AI email generator",
      "Sequence templates",
      "Standard support",
      "AI SDR Agent: not included",
    ],
    monthlyPriceId: STRIPE_PRICE_IDS.starter_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.starter_yearly,
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPrice: 89,
    yearlyPrice: 71,
    yearlyTotal: 852,
    description: "For teams booking meetings consistently",
    mainValue: "Contact up to 2,500 verified prospects",
    monthlyProspects: 2500,
    yearlyProspects: 30000,
    dailyLimit: "250 prospects per day",
    features: [
      "Everything in Starter, plus:",
      "Unified reply inbox with AI drafts",
      "Deliverability dashboard & warmup",
      "ICP lookalike discovery",
      "AI personalized outreach",
      "Priority support",
      "🤖 Growth Agent — 10 AI SDR replies/day",
    ],
    highlighted: true,
    monthlyPriceId: STRIPE_PRICE_IDS.growth_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.growth_yearly,
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPrice: 179,
    yearlyPrice: 143,
    yearlyTotal: 1716,
    description: "For high-volume outbound operations",
    mainValue: "Contact up to 5,000 verified prospects",
    monthlyProspects: 5000,
    yearlyProspects: 60000,
    dailyLimit: "500 prospects per day",
    features: [
      "Everything in Growth, plus:",
      "Sequence branching & A/B testing",
      "Unlimited ICP profiles",
      "CRM integrations",
      "Team collaboration",
      "Premium support",
      "🤖 Pro Agent — 50 AI SDR replies/day + objections + meetings",
    ],
    monthlyPriceId: STRIPE_PRICE_IDS.pro_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.pro_yearly,
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPrice: 249,
    yearlyPrice: 199,
    yearlyTotal: 2388,
    description: "For agencies running outbound for multiple clients",
    mainValue: "Contact up to 15,000 verified prospects",
    monthlyProspects: 15000,
    yearlyProspects: 180000,
    dailyLimit: "1,500 prospects per day",
    features: [
      "Everything in Pro, plus:",
      "White-label client portal",
      "Branded PDF reports for clients",
      "Client portal sharing (no login required)",
      "Referral & reseller program",
      "Priority API access",
      "Dedicated account support",
      "🤖 Elite Agent — 200 AI SDR replies/day, fully autonomous",
    ],
    monthlyPriceId: STRIPE_PRICE_IDS.agency_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.agency_yearly,
  },
];

const comparisonCategories = [
  {
    name: "Verified Prospects",
    features: [
      { name: "Monthly verified prospects", free: "0", starter: "1,000", growth: "2,500", pro: "5,000", agency: "15,000" },
      { name: "Daily prospect limit", free: "0", starter: "100", growth: "250", pro: "500", agency: "1,500" },
      { name: "Prospect search", free: "—", starter: true, growth: true, pro: true, agency: true },
      { name: "Verified email data", free: "—", starter: true, growth: true, pro: true, agency: true },
      { name: "Advanced prospect filters", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Bulk prospect export", free: false, starter: false, growth: true, pro: true, agency: true },
    ],
  },
  {
    name: "ICP & Lead Intelligence",
    features: [
      { name: "ICP Builder", free: false, starter: "3 profiles", growth: "10 profiles", pro: "Unlimited", agency: "Unlimited" },
      { name: "ICP match scoring", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "ICP lookalike discovery", free: false, starter: false, growth: true, pro: true, agency: true },
    ],
  },
  {
    name: "Outreach & Campaigns",
    features: [
      { name: "AI email generator", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "Email quality checker", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "Campaign templates", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "Sequence templates", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "AI personalized outreach", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Sequence branching", free: false, starter: false, growth: false, pro: true, agency: true },
      { name: "Sequence A/B testing", free: false, starter: false, growth: false, pro: true, agency: true },
    ],
  },
  {
    name: "Reply Inbox & Deliverability",
    features: [
      { name: "Unified reply inbox", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "AI draft responses", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Auto reply classification", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Deliverability dashboard", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Mailbox warmup tracker", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "DNS health checker", free: false, starter: false, growth: true, pro: true, agency: true },
    ],
  },
  {
    name: "Pipeline & Analytics",
    features: [
      { name: "Visual pipeline", free: "View only", starter: true, growth: true, pro: true, agency: true },
      { name: "CRM integrations", free: false, starter: false, growth: false, pro: true, agency: true },
      { name: "Team collaboration access", free: false, starter: false, growth: false, pro: true, agency: true },
    ],
  },
  {
    name: "Agency Features",
    features: [
      { name: "White-label client portal", free: false, starter: false, growth: false, pro: false, agency: true },
      { name: "Branded PDF reports", free: false, starter: false, growth: false, pro: false, agency: true },
      { name: "Client portal sharing", free: false, starter: false, growth: false, pro: false, agency: true },
      { name: "Referral & reseller program", free: false, starter: false, growth: false, pro: false, agency: true },
      { name: "Priority API access", free: false, starter: false, growth: false, pro: false, agency: true },
    ],
  },
  {
    name: "AI SDR Agent",
    features: [
      { name: "Agent tier", free: "—", starter: "—", growth: "Growth", pro: "Pro", agency: "Elite" },
      { name: "Daily autonomous replies", free: "—", starter: "—", growth: "10/day", pro: "50/day", agency: "200/day" },
      { name: "Minimum reply delay", free: "—", starter: "—", growth: "30 min", pro: "10 min", agency: "5 min" },
      { name: "Reply to interested prospects", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Deliverability check on replies", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Auto handle objections", free: false, starter: false, growth: false, pro: true, agency: true },
      { name: "Auto book meetings (Calendly)", free: false, starter: false, growth: false, pro: true, agency: true },
    ],
  },
  {
    name: "Support",
    features: [
      { name: "Help center access", free: true, starter: true, growth: true, pro: true, agency: true },
      { name: "Standard support", free: false, starter: true, growth: true, pro: true, agency: true },
      { name: "Priority support", free: false, starter: false, growth: true, pro: true, agency: true },
      { name: "Premium support", free: false, starter: false, growth: false, pro: true, agency: true },
      { name: "Dedicated account manager", free: false, starter: false, growth: false, pro: false, agency: true },
    ],
  },
];

const creditFAQs = [
  { question: "What are verified prospects?", answer: "Verified prospects are contacts with confirmed, up-to-date data including verified email addresses, job titles, and company information. Each prospect you contact counts toward your plan limits." },
  { question: "Are you charging for searches?", answer: "No. Searches throughout the platform are completely free. Your plan limit only applies when you access verified prospect data." },
  { question: "What happens when I reach my limit?", answer: "You'll see a message letting you know you've reached your prospect limit. You can still access all your saved prospects, pipeline, and campaign features. Purchase a one-time credit pack or upgrade your plan to continue." },
  { question: "What about daily limits?", answer: "Each plan has a daily limit to ensure fair usage: Starter (100/day), Growth (250/day), Pro (500/day), Agency (1,500/day). If exceeded, you'll see a message asking you to try again tomorrow." },
  { question: "Can I purchase more verified prospects?", answer: "Yes. Purchase one-time credit packs anytime from your account settings or the pricing page. Choose from packs of 200, 400, or 600 prospects. No recurring commitment, just pay once." },
  { question: "Is there a free plan?", answer: "Yes. The Explore option lets you preview the SalesOS interface, including dashboards, pipeline view, and analytics. Access to verified prospecting and outbound workflows requires a paid plan." },
  { question: "Do you offer yearly billing?", answer: "Yes! Save ~20% with annual billing. With yearly plans, your full annual credit pool is granted upfront: Starter gets 12,000, Growth gets 30,000, and Pro gets 60,000 prospects. Monthly plans reset each billing cycle." },
  { question: "Do unused credits roll over?", answer: "On monthly plans, Starter credits reset each cycle while Growth and Pro credits roll over to the next month. On yearly plans, you receive your full annual pool upfront." },
  { question: "Can I upgrade, downgrade, or cancel anytime?", answer: "Yes. Upgrades happen instantly with your new allocation. Downgrades and cancellations apply at the end of your billing cycle." },
  { question: "Is there a money-back guarantee?", answer: "Yes, we offer a 30-day money-back guarantee on all paid plans. If you're not satisfied, contact support for a full refund." },
  { question: "What is the AI SDR Agent?", answer: "The AI SDR Agent is an autonomous sales rep built into SalesOS. It monitors your Gmail threads, classifies prospect replies (interested, objection, meeting request, etc.), and automatically sends replies in your voice. Available on Growth, Pro, and Agency plans with increasing daily reply limits and capabilities." },
  { question: "What's the difference between Growth, Pro, and Elite Agent?", answer: "Growth Agent (10 replies/day) auto-replies to interested prospects only. Pro Agent (50 replies/day) adds objection handling and automatic meeting booking via Calendly. Elite Agent on Agency (200 replies/day) is the full package — fully autonomous with all capabilities and the shortest reply delay (5 min)." },
  { question: "Does the AI SDR Agent pass a spam/deliverability check?", answer: "Yes. Every reply the agent generates is scanned for spam trigger words before it's sent. If a reply fails the check, it's blocked and logged — your sender reputation is never put at risk by the agent." },
];

const renderFeatureValue = (value: boolean | string) => {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="w-4 h-4 mx-auto" style={{ color: "hsl(261 75% 65%)" }} />
    ) : (
      <X className="w-4 h-4 mx-auto" style={{ color: "hsl(0 0% 100% / 0.2)" }} />
    );
  }
  return <span className="text-sm font-medium" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{value}</span>;
};

const isPaidPlan = (plan: Plan): plan is PaidPlan => plan.key !== "free";

// Design tokens
const card = { background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" } as const;
const hairline = "hsl(261 75% 50% / 0.18)";
const mutedText = "hsl(0 0% 100% / 0.7)";
const accentPurple = "hsl(261 75% 65%)";

export const Pricing = () => {
  const { credits } = useSearchCredits();
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const handleCheckout = async (plan: Plan) => {
    if (!isPaidPlan(plan)) {
      navigate(plan.ctaRoute || "/auth");
      return;
    }
    navigate(`/checkout?plan=${plan.key}&interval=${billingInterval}`);
  };

  const allPlans: Plan[] = [freePlan, ...paidPlans];

  return (
    <section
      ref={sectionRef}
      id="pricing"
      className="relative pt-4 md:pt-6 pb-20 md:pb-32 overflow-hidden"
      style={{ background: "hsl(261 75% 2%)" }}
    >
      {/* Ambient glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 50% / 0.07) 0%, transparent 60%)", filter: "blur(60px)" }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">

        {/* Billing Toggle */}
        <div className="flex justify-center mb-10 md:mb-12">
          <div
            className="inline-flex items-center gap-1 p-1 rounded-full"
            style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
          >
            {(["monthly", "yearly"] as BillingInterval[]).map((interval) => (
              <button
                key={interval}
                onClick={() => setBillingInterval(interval)}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-200"
                style={
                  billingInterval === interval
                    ? { background: "hsl(261 75% 50% / 0.25)", color: "hsl(0 0% 95%)", border: "1px solid hsl(261 75% 50% / 0.35)" }
                    : { color: "hsl(0 0% 100% / 0.7)", border: "1px solid transparent" }
                }
              >
                {interval === "monthly" ? "Monthly" : "Yearly"}
                {interval === "yearly" && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "hsl(261 75% 55% / 0.2)", color: accentPurple, border: "1px solid hsl(261 75% 50% / 0.25)" }}
                  >
                    Save 20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* AI SDR callout banner */}
        <div
          className="max-w-[1400px] mx-auto mb-8 flex items-center gap-4 px-5 py-4 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, hsl(261 75% 50% / 0.12) 0%, hsl(280 80% 50% / 0.08) 100%)",
            border: "1px solid hsl(261 75% 55% / 0.3)",
          }}
        >
          <div
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "hsl(261 75% 50% / 0.2)" }}
          >
            <Bot className="w-5 h-5" style={{ color: accentPurple }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "hsl(0 0% 92%)" }}>
              NEW — AI SDR Agent included on Growth, Pro & Agency
            </p>
            <p className="text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              Your AI sales rep monitors Gmail threads, classifies replies, handles objections, and books meetings — autonomously.
            </p>
          </div>
          <div className="hidden sm:flex gap-2 flex-shrink-0">
            {[
              { label: "Growth", sub: "10/day" },
              { label: "Pro", sub: "50/day" },
              { label: "Elite", sub: "200/day" },
            ].map((t) => (
              <div
                key={t.label}
                className="text-center px-3 py-1.5 rounded-lg"
                style={{ background: "hsl(261 75% 50% / 0.1)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
              >
                <p className="text-xs font-semibold" style={{ color: accentPurple }}>{t.label}</p>
                <p className="text-[10px]" style={{ color: "hsl(0 0% 100% / 0.45)" }}>{t.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5 max-w-[1400px] mx-auto mb-20 md:mb-24">
          {allPlans.map((plan) => {
            const paid = isPaidPlan(plan);
            const isHighlighted = paid && plan.highlighted;
            const displayPrice = paid
              ? billingInterval === "yearly" ? `$${plan.yearlyPrice}` : `$${plan.monthlyPrice}`
              : plan.price;
            const period = paid ? "/mo" : plan.period;
            const billingNote = paid && billingInterval === "yearly"
              ? `$${plan.yearlyTotal.toLocaleString()} billed annually`
              : null;

            return (
              <div
                key={plan.key}
                className="relative flex flex-col rounded-2xl p-6 sm:p-7 transition-all duration-300"
                style={
                  isHighlighted
                    ? {
                        background: "linear-gradient(160deg, hsl(261 75% 22% / 0.7) 0%, hsl(261 75% 12% / 0.8) 100%)",
                        border: "1px solid hsl(261 75% 55% / 0.45)",
                        boxShadow: "0 0 40px hsl(261 75% 50% / 0.12)",
                      }
                    : plan.key === "free"
                    ? { background: "transparent", border: "1px solid hsl(261 75% 50% / 0.1)" }
                    : card
                }
              >
                {isHighlighted && (
                  <div
                    className="absolute -top-px left-1/2 -translate-x-1/2 h-px w-3/4 rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.8), transparent)" }}
                    aria-hidden="true"
                  />
                )}
                {isHighlighted && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: "hsl(261 75% 55%)", color: "white" }}
                  >
                    Most popular
                  </div>
                )}

                {/* Plan name & price */}
                <div className="mb-5">
                  <p
                    className="text-[10px] uppercase tracking-[0.22em] font-medium mb-3"
                    style={{ color: isHighlighted ? "hsl(261 75% 75%)" : "hsl(261 75% 60% / 0.7)" }}
                  >
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span
                      className="text-4xl font-bold font-display"
                      style={{ color: isHighlighted ? "hsl(0 0% 98%)" : "hsl(0 0% 92%)", letterSpacing: "-0.02em" }}
                    >
                      {displayPrice}
                    </span>
                    <span className="text-sm" style={{ color: mutedText }}>{period}</span>
                  </div>
                  {billingNote && (
                    <p className="text-xs mb-2" style={{ color: "hsl(0 0% 100% / 0.3)" }}>{billingNote}</p>
                  )}
                  <p className="text-sm leading-relaxed" style={{ color: isHighlighted ? "hsl(0 0% 100% / 0.6)" : mutedText }}>
                    {plan.description}
                  </p>
                </div>

                {/* Prospect volume callout */}
                {paid && (
                  <div
                    className="rounded-xl px-4 py-3 mb-5"
                    style={{
                      background: isHighlighted ? "hsl(261 75% 55% / 0.15)" : "hsl(261 75% 50% / 0.07)",
                      border: `1px solid ${isHighlighted ? "hsl(261 75% 55% / 0.3)" : "hsl(261 75% 50% / 0.14)"}`,
                    }}
                  >
                    <p className="text-sm font-medium" style={{ color: isHighlighted ? "hsl(0 0% 95%)" : "hsl(0 0% 88%)" }}>
                      {billingInterval === "yearly"
                        ? `${plan.yearlyProspects.toLocaleString()} prospects/year`
                        : `${plan.monthlyProspects.toLocaleString()} prospects/month`}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{plan.dailyLimit}</p>
                  </div>
                )}

                {/* Features */}
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((feature, i) => {
                    const isAgentLine = feature.startsWith("🤖");
                    const isLockedAgent = feature === "AI SDR Agent: not included";
                    if (isLockedAgent) {
                      return (
                        <li key={i} className="flex items-center gap-2 mt-1 pt-2.5" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}>
                          <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "hsl(0 0% 100% / 0.2)" }} />
                          <span className="text-xs" style={{ color: "hsl(0 0% 100% / 0.3)" }}>AI SDR Agent not included</span>
                        </li>
                      );
                    }
                    if (isAgentLine) {
                      return (
                        <li
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1"
                          style={{
                            background: isHighlighted ? "hsl(261 75% 55% / 0.2)" : "hsl(261 75% 50% / 0.1)",
                            border: `1px solid ${isHighlighted ? "hsl(261 75% 55% / 0.35)" : "hsl(261 75% 50% / 0.2)"}`,
                          }}
                        >
                          <Bot className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentPurple }} />
                          <span className="text-xs font-medium leading-snug" style={{ color: isHighlighted ? "hsl(261 75% 85%)" : accentPurple }}>
                            {feature.replace("🤖 ", "")}
                          </span>
                        </li>
                      );
                    }
                    return (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check
                          className="w-4 h-4 flex-shrink-0 mt-0.5"
                          style={{ color: isHighlighted ? "hsl(261 75% 80%)" : accentPurple }}
                        />
                        <span className="text-sm leading-relaxed" style={{ color: isHighlighted ? "hsl(0 0% 100% / 0.8)" : "hsl(0 0% 100% / 0.6)" }}>
                          {feature}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => handleCheckout(plan)}
                  className="w-full h-11 rounded-full text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 group"
                  style={
                    isHighlighted
                      ? { background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))", color: "white" }
                      : plan.key === "free"
                      ? { background: "transparent", color: "hsl(0 0% 100% / 0.5)", border: "1px solid hsl(261 75% 50% / 0.2)" }
                      : { background: "hsl(261 75% 50% / 0.15)", color: "hsl(261 75% 75%)", border: "1px solid hsl(261 75% 50% / 0.3)" }
                  }
                  onMouseEnter={(e) => {
                    if (!isHighlighted && plan.key !== "free") {
                      (e.currentTarget as HTMLElement).style.background = "hsl(261 75% 50% / 0.25)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isHighlighted && plan.key !== "free") {
                      (e.currentTarget as HTMLElement).style.background = "hsl(261 75% 50% / 0.15)";
                    }
                  }}
                >
                  {plan.key === "free" ? "Explore the product" : "Choose this plan"}
                  <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="max-w-7xl mx-auto mb-20 md:mb-24">
          <div className="text-center mb-10">
            <p className="font-serif italic font-thin text-base text-purple-500 mb-3">Compare plans</p>
            <h2
              className="font-display"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
            >
              Everything side by side
            </h2>
          </div>

          <div className="lg:hidden text-center mb-3">
            <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.3)" }}>← Scroll to compare →</p>
          </div>

          <div
            className="overflow-x-auto rounded-2xl"
            style={{ border: "1px solid hsl(261 75% 50% / 0.18)" }}
          >
            <table className="w-full border-collapse min-w-[680px]">
              <thead>
                <tr style={{ background: "hsl(261 75% 50% / 0.06)", borderBottom: `1px solid ${hairline}` }}>
                  <th className="text-left py-4 px-4 sm:px-5 text-xs font-semibold uppercase tracking-wider min-w-[160px] sm:min-w-[200px]" style={{ color: "hsl(0 0% 100% / 0.65)" }}>Feature</th>
                  {["Explore\n$0", "Starter\n$39/mo", "Growth\n$89/mo", "Pro\n$179/mo", "Agency\n$249/mo"].map((label, i) => {
                    const isGrowth = i === 2;
                    const [name, price] = label.split("\n");
                    return (
                      <th
                        key={name}
                        className="text-center py-4 px-3 min-w-[90px] sm:min-w-[110px]"
                        style={isGrowth ? { background: "hsl(261 75% 50% / 0.08)" } : {}}
                      >
                        <div className="text-sm font-semibold" style={{ color: isGrowth ? accentPurple : "hsl(0 0% 90%)" }}>{name}</div>
                        <div className="text-xs mt-0.5" style={{ color: mutedText }}>{price}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {comparisonCategories.map((category, catIndex) => (
                  <>
                    <tr key={`cat-${catIndex}`} style={{ borderBottom: `1px solid ${hairline}`, borderTop: catIndex > 0 ? `1px solid ${hairline}` : undefined }}>
                      <td colSpan={6} className="py-3 px-4 sm:px-5">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: accentPurple }}>
                          <Coins className="w-3.5 h-3.5 flex-shrink-0" />
                          {category.name}
                        </div>
                      </td>
                    </tr>
                    {category.features.map((feature, featureIndex) => (
                      <tr
                        key={`feature-${catIndex}-${featureIndex}`}
                        style={{ borderBottom: `1px solid hsl(261 75% 50% / 0.08)` }}
                      >
                        <td className="py-3 px-4 sm:px-5 text-xs sm:text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>{feature.name}</td>
                        <td className="py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.free)}</td>
                        <td className="py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.starter)}</td>
                        <td className="py-3 px-2 sm:px-3 text-center" style={{ background: "hsl(261 75% 50% / 0.05)" }}>{renderFeatureValue(feature.growth)}</td>
                        <td className="py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.pro)}</td>
                        <td className="py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.agency)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add-ons */}
        <div className="max-w-2xl mx-auto mb-20 md:mb-24 text-center">
          <div
            className="rounded-2xl p-8"
            style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
          >
            <Zap className="w-6 h-6 mx-auto mb-4" style={{ color: accentPurple }} />
            <h3 className="font-display text-xl sm:text-2xl font-bold mb-2" style={{ color: "hsl(0 0% 92%)", letterSpacing: "-0.01em" }}>
              Need more verified prospects?
            </h3>
            <p className="text-sm leading-relaxed mb-6" style={{ color: mutedText }}>
              Purchase one-time credit packs — no commitments, no plan changes.
            </p>
            <button
              onClick={() => setTopupDialogOpen(true)}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
            >
              <Zap className="w-4 h-4" />
              Buy credit pack
            </button>
          </div>
        </div>

        <QuickBuyCreditsDialog open={topupDialogOpen} onOpenChange={setTopupDialogOpen} />

        {/* FAQ */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="font-serif italic font-thin text-base text-purple-500 mb-3">Have questions?</p>
            <h2
              className="font-display"
              style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
            >
              Pricing & plans
            </h2>
          </div>

          <div className="space-y-3">
            {creditFAQs.map((faq, index) => (
              <details
                key={index}
                className="rounded-xl p-5 group"
                style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
              >
                <summary
                  className="font-medium cursor-pointer list-none flex items-center justify-between gap-3 text-sm sm:text-base"
                  style={{ color: "hsl(0 0% 88%)" }}
                >
                  {faq.question}
                  <HelpCircle className="w-4 h-4 flex-shrink-0" style={{ color: "hsl(261 75% 55% / 0.6)" }} />
                </summary>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: mutedText }}>
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
