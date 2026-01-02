import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Sparkles, Users, BarChart } from "lucide-react";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const Confirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = searchParams.get("plan") || "growth";
  const email = searchParams.get("email");
  const emailSentRef = useRef(false);

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);

    // Send subscription confirmation email (only once)
    if (email && !emailSentRef.current) {
      emailSentRef.current = true;
      
      const planPrices: Record<string, string> = {
        growth: "$49",
        pro: "$199",
        elite: "$499"
      };

      supabase.functions.invoke('send-subscription-confirmation', {
        body: {
          email,
          name: email.split('@')[0],
          plan: plan.charAt(0).toUpperCase() + plan.slice(1),
          amount: planPrices[plan] || "$49"
        }
      }).catch(err => console.error('Subscription email error:', err));
    }
  }, [email, plan]);

  const planFeatures = {
    growth: [
      "1,000 leads per month",
      "Lead intelligence & scoring",
      "AI-powered outreach",
      "Smart pipeline management",
      "Calendar integration"
    ],
    pro: [
      "10,000 leads per month",
      "Everything in Growth, plus:",
      "Advanced automations",
      "AI sales coach",
      "Advanced analytics",
      "Priority support"
    ],
    elite: [
      "Unlimited leads",
      "Everything in Pro, plus:",
      "Full API access",
      "Custom integrations",
      "Team collaboration",
      "Dedicated account manager"
    ]
  };

  const nextSteps = [
    {
      icon: CheckCircle,
      title: "Check your email",
      description: "We've sent your login credentials to your email address. Look for an email from SalesOS with your temporary password."
    },
    {
      icon: Users,
      title: "Create your account",
      description: "Use the credentials from your email to sign in and set up your account. You'll be prompted to change your password on first login."
    },
    {
      icon: BarChart,
      title: "Import your leads",
      description: "Connect your CRM, upload a CSV, or use our integrations to import your existing leads and start selling smarter."
    },
    {
      icon: Sparkles,
      title: "Start selling",
      description: "Explore AI-powered features, set up automations, and watch your conversion rates soar."
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden opacity-30 -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-4xl">
        {/* Success Header */}
        <div className="text-center mb-8 sm:mb-12 space-y-4 sm:space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-scale-in" />
            </div>
          </div>
          
          <div className="space-y-2 sm:space-y-3">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-fade-in px-4">
              Welcome to SalesOS!
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              Your subscription is active. Let's get you set up and selling in minutes.
            </p>
          </div>
        </div>

        {/* Plan Details */}
        <Card className="p-5 sm:p-6 mb-6 sm:mb-8 bg-card/50 backdrop-blur-sm border-primary/20">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold capitalize">{plan} Plan</h2>
            <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-primary/10 rounded-full">
              <span className="text-sm sm:text-base text-primary font-semibold">Active</span>
            </div>
          </div>
          <div className="grid gap-2 sm:gap-3">
            {planFeatures[plan as keyof typeof planFeatures]?.map((feature, index) => (
              <div key={index} className="flex items-start gap-2 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm sm:text-base text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Next Steps */}
        <div className="space-y-4 sm:space-y-6 mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-center">Next Steps</h2>
          <div className="grid gap-4 sm:gap-6">
            {nextSteps.map((step, index) => (
              <Card key={index} className="p-5 sm:p-6 bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-all">
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <step.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base sm:text-lg font-semibold mb-1 sm:mb-2">{step.title}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center">
                    <span className="text-2xl sm:text-3xl font-bold text-muted-foreground/20">
                      {index + 1}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <Button
            variant="hero"
            size="lg"
            onClick={() => navigate("/auth")}
            className="gap-2 w-full sm:w-auto"
          >
            Sign In to Your Account
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate("/")}
            className="w-full sm:w-auto"
          >
            Back to Home
          </Button>
        </div>

        {/* Support Note */}
        <div className="mt-8 sm:mt-12 text-center px-4">
          <p className="text-xs sm:text-sm text-muted-foreground">
            Need help? Contact us at{" "}
            <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">
              support@bdotindustries.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Confirmation;
