import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, ArrowRight, Sparkles, Users, BarChart, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Confirmation = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = searchParams.get("plan") || "growth";
  const email = searchParams.get("email");
  const emailSentRef = useRef(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [subscriptionVerified, setSubscriptionVerified] = useState(false);
  const [verifiedPlan, setVerifiedPlan] = useState<string | null>(null);

  // Real-time subscription verification with polling
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let pollCount = 0;
    const maxPolls = 30; // Poll for up to 60 seconds (30 polls * 2 seconds)

    const checkSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // User is logged in, check their subscription directly
          const { data, error } = await supabase.functions.invoke('check-subscription');
          
          if (!error && data?.subscribed) {
            setSubscriptionVerified(true);
            setVerifiedPlan(data.plan || plan);
            setIsVerifying(false);
            clearInterval(pollInterval);
            return;
          }
        }

        // Also check via Stripe webhook processing (for users who just paid)
        pollCount++;
        if (pollCount >= maxPolls) {
          // Stop polling after max attempts, assume payment went through
          setSubscriptionVerified(true);
          setVerifiedPlan(plan);
          setIsVerifying(false);
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Subscription check error:', err);
      }
    };

    // Initial check
    checkSubscription();

    // Poll every 2 seconds
    pollInterval = setInterval(checkSubscription, 2000);

    // After 5 seconds, assume success if still verifying (Stripe webhooks may be delayed)
    const fallbackTimeout = setTimeout(() => {
      if (isVerifying) {
        setSubscriptionVerified(true);
        setVerifiedPlan(plan);
        setIsVerifying(false);
      }
    }, 5000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [plan, isVerifying]);

  useEffect(() => {
    // Scroll to top on mount
    window.scrollTo(0, 0);

    // Send subscription confirmation email (only once, after verification)
    if (email && !emailSentRef.current && subscriptionVerified) {
      emailSentRef.current = true;
      
      const planPrices: Record<string, string> = {
        growth: "$149",
        pro: "$299",
        elite: "$799"
      };

      supabase.functions.invoke('send-subscription-confirmation', {
        body: {
          email,
          name: email.split('@')[0],
          plan: (verifiedPlan || plan).charAt(0).toUpperCase() + (verifiedPlan || plan).slice(1),
          amount: planPrices[verifiedPlan || plan] || "$149"
        }
      }).catch(err => console.error('Subscription email error:', err));
    }
  }, [email, plan, subscriptionVerified, verifiedPlan]);

  const displayPlan = verifiedPlan || plan;

  const planFeatures = {
    growth: [
      "350 search credits / month",
      "Lead Intelligence Engine",
      "In-app enrichment & lead scoring",
      "AI Outreach Studio",
      "Smart Deal Pipeline",
      "Email support"
    ],
    pro: [
      "700 search credits / month",
      "Everything in Growth, plus:",
      "Advanced automation builder",
      "AI Sales Coach",
      "Performance analytics",
      "Priority support"
    ],
    elite: [
      "2,000 search credits / month",
      "Everything in Pro, plus:",
      "Unlimited automation workflows",
      "API access",
      "White-label customization",
      "Dedicated success manager"
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
      title: "Start searching for leads",
      description: "Use your search credits to find qualified prospects and build your pipeline."
    },
    {
      icon: Sparkles,
      title: "Enrich & close deals",
      description: "Leverage AI-powered enrichment, outreach tools, and automations to convert leads into customers."
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
              {isVerifying ? (
                <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-spin" />
              ) : (
                <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-primary animate-scale-in" />
              )}
            </div>
          </div>
          
          <div className="space-y-2 sm:space-y-3">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-fade-in px-4">
              {isVerifying ? "Processing Payment..." : "Welcome to SalesOS!"}
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              {isVerifying 
                ? "Please wait while we confirm your subscription..."
                : "Your subscription is active. Let's get you set up and selling in minutes."
              }
            </p>
          </div>
        </div>

        {/* Plan Details */}
        <Card className={`p-5 sm:p-6 mb-6 sm:mb-8 bg-card/50 backdrop-blur-sm border-primary/20 transition-opacity ${isVerifying ? 'opacity-50' : 'opacity-100'}`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold capitalize">{displayPlan} Plan</h2>
            <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full ${isVerifying ? 'bg-muted' : 'bg-primary/10'}`}>
              <span className={`text-sm sm:text-base font-semibold ${isVerifying ? 'text-muted-foreground' : 'text-primary'}`}>
                {isVerifying ? "Verifying..." : "Active"}
              </span>
            </div>
          </div>
          <div className="grid gap-2 sm:gap-3">
            {planFeatures[displayPlan as keyof typeof planFeatures]?.map((feature, index) => (
              <div key={index} className="flex items-start gap-2 sm:gap-3">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm sm:text-base text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Next Steps */}
        <div className={`space-y-4 sm:space-y-6 mb-6 sm:mb-8 transition-opacity ${isVerifying ? 'opacity-50' : 'opacity-100'}`}>
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
            disabled={isVerifying}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Sign In to Your Account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
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
