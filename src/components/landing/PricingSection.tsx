import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Prices must match src/components/Pricing.tsx + Stripe config exactly.
const plans = [
  {
    name: "Free",
    tagline: "Explore risk-free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualTotal: 0,
    description: "Explore the platform, no credit card needed",
    prospects: "View-only dashboard",
    cta: "Get started free",
    ctaRoute: "/auth",
    highlighted: false,
    badge: null,
    features: [
      "View-only dashboard access",
      "Sample data exploration",
      "Pipeline overview",
      "Analytics summary",
      "Community support",
    ],
  },
  {
    name: "Starter",
    tagline: "Solo founders & early outbound",
    monthlyPrice: 39,
    annualPrice: 31,
    annualTotal: 372,
    description: "For solo founders and early outbound",
    prospects: "400 verified prospects/mo",
    cta: "Start 14-day trial",
    ctaRoute: "/pricing",
    highlighted: false,
    badge: null,
    features: [
      "400 prospects/mo (4,800/yr on annual)",
      "Prospect search & verified emails",
      "ICP Builder (3 profiles)",
      "Email quality checker",
      "AI email generator",
      "Sequence templates",
      "Standard support",
    ],
  },
  {
    name: "Growth",
    tagline: "Booking meetings consistently",
    monthlyPrice: 89,
    annualPrice: 71,
    annualTotal: 852,
    description: "For teams booking meetings consistently",
    prospects: "1,200 verified prospects/mo",
    cta: "Start 14-day trial",
    ctaRoute: "/pricing",
    highlighted: true,
    badge: "Most popular",
    features: [
      "1,200 prospects/mo (14,400/yr on annual)",
      "Everything in Starter, plus:",
      "Unified reply inbox with AI drafts",
      "Deliverability dashboard & warmup",
      "ICP lookalike discovery",
      "AI personalized outreach",
      "Priority support",
    ],
  },
  {
    name: "Pro",
    tagline: "High-volume outbound ops",
    monthlyPrice: 179,
    annualPrice: 143,
    annualTotal: 1716,
    description: "For high-volume outbound operations",
    prospects: "3,000 verified prospects/mo",
    cta: "Start 14-day trial",
    ctaRoute: "/pricing",
    highlighted: false,
    badge: null,
    features: [
      "3,000 prospects/mo (36,000/yr on annual)",
      "Everything in Growth, plus:",
      "Sequence branching & A/B testing",
      "Unlimited ICP profiles",
      "CRM integrations",
      "Team collaboration",
      "Premium support",
    ],
  },
];

export const PricingSection = () => {
  const [annual, setAnnual] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.08 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="pricing"
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="pricing-tiers-heading"
    >
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 40%, hsl(261 75% 55% / 0.06) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        {/* Header */}
        <div
          className={`text-center mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <h2
            id="pricing-tiers-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
          >
            Simple pricing. No surprises.
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Start free. Upgrade only when you're ready to contact real prospects. 30-day money-back on all paid plans.
          </p>

          {/* Annual toggle */}
          <div className="mt-7 inline-flex items-center gap-0 rounded-xl border border-border/40 overflow-hidden">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 text-sm font-medium transition-all duration-200 ${!annual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 ${annual ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Annual
              <span
                className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 transition-colors duration-200 ${annual ? "bg-white/20 text-white" : "bg-primary/15 text-primary"}`}
              >
                –20%
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`relative rounded-xl p-6 flex flex-col transition-all duration-700 group`}
              style={{
                background: plan.highlighted ? "hsl(261 75% 50% / 0.08)" : "hsl(0 0% 100% / 0.02)",
                border: plan.highlighted
                  ? "1px solid hsl(261 75% 50% / 0.35)"
                  : "1px solid hsl(0 0% 100% / 0.06)",
                boxShadow: plan.highlighted
                  ? "0 0 40px hsl(261 75% 50% / 0.1)"
                  : undefined,
                transitionDelay: `${i * 70}ms`,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(18px)",
              }}
            >
              {plan.badge && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg, hsl(261 75% 55%), hsl(280 80% 65%))",
                    color: "white",
                    boxShadow: "0 0 16px hsl(261 75% 50% / 0.4)",
                  }}
                >
                  {plan.badge}
                </div>
              )}

              {/* Plan name + tagline */}
              <div className="mb-5">
                <p
                  className="text-[10px] uppercase tracking-[0.2em] font-medium mb-1"
                  style={{ color: plan.highlighted ? "hsl(261 75% 68%)" : "hsl(0 0% 100% / 0.35)" }}
                >
                  {plan.tagline}
                </p>
                <h3 className="text-base font-bold text-foreground mb-3">{plan.name}</h3>

                {/* Price */}
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-extrabold tracking-tight text-foreground">
                    ${annual && plan.annualPrice > 0 ? plan.annualPrice : plan.monthlyPrice}
                  </span>
                  {plan.monthlyPrice > 0 && (
                    <span className="text-sm text-muted-foreground mb-1">/mo</span>
                  )}
                  {plan.monthlyPrice === 0 && (
                    <span className="text-sm text-muted-foreground mb-1">/forever</span>
                  )}
                </div>
                {annual && plan.annualTotal > 0 && (
                  <p className="text-[11px] mt-0.5 text-muted-foreground/60">
                    Billed ${plan.annualTotal}/yr · Save ${(plan.monthlyPrice - plan.annualPrice) * 12}
                  </p>
                )}
              </div>

              {/* Prospect highlight */}
              <div
                className="rounded-lg px-3 py-2 mb-5 text-xs font-medium"
                style={{
                  background: plan.highlighted ? "hsl(261 75% 50% / 0.15)" : "hsl(0 0% 100% / 0.04)",
                  color: plan.highlighted ? "hsl(261 75% 72%)" : "hsl(0 0% 100% / 0.55)",
                  border: `1px solid ${plan.highlighted ? "hsl(261 75% 50% / 0.25)" : "hsl(0 0% 100% / 0.06)"}`,
                }}
              >
                {plan.prospects}
              </div>

              {/* CTA */}
              <Button
                onClick={() => navigate(plan.ctaRoute)}
                className={`w-full mb-6 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_hsl(261_75%_50%/0.3)]"
                    : "bg-muted/50 text-foreground hover:bg-muted border border-border/30"
                }`}
                variant={plan.highlighted ? "default" : "outline"}
              >
                {plan.cta}
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>

              {/* Features */}
              <ul className="space-y-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className="w-3.5 h-3.5 mt-0.5 shrink-0"
                      style={{ color: plan.highlighted ? "hsl(261 75% 65%)" : "hsl(0 0% 100% / 0.4)" }}
                    />
                    <span className="text-xs leading-relaxed text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom links */}
        <div
          className={`mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground/60 transition-all duration-700 delay-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
        >
          <span>30-day money-back guarantee on all paid plans</span>
          <span className="hidden sm:block w-1 h-1 rounded-full bg-muted-foreground/30" />
          <button
            onClick={() => navigate("/pricing")}
            className="text-primary hover:text-primary/80 transition-colors underline underline-offset-2 text-sm"
          >
            Compare all features →
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
