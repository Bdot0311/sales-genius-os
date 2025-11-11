import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Growth",
    price: "$99",
    description: "Perfect for solo founders and small teams",
    features: [
      "Lead Intelligence Engine",
      "AI Outreach Studio",
      "Smart Deal Pipeline",
      "Calendar Integration",
      "Up to 1,000 leads/month",
      "Email support"
    ],
    cta: "Start Free Trial",
    highlighted: false,
    paymentLink: "https://buy.stripe.com/cNibJ1bcPden1km8EC1B60o"
  },
  {
    name: "Pro",
    price: "$299",
    description: "For scaling sales teams",
    features: [
      "Everything in Growth, plus:",
      "Automation Builder",
      "AI Sales Coach",
      "Advanced Analytics",
      "AI Recommendations",
      "Up to 10,000 leads/month",
      "Priority support"
    ],
    cta: "Start Free Trial",
    highlighted: true,
    paymentLink: "https://buy.stripe.com/9B65kD4Or8Y76EGaMK1B60p"
  },
  {
    name: "Elite",
    price: "$799",
    description: "For high-performance organizations",
    features: [
      "Everything in Pro, plus:",
      "Up to 10 team accounts",
      "White-label customization",
      "API access",
      "Unlimited automation workflows",
      "Unlimited leads",
      "Dedicated success manager"
    ],
    cta: "Start Free Trial",
    highlighted: false,
    paymentLink: "https://buy.stripe.com/8x2bJ15Svfmvd341ca1B60q"
  }
];

export const Pricing = () => {
  const handleCheckout = (paymentLink: string) => {
    window.open(paymentLink, '_blank');
  };

  return (
    <section id="pricing" className="py-24 bg-gradient-hero relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container relative z-10 mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Choose Your
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Growth Plan</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start with a 14-day free trial. No credit card required.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <Card 
              key={index}
              className={`p-8 ${
                plan.highlighted 
                  ? 'bg-gradient-primary border-primary shadow-glow scale-105' 
                  : 'bg-card border-border'
              } transition-all duration-300 hover:scale-105`}
            >
              <div className="mb-6">
                <h3 className={`text-2xl font-bold mb-2 ${plan.highlighted ? 'text-white' : ''}`}>
                  {plan.name}
                </h3>
                <div className={`text-4xl font-bold mb-2 ${plan.highlighted ? 'text-white' : ''}`}>
                  {plan.price}
                  {plan.price !== "Custom" && <span className="text-lg font-normal text-muted-foreground">/mo</span>}
                </div>
                <p className={`text-sm ${plan.highlighted ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-2">
                    <Check className={`w-5 h-5 shrink-0 mt-0.5 ${plan.highlighted ? 'text-white' : 'text-primary'}`} />
                    <span className={`text-sm ${plan.highlighted ? 'text-white/90' : 'text-muted-foreground'}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={plan.highlighted ? "default" : "hero"} 
                className={`w-full ${
                  plan.highlighted 
                    ? 'bg-black text-white hover:bg-primary hover:text-primary-foreground border-0' 
                    : ''
                }`}
                onClick={() => handleCheckout(plan.paymentLink)}
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
