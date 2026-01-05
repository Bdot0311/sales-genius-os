import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Search, Eye, Zap, Download, Star, Loader2 } from "lucide-react";
import { STRIPE_PRICE_IDS, PLAN_CONFIG, ADDON_CONFIG } from "@/lib/stripe-config";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const plans = [
  {
    key: 'growth' as const,
    name: "Growth",
    price: "$149",
    period: "/ month",
    tagline: "For solo founders and early outbound",
    includes: [
      "350 search credits / month",
      "Lead Intelligence Engine",
      "In-app enrichment & lead scoring",
      "AI Outreach Studio",
      "Smart Deal Pipeline",
      "Lead previews (free)",
      "Email support",
    ],
    usageLimits: [
      "Up to 25 searches/day",
      "Standard exports",
    ],
    bestFor: "Validating outbound without overcommitment.",
    highlighted: false,
    paymentLink: "https://buy.stripe.com/9B6dR9ep1a2b0gi1ca1B60u",
  },
  {
    key: 'pro' as const,
    name: "Pro",
    price: "$299",
    period: "/ month",
    tagline: "For teams booking meetings consistently",
    includes: [
      "700 search credits / month",
      "Everything in Growth, plus:",
      "Advanced automation builder",
      "AI Sales Coach",
      "Performance analytics",
      "Priority support",
    ],
    usageLimits: [
      "Up to 100 searches/day",
      "Advanced exports",
    ],
    bestFor: "Sales teams scaling predictable outbound.",
    highlighted: true,
    paymentLink: "https://buy.stripe.com/9B65kD4Or8Y76EGaMK1B60p",
  },
  {
    key: 'elite' as const,
    name: "Elite",
    price: "$799",
    period: "/ month",
    tagline: "For high-volume outbound operations",
    includes: [
      "2,000 search credits / month",
      "Everything in Pro, plus:",
      "Unlimited automation workflows",
      "API access",
      "White-label customization",
      "Unlimited exports",
      "Dedicated success manager",
    ],
    usageLimits: [
      "Up to 500 searches/day",
      "Highest API & workflow limits",
    ],
    bestFor: "Agencies and organizations running outbound at scale.",
    highlighted: false,
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

const creditUsage = [
  { action: "Searching for a lead", cost: "1 search credit", icon: Search },
  { action: "Viewing preview results", cost: "Free", icon: Eye },
  { action: "In-app enrichment", cost: "Free", icon: Zap },
  { action: "Exporting leads", cost: "Free", icon: Download },
  { action: "Automation & sequencing", cost: "Included", icon: Zap },
];

export const Pricing = () => {
  const { credits, addAddon, removeAddon } = useSearchCredits();
  const [addingAddon, setAddingAddon] = useState<string | null>(null);
  const [removingAddon, setRemovingAddon] = useState(false);

  const handleCheckout = (paymentLink: string) => {
    window.open(paymentLink, '_blank');
  };

  const handleAddAddon = async (addonPriceId: string) => {
    // Check if user is subscribed first
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
    <section id="pricing" className="py-16 sm:py-20 md:py-24 bg-gradient-hero relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 px-4">
            SalesOS
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Pricing</span>
          </h2>
          <p className="text-lg sm:text-xl md:text-2xl font-medium text-foreground mb-2">
            Search smarter. Enrich instantly. Scale predictably.
          </p>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto px-4">
            Search credits power lead discovery. All enrichment, scoring, and automation happens inside SalesOS.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto mb-16">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`p-6 sm:p-8 relative ${
                plan.highlighted 
                  ? 'bg-gradient-primary border-primary shadow-glow sm:scale-105' 
                  : 'bg-card border-border'
              } transition-all duration-300 hover:scale-105`}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground">
                  <Star className="w-3 h-3 mr-1" /> Most Popular
                </Badge>
              )}
              
              <div className="mb-6">
                <h3 className={`text-xl sm:text-2xl font-bold mb-1 ${plan.highlighted ? 'text-white' : ''}`}>
                  {plan.name}
                </h3>
                <div className={`text-3xl sm:text-4xl font-bold mb-2 ${plan.highlighted ? 'text-white' : ''}`}>
                  {plan.price}
                  <span className={`text-base sm:text-lg font-normal ${plan.highlighted ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {plan.period}
                  </span>
                </div>
                <p className={`text-xs sm:text-sm ${plan.highlighted ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {plan.tagline}
                </p>
              </div>

              {/* Includes */}
              <div className="mb-4">
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${plan.highlighted ? 'text-white/60' : 'text-muted-foreground'}`}>
                  Includes:
                </p>
                <ul className="space-y-2">
                  {plan.includes.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-2">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlighted ? 'text-white' : 'text-primary'}`} />
                      <span className={`text-xs sm:text-sm ${plan.highlighted ? 'text-white/90' : 'text-muted-foreground'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Usage Limits */}
              <div className="mb-4">
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${plan.highlighted ? 'text-white/60' : 'text-muted-foreground'}`}>
                  Usage limits:
                </p>
                <ul className="space-y-1">
                  {plan.usageLimits.map((limit, limitIndex) => (
                    <li key={limitIndex} className={`text-xs sm:text-sm ${plan.highlighted ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {limit}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Best For */}
              <p className={`text-xs italic mb-6 ${plan.highlighted ? 'text-white/70' : 'text-muted-foreground'}`}>
                <strong>Best for:</strong> {plan.bestFor}
              </p>

              <Button 
                variant={plan.highlighted ? "default" : "hero"} 
                className={`w-full ${
                  plan.highlighted 
                    ? 'bg-black text-white hover:bg-primary hover:text-primary-foreground border-0' 
                    : ''
                }`}
                onClick={() => handleCheckout(plan.paymentLink)}
              >
                Start Free Trial
              </Button>
            </Card>
          ))}
        </div>

        {/* Search Credit Add-Ons */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold mb-2">
              Monthly Search Credit Add-Ons
            </h3>
            <p className="text-muted-foreground">
              Increase discovery capacity without switching plans.<br />
              Add-ons are monthly and adjustable each billing cycle.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {addons.map((addon, index) => {
              const isCurrentAddon = credits?.addonPriceId === addon.priceId;
              const isLoading = addingAddon === addon.priceId;
              
              return (
                <Card key={index} className={`p-6 bg-card border-border text-center ${isCurrentAddon ? 'ring-2 ring-primary' : ''}`}>
                  {isCurrentAddon && (
                    <Badge className="mb-2 bg-primary text-primary-foreground">Current Add-on</Badge>
                  )}
                  <div className="text-lg font-semibold mb-2">
                    +{addon.credits.toLocaleString()} search credits / month
                  </div>
                  <div className="text-2xl font-bold text-primary mb-4">
                    {addon.price}<span className="text-sm font-normal text-muted-foreground">/month</span>
                  </div>
                  {isCurrentAddon ? (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={handleRemoveAddon}
                      disabled={removingAddon}
                    >
                      {removingAddon ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Removing...</> : 'Remove Add-on'}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => handleAddAddon(addon.priceId)}
                      disabled={isLoading || addingAddon !== null}
                    >
                      {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</> : 'Add to Subscription'}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            Add-ons are merged into your existing subscription. One combined bill.
          </p>
        </div>

        {/* How Search Credits Work */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold mb-2">
              How Search Credits Work
            </h3>
          </div>

          <Card className="p-6 bg-card border-border">
            <div className="space-y-3">
              {creditUsage.map((item, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm sm:text-base">{item.action}</span>
                  </div>
                  <Badge variant={item.cost === "1 search credit" ? "default" : "secondary"}>
                    {item.cost}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Unused credits reset monthly.
            </p>
          </Card>
        </div>

        {/* Fair Usage Policy */}
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <h3 className="text-2xl sm:text-3xl font-bold mb-2">
              Fair Usage Policy
            </h3>
          </div>

          <Card className="p-6 bg-card border-border">
            <p className="text-muted-foreground mb-4">To ensure platform stability:</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-4">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Credits reset each billing cycle
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Searches are capped by plan
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                Usage throttles prevent abuse
              </li>
            </ul>
            <p className="text-sm text-muted-foreground text-center border-t border-border pt-4">
              SalesOS enforces fair usage limits to maintain reliability for all customers.
            </p>
          </Card>
        </div>
      </div>
    </section>
  );
};
