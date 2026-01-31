import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

export const Pricing = () => {
  const { credits, addAddon, removeAddon } = useSearchCredits();
  const [addingAddon, setAddingAddon] = useState<string | null>(null);
  const [removingAddon, setRemovingAddon] = useState(false);

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
    <section id="pricing" className="py-24 md:py-32 bg-background relative">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm text-muted-foreground mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Pricing
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-muted-foreground">
            Start free. Upgrade when you're ready. No hidden fees.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto mb-20">
          {plans.map((plan) => (
            <div 
              key={plan.key}
              className={`relative p-8 rounded-2xl border transition-all duration-300 ${
                plan.highlighted 
                  ? 'bg-primary text-primary-foreground border-primary scale-[1.02] shadow-xl shadow-primary/20' 
                  : 'bg-card border-border hover:border-primary/50'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-foreground text-background text-xs font-medium">
                  Most popular
                </div>
              )}
              
              <div className="mb-6">
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

              <ul className="space-y-3 mb-8">
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
                className={`w-full h-12 font-semibold rounded-xl ${
                  plan.highlighted 
                    ? 'bg-foreground text-background hover:bg-foreground/90' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                onClick={() => handleCheckout(plan.paymentLink)}
              >
                Start free trial
              </Button>
            </div>
          ))}
        </div>

        {/* Add-ons Section */}
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h3 className="text-xl font-semibold mb-2">Need more credits?</h3>
            <p className="text-muted-foreground text-sm">
              Add extra search credits to your plan anytime.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {addons.map((addon) => {
              const isCurrentAddon = credits?.addonPriceId === addon.priceId;
              const isLoading = addingAddon === addon.priceId;
              
              return (
                <div 
                  key={addon.credits}
                  className={`p-6 rounded-xl border text-center transition-all ${
                    isCurrentAddon ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
                  }`}
                >
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
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
