import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, HelpCircle, Coins, Zap } from "lucide-react";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { QuickBuyCreditsDialog } from "@/components/dashboard/QuickBuyCreditsDialog";

type BillingInterval = 'monthly' | 'yearly';

interface PaidPlan {
  key: 'starter' | 'growth' | 'pro';
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
  key: 'free';
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
  key: 'free',
  name: "Free",
  price: "$0",
  period: "/forever",
  description: "Explore the platform, no credit card needed",
  features: [
    "View-only dashboard access",
    "Sample data exploration",
    "Pipeline overview",
    "Analytics summary",
    "Community support",
  ],
  cta: "Get started free",
  ctaRoute: "/auth",
};

const paidPlans: PaidPlan[] = [
  {
    key: 'starter',
    name: "Starter",
    monthlyPrice: 39,
    yearlyPrice: 31,
    yearlyTotal: 372,
    description: "For solo founders and early outbound",
    mainValue: "Contact up to 400 verified prospects",
    monthlyProspects: 400,
    yearlyProspects: 4800,
    dailyLimit: "50 prospects per day",
    features: [
      "Prospect search",
      "Verified email data",
      "Email export",
      "AI email generator",
      "Campaign templates",
      "Standard support",
    ],
    monthlyPriceId: STRIPE_PRICE_IDS.starter_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.starter_yearly,
  },
  {
    key: 'growth',
    name: "Growth",
    monthlyPrice: 89,
    yearlyPrice: 71,
    yearlyTotal: 852,
    description: "For teams booking meetings consistently",
    mainValue: "Contact up to 1,200 verified prospects",
    monthlyProspects: 1200,
    yearlyProspects: 14400,
    dailyLimit: "150 prospects per day",
    features: [
      "Advanced prospect filters",
      "Bulk prospect export",
      "AI personalized outreach",
      "Campaign automation tools",
      "Priority support",
    ],
    highlighted: true,
    monthlyPriceId: STRIPE_PRICE_IDS.growth_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.growth_yearly,
  },
  {
    key: 'pro',
    name: "Pro",
    monthlyPrice: 179,
    yearlyPrice: 143,
    yearlyTotal: 1716,
    description: "For high-volume outbound operations",
    mainValue: "Contact up to 3,000 verified prospects",
    monthlyProspects: 3000,
    yearlyProspects: 36000,
    dailyLimit: "400 prospects per day",
    features: [
      "Advanced automation features",
      "CRM integrations",
      "Team collaboration access",
      "High-priority data processing",
      "Premium support",
    ],
    monthlyPriceId: STRIPE_PRICE_IDS.pro_monthly,
    yearlyPriceId: STRIPE_PRICE_IDS.pro_yearly,
  },
];


// Feature comparison table data
const comparisonCategories = [
  {
    name: "Verified Prospects",
    features: [
      { name: "Monthly verified prospects", free: "0", starter: "400", growth: "1,200", pro: "3,000" },
      { name: "Daily prospect limit", free: "0", starter: "50", growth: "150", pro: "400" },
      { name: "Prospect search", free: "—", starter: true, growth: true, pro: true },
      { name: "Verified email data", free: "—", starter: true, growth: true, pro: true },
      { name: "Advanced prospect filters", free: false, starter: false, growth: true, pro: true },
      { name: "Bulk prospect export", free: false, starter: false, growth: true, pro: true },
    ]
  },
  {
    name: "Outreach & Campaigns",
    features: [
      { name: "AI email generator", free: false, starter: true, growth: true, pro: true },
      { name: "Campaign templates", free: false, starter: true, growth: true, pro: true },
      { name: "AI personalized outreach", free: false, starter: false, growth: true, pro: true },
      { name: "Campaign automation tools", free: false, starter: false, growth: true, pro: true },
      { name: "Advanced automation features", free: false, starter: false, growth: false, pro: true },
    ]
  },
  {
    name: "Pipeline & Analytics",
    features: [
      { name: "Visual pipeline", free: "View only", starter: true, growth: true, pro: true },
      { name: "CRM integrations", free: false, starter: false, growth: false, pro: true },
      { name: "Team collaboration access", free: false, starter: false, growth: false, pro: true },
      { name: "High-priority data processing", free: false, starter: false, growth: false, pro: true },
    ]
  },
  {
    name: "Support",
    features: [
      { name: "Community support", free: true, starter: true, growth: true, pro: true },
      { name: "Standard support", free: false, starter: true, growth: true, pro: true },
      { name: "Priority support", free: false, starter: false, growth: true, pro: true },
      { name: "Premium support", free: false, starter: false, growth: false, pro: true },
    ]
  },
];

const creditFAQs = [
  {
    question: "What are verified prospects?",
    answer: "Verified prospects are contacts with confirmed, up-to-date data including verified email addresses, job titles, and company information. Each prospect you contact counts toward your plan limits."
  },
  {
    question: "Are you charging for searches?",
    answer: "No. Searches throughout the platform are completely free. Your plan limit only applies when you access verified prospect data."
  },
  {
    question: "What happens when I reach my limit?",
    answer: "You'll see a message letting you know you've reached your prospect limit. You can still access all your saved prospects, pipeline, and campaign features. Purchase a one-time credit pack or upgrade your plan to continue."
  },
  {
    question: "What about daily limits?",
    answer: "Each plan has a daily limit to ensure fair usage: Starter (50/day), Growth (150/day), Pro (400/day). If exceeded, you'll see a message asking you to try again tomorrow."
  },
  {
    question: "Can I purchase more verified prospects?",
    answer: "Yes. Purchase one-time credit packs anytime from your account settings or the pricing page. Choose from packs of 200, 400, or 600 prospects. No recurring commitment, just pay once."
  },
  {
    question: "Is there a free plan?",
    answer: "Yes. The free plan lets you explore the full SalesOS interface, including dashboards, pipeline view, and analytics. Contacting verified prospects requires a paid plan. No credit card needed to sign up."
  },
  {
    question: "Do you offer yearly billing?",
    answer: "Yes! Save ~20% with annual billing. With yearly plans, your full annual credit pool is granted upfront: Starter gets 4,800, Growth gets 14,400, and Pro gets 36,000 prospects. Monthly plans reset each billing cycle, with Growth and Pro credits rolling over."
  },
  {
    question: "Do unused credits roll over?",
    answer: "On monthly plans, Starter credits reset each cycle while Growth and Pro credits roll over to the next month. On yearly plans, you receive your full annual pool upfront to use throughout the year."
  },
  {
    question: "Can I upgrade, downgrade, or cancel anytime?",
    answer: "Yes. Upgrades happen instantly with your new allocation. Downgrades and cancellations apply at the end of your billing cycle."
  },
  {
    question: "Is there a money-back guarantee?",
    answer: "Yes, we offer a 30-day money-back guarantee on all paid plans. If you're not satisfied, contact support for a full refund."
  },
];

// Helper to render feature value in comparison table
const renderFeatureValue = (value: boolean | string) => {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="w-5 h-5 text-primary mx-auto" />
    ) : (
      <X className="w-5 h-5 text-muted-foreground/40 mx-auto" />
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
};

const isPaidPlan = (plan: Plan): plan is PaidPlan => plan.key !== 'free';

export const Pricing = () => {
  const { credits } = useSearchCredits();
  const [topupDialogOpen, setTopupDialogOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleCheckout = async (plan: Plan) => {
    if (!isPaidPlan(plan)) {
      navigate(plan.ctaRoute || '/auth');
      return;
    }

    navigate(`/checkout?plan=${plan.key}&interval=${billingInterval}`);
  };


  const allPlans: Plan[] = [freePlan, ...paidPlans];

  return (
    <section 
      ref={sectionRef}
      id="pricing" 
      className="relative pt-4 md:pt-6 pb-16 md:pb-24 lg:pb-32 overflow-hidden"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.08) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        {/* Billing Toggle */}
        <div className={`flex justify-center mb-8 md:mb-10 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '50ms' } as React.CSSProperties}>
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-muted/60 border border-border/30">
            <button
              onClick={() => setBillingInterval('monthly')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                billingInterval === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingInterval('yearly')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                billingInterval === 'yearly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 max-w-7xl mx-auto mb-16 md:mb-20 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
          {allPlans.map((plan, index) => {
            const paid = isPaidPlan(plan);
            const displayPrice = paid
              ? billingInterval === 'yearly' ? `$${plan.yearlyPrice}` : `$${plan.monthlyPrice}`
              : plan.price;
            const period = paid ? '/mo' : plan.period;
            const billingNote = paid && billingInterval === 'yearly'
              ? `$${plan.yearlyTotal.toLocaleString()} billed annually`
              : null;

            return (
              <div 
                key={plan.key}
                className={`group relative p-6 sm:p-8 rounded-2xl border transition-all duration-300 card-hover-lift ${
                  paid && plan.highlighted 
                    ? 'bg-primary text-primary-foreground border-primary scale-[1.02] shadow-xl shadow-primary/20' 
                    : plan.key === 'free'
                      ? 'bg-muted/30 border-border/20 hover:border-primary/30'
                      : 'bg-card border-border/30 hover:border-primary/50'
                }`}
                style={{ '--reveal-delay': `${(index + 1) * 80}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect for non-highlighted cards */}
                {!(paid && plan.highlighted) && (
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                )}
                
                {paid && plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-foreground text-background text-xs font-medium">
                    Most popular
                  </div>
                )}
                
                <div className="relative z-10 mb-6">
                  <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-4xl font-bold">{displayPrice}</span>
                    <span className={paid && plan.highlighted ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                      {period}
                    </span>
                  </div>
                  {billingNote && (
                    <p className={`text-xs mb-1 ${paid && plan.highlighted ? 'text-primary-foreground/60' : 'text-muted-foreground/70'}`}>
                      {billingNote}
                    </p>
                  )}
                  <p className={`text-sm ${paid && plan.highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {plan.description}
                  </p>
                </div>

                {/* Value propositions for paid plans */}
                {paid && (
                  <div className={`relative z-10 mb-4 p-3 rounded-lg ${
                    plan.highlighted ? 'bg-primary-foreground/10' : 'bg-primary/5'
                  }`}>
                    <p className={`text-sm font-medium ${plan.highlighted ? 'text-primary-foreground' : 'text-foreground'}`}>
                      {billingInterval === 'yearly'
                        ? `Contact up to ${plan.yearlyProspects.toLocaleString()} verified prospects per year`
                        : `Contact up to ${plan.monthlyProspects.toLocaleString()} verified prospects per month`}
                    </p>
                    <p className={`text-xs mt-1 ${plan.highlighted ? 'text-primary-foreground/60' : 'text-muted-foreground/80'}`}>
                      {plan.dailyLimit}
                    </p>
                  </div>
                )}

                <ul className="relative z-10 space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        paid && plan.highlighted ? 'text-primary-foreground' : 'text-primary'
                      }`} />
                      <span className={`text-sm ${
                        paid && plan.highlighted ? 'text-primary-foreground/90' : 'text-muted-foreground'
                      }`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button 
                  className={`relative z-10 w-full h-12 font-semibold rounded-xl ${
                    plan.key === 'free'
                      ? 'bg-muted text-foreground hover:bg-muted/80 border border-border'
                      : paid && plan.highlighted 
                        ? 'bg-foreground text-background hover:bg-foreground/90' 
                        : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                  onClick={() => handleCheckout(plan)}
                >
                  {plan.key === 'free' ? 'Get started free' : 'Start 14-day free trial'}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className={`max-w-7xl mx-auto mb-16 md:mb-20 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
          <div className="text-center mb-8 md:mb-10">
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">Compare plans</h2>
            <p className="text-sm sm:text-base text-muted-foreground">See what's included in each plan</p>
          </div>
          
          {/* Horizontal scroll hint on mobile */}
          <div className="lg:hidden text-center mb-3">
            <p className="text-xs text-muted-foreground">← Scroll to compare →</p>
          </div>
          
           <div className="overflow-x-auto -mx-6 px-6 pb-4 scrollbar-hide">
            <table className="w-full border-collapse min-w-[680px]">
              {/* Header */}
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-3 sm:py-4 px-3 sm:px-4 font-medium text-muted-foreground text-sm min-w-[140px] sm:min-w-[180px]">Features</th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-3 min-w-[80px] sm:min-w-[100px]">
                    <div className="font-semibold text-sm sm:text-base">Free</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$0</div>
                  </th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-3 min-w-[80px] sm:min-w-[100px]">
                    <div className="font-semibold text-sm sm:text-base">Starter</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$39/mo</div>
                  </th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-3 bg-primary/5 rounded-t-lg min-w-[80px] sm:min-w-[100px]">
                    <div className="font-semibold text-primary text-sm sm:text-base">Growth</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$89/mo</div>
                  </th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-3 min-w-[80px] sm:min-w-[100px]">
                    <div className="font-semibold text-sm sm:text-base">Pro</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$179/mo</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonCategories.map((category, catIndex) => (
                  <>
                    {/* Category Header */}
                    <tr key={`cat-${catIndex}`} className="border-b border-border/20">
                      <td colSpan={5} className="py-3 sm:py-4 px-3 sm:px-4">
                        <div className="flex items-center gap-2 font-semibold text-foreground text-sm sm:text-base">
                          <Coins className="w-4 h-4 text-primary flex-shrink-0" />
                          {category.name}
                        </div>
                      </td>
                    </tr>
                    {/* Feature Rows */}
                    {category.features.map((feature, featureIndex) => (
                      <tr 
                        key={`feature-${catIndex}-${featureIndex}`} 
                        className="border-b border-border/10 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-xs sm:text-sm text-muted-foreground">{feature.name}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.free)}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.starter)}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center bg-primary/5">{renderFeatureValue(feature.growth)}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-3 text-center">{renderFeatureValue(feature.pro)}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add-ons Section */}
        <div className={`max-w-2xl mx-auto mb-16 md:mb-20 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
          <div className="text-center mb-6 sm:mb-8">
            <h3 className="text-lg sm:text-xl font-semibold mb-2">Need more verified prospects?</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Purchase one-time credit packs — no commitments, no plan changes.
            </p>

            <div className="group relative inline-block">
              <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              <Button 
                onClick={() => setTopupDialogOpen(true)}
                className="relative z-10 gap-2"
                size="lg"
              >
                <Zap className="w-4 h-4" />
                Buy credits
              </Button>
            </div>
          </div>
        </div>

        <QuickBuyCreditsDialog 
          open={topupDialogOpen} 
          onOpenChange={setTopupDialogOpen} 
        />

        {/* Pricing & Credits FAQ */}
        <div className={`max-w-3xl mx-auto scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '400ms' } as React.CSSProperties}>
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-2 text-muted-foreground mb-2">
              <HelpCircle className="w-5 h-5" />
              <span className="text-sm font-medium">FAQs</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold">Pricing & plans</h3>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-2 sm:space-y-3">
            {creditFAQs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="border border-border/30 rounded-xl px-4 sm:px-6 bg-card/40 data-[state=open]:bg-card/60 transition-colors"
              >
                <AccordionTrigger className="text-left hover:no-underline py-3 sm:py-4">
                  <span className="font-medium text-sm sm:text-base">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-3 sm:pb-4 text-muted-foreground leading-relaxed text-sm">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
