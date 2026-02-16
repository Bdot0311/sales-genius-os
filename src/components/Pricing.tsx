import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, HelpCircle, Coins } from "lucide-react";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const plans = [
  {
    key: 'growth' as const,
    name: "Growth",
    price: "$149",
    period: "/month",
    description: "For solo founders and early outbound",
    features: [
      "350 search credits / month",
      "Lead Intelligence Engine",
      "In-app enrichment & scoring",
      "AI Outreach Studio",
      "Smart Deal Pipeline",
      "Email support",
    ],
    paymentLink: "https://buy.stripe.com/9B6dR9ep1a2b0gi1ca1B60u",
  },
  {
    key: 'pro' as const,
    name: "Pro",
    price: "$299",
    period: "/month",
    description: "For teams booking meetings consistently",
    features: [
      "700 search credits / month",
      "Everything in Growth",
      "Advanced automation builder",
      "AI Sales Coach",
      "Performance analytics",
      "Priority support",
    ],
    highlighted: true,
    paymentLink: "https://buy.stripe.com/9B65kD4Or8Y76EGaMK1B60p",
  },
  {
    key: 'elite' as const,
    name: "Elite",
    price: "$799",
    period: "/month",
    description: "For high-volume outbound operations",
    features: [
      "2,000 search credits / month",
      "Everything in Pro",
      "Unlimited workflows",
      "API access",
      "White-label customization",
      "Dedicated success manager",
    ],
    paymentLink: "https://buy.stripe.com/8x2bJ15Svfmvd341ca1B60q",
  },
];

const addons = [
  {
    credits: 500,
    price: "$199",
    priceId: STRIPE_PRICE_IDS.addon500,
    paymentLink: "https://buy.stripe.com/5kQbJ1ep1cajgfg8EC1B60s",
  },
  {
    credits: 1500,
    price: "$499",
    priceId: STRIPE_PRICE_IDS.addon1500,
    paymentLink: "https://buy.stripe.com/3cIeVdep13DN5AC6wu1B60t",
  },
];

// Feature comparison table data
const comparisonCategories = [
  {
    name: "Search Credits",
    features: [
      { name: "Monthly search credits", growth: "350", pro: "700", elite: "2,000" },
      { name: "Daily search limit", growth: "25", pro: "100", elite: "500" },
      { name: "Results per search", growth: "25", pro: "100", elite: "500" },
    ]
  },
  {
    name: "Lead Intelligence",
    features: [
      { name: "Lead enrichment & scoring", growth: true, pro: true, elite: true },
      { name: "Advanced filters", growth: false, pro: true, elite: true },
      { name: "API access", growth: false, pro: false, elite: true },
    ]
  },
  {
    name: "Outreach & Sequences",
    features: [
      { name: "Active sequences", growth: "3", pro: "15", elite: "Unlimited" },
      { name: "Steps per sequence", growth: "3", pro: "7", elite: "Unlimited" },
      { name: "AI personalization", growth: "Basic", pro: "Advanced", elite: "Premium" },
      { name: "Message blocks", growth: "5", pro: "25", elite: "Unlimited" },
      { name: "A/B testing variants", growth: false, pro: "2", elite: "Unlimited" },
      { name: "Reply analysis", growth: false, pro: true, elite: true },
      { name: "Handoff alerts", growth: false, pro: "Email", elite: "Webhook + Slack" },
      { name: "Multi-channel logic", growth: false, pro: false, elite: true },
    ]
  },
  {
    name: "Pipeline & Analytics",
    features: [
      { name: "Visual pipeline", growth: true, pro: true, elite: true },
      { name: "Automated stage progression", growth: false, pro: true, elite: true },
      { name: "Revenue forecasting", growth: false, pro: true, elite: true },
      { name: "Custom pipelines", growth: false, pro: false, elite: true },
      { name: "Custom reports & exports", growth: false, pro: false, elite: true },
    ]
  },
  {
    name: "AI Sales Coach",
    features: [
      { name: "Coaching level", growth: "Basic", pro: "Advanced", elite: "Premium" },
      { name: "Real-time analysis", growth: "Limited", pro: "Full", elite: "Full" },
      { name: "Live coaching", growth: false, pro: false, elite: true },
      { name: "Custom playbooks", growth: false, pro: false, elite: true },
    ]
  },
  {
    name: "Automations",
    features: [
      { name: "Automation rules", growth: "5", pro: "25", elite: "Unlimited" },
      { name: "Advanced workflows", growth: false, pro: true, elite: true },
      { name: "White-label customization", growth: false, pro: false, elite: true },
    ]
  },
  {
    name: "Support",
    features: [
      { name: "Email support", growth: true, pro: true, elite: true },
      { name: "Priority support", growth: false, pro: true, elite: true },
      { name: "Dedicated success manager", growth: false, pro: false, elite: true },
    ]
  },
];

const creditFAQs = [
  {
    question: "What are search credits?",
    answer: "Search credits are used when you discover new leads through our Lead Intelligence Engine. Each search query that returns results uses credits based on the number of leads found. Previewing results, viewing lead details, enrichment, and exports are all free and don't consume credits."
  },
  {
    question: "How do credits reset?",
    answer: "Your search credits reset on a monthly basis, aligned with your billing cycle. Unused credits do not roll over to the next month. If you need more credits mid-cycle, you can purchase add-on packs that are added immediately to your balance."
  },
  {
    question: "What happens when I run out of credits?",
    answer: "When you exhaust your monthly credits, you can still access all your saved leads, enrichment data, and pipeline features. To continue discovering new leads, you can either wait for your monthly reset or purchase a credit add-on pack."
  },
  {
    question: "Can I get a refund on unused credits?",
    answer: "Credits are non-refundable and expire at the end of each billing cycle. We recommend starting with a plan that matches your expected usage and adjusting as you learn your needs. Our team can help you estimate the right plan based on your sales volume."
  },
  {
    question: "What's included in the 14-day free trial?",
    answer: "All plans include a 14-day free trial with full access to features and a starter credit allocation. A credit card is required to begin your trial. You can cancel anytime during the trial period without being charged."
  },
  {
    question: "Can I change plans later?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. When upgrading, the new credit allocation takes effect immediately. When downgrading, the change applies at the start of your next billing cycle to ensure you keep your current benefits."
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

export const Pricing = () => {
  const { credits, addAddon, removeAddon } = useSearchCredits();
  const [addingAddon, setAddingAddon] = useState<string | null>(null);
  const [removingAddon, setRemovingAddon] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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

  const handleCheckout = (paymentLink: string) => {
    window.open(paymentLink, '_blank');
  };

  const handleAddAddon = async (addonPriceId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Please sign in and subscribe to a plan first');
      return;
    }

    setAddingAddon(addonPriceId);
    await addAddon(addonPriceId);
    setAddingAddon(null);
  };

  const handleRemoveAddon = async () => {
    setRemovingAddon(true);
    await removeAddon();
    setRemovingAddon(false);
  };

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
        {/* Plan Cards */}
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto mb-16 md:mb-20 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
          {plans.map((plan, index) => (
            <div 
              key={plan.key}
              className={`group relative p-8 rounded-2xl border transition-all duration-300 card-hover-lift ${
                plan.highlighted 
                  ? 'bg-primary text-primary-foreground border-primary scale-[1.02] shadow-xl shadow-primary/20' 
                  : 'bg-card border-border/30 hover:border-primary/50'
              }`}
              style={{ '--reveal-delay': `${(index + 1) * 80}ms` } as React.CSSProperties}
            >
              {/* Spotlight effect for non-highlighted cards */}
              {!plan.highlighted && (
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
              )}
              
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-foreground text-background text-xs font-medium">
                  Most popular
                </div>
              )}
              
              <div className="relative z-10 mb-6">
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className={plan.highlighted ? 'text-primary-foreground/70' : 'text-muted-foreground'}>
                    {plan.period}
                  </span>
                </div>
                <p className={`text-sm ${plan.highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="relative z-10 space-y-3 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      plan.highlighted ? 'text-primary-foreground' : 'text-primary'
                    }`} />
                    <span className={`text-sm ${
                      plan.highlighted ? 'text-primary-foreground/90' : 'text-muted-foreground'
                    }`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button 
                className={`relative z-10 w-full h-12 font-semibold rounded-xl ${
                  plan.highlighted 
                    ? 'bg-foreground text-background hover:bg-foreground/90' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                onClick={() => handleCheckout(plan.paymentLink)}
              >
                Start 14-day free trial
              </Button>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className={`max-w-6xl mx-auto mb-16 md:mb-20 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
          <div className="text-center mb-8 md:mb-10">
            <h2 className="text-xl sm:text-2xl font-semibold mb-2">Compare plans</h2>
            <p className="text-sm sm:text-base text-muted-foreground">See what's included in each plan</p>
          </div>
          
          {/* Horizontal scroll hint on mobile */}
          <div className="lg:hidden text-center mb-3">
            <p className="text-xs text-muted-foreground">← Scroll to compare →</p>
          </div>
          
          <div className="overflow-x-auto -mx-6 px-6 pb-4 scrollbar-hide">
            <table className="w-full border-collapse min-w-[640px]">
              {/* Header */}
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left py-3 sm:py-4 px-3 sm:px-4 font-medium text-muted-foreground text-sm min-w-[140px] sm:min-w-[180px]">Features</th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-4 min-w-[100px] sm:min-w-[120px]">
                    <div className="font-semibold text-sm sm:text-base">Growth</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$149/mo</div>
                  </th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-4 bg-primary/5 rounded-t-lg min-w-[100px] sm:min-w-[120px]">
                    <div className="font-semibold text-primary text-sm sm:text-base">Pro</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$299/mo</div>
                  </th>
                  <th className="text-center py-3 sm:py-4 px-2 sm:px-4 min-w-[100px] sm:min-w-[120px]">
                    <div className="font-semibold text-sm sm:text-base">Elite</div>
                    <div className="text-xs sm:text-sm text-muted-foreground">$799/mo</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonCategories.map((category, catIndex) => (
                  <>
                    {/* Category Header */}
                    <tr key={`cat-${catIndex}`} className="border-b border-border/20">
                      <td colSpan={4} className="py-3 sm:py-4 px-3 sm:px-4">
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
                        <td className="py-2.5 sm:py-3 px-2 sm:px-4 text-center">{renderFeatureValue(feature.growth)}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-4 text-center bg-primary/5">{renderFeatureValue(feature.pro)}</td>
                        <td className="py-2.5 sm:py-3 px-2 sm:px-4 text-center">{renderFeatureValue(feature.elite)}</td>
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
            <h3 className="text-lg sm:text-xl font-semibold mb-2">Need more credits?</h3>
            <p className="text-muted-foreground text-sm">
              Add extra search credits to your plan anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {addons.map((addon) => {
              const isCurrentAddon = credits?.addonPriceId === addon.priceId;
              const isLoading = addingAddon === addon.priceId;
              
              return (
                <div 
                  key={addon.credits}
                  className={`group relative p-6 rounded-xl border text-center transition-all card-hover-lift ${
                    isCurrentAddon ? 'border-primary bg-primary/5' : 'border-border/30 bg-card/40 hover:border-primary/50'
                  }`}
                >
                  {/* Spotlight effect */}
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                  
                  <div className="relative z-10">
                    <div className="text-2xl font-bold mb-1">+{addon.credits.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground mb-3">credits per month</div>
                    <div className="text-lg font-semibold text-primary mb-4">{addon.price}/mo</div>
                    
                    {isCurrentAddon ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="w-full"
                        onClick={handleRemoveAddon}
                        disabled={removingAddon}
                      >
                        {removingAddon ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Removing...</> : 'Remove'}
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleAddAddon(addon.priceId)}
                        disabled={isLoading || addingAddon !== null}
                      >
                        {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</> : 'Add to plan'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Credit FAQs */}
        <div className={`max-w-3xl mx-auto scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '400ms' } as React.CSSProperties}>
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-2 text-muted-foreground mb-2">
              <HelpCircle className="w-5 h-5" />
              <span className="text-sm font-medium">FAQs</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold">How credits work</h3>
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
