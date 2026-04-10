import { useCallback, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_PRICE_IDS } from "@/lib/stripe-config";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    "pk_live_51T8THPFTerosS6hiQnrx3VN6cwsIJCVHKPrHT50Y71g3Z1IiQ0HbdZvqHHp5bV3k9mOGFZQKHVDT2tT8FPGnXkqN00e2ecLQHm"
);

type PlanKey = "starter" | "growth" | "pro" | "agency";
type IntervalKey = "monthly" | "yearly";

const priceIdMap: Record<`${PlanKey}_${IntervalKey}`, string> = {
  starter_monthly: STRIPE_PRICE_IDS.starter_monthly,
  starter_yearly: STRIPE_PRICE_IDS.starter_yearly,
  growth_monthly: STRIPE_PRICE_IDS.growth_monthly,
  growth_yearly: STRIPE_PRICE_IDS.growth_yearly,
  pro_monthly: STRIPE_PRICE_IDS.pro_monthly,
  pro_yearly: STRIPE_PRICE_IDS.pro_yearly,
  agency_monthly: STRIPE_PRICE_IDS.agency_monthly,
  agency_yearly: STRIPE_PRICE_IDS.agency_yearly,
};

const planLabels: Record<PlanKey, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  agency: "Agency",
};

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const plan = (searchParams.get("plan") || "growth") as PlanKey;
  const interval = (searchParams.get("interval") || "monthly") as IntervalKey;
  const key = `${plan}_${interval}` as `${PlanKey}_${IntervalKey}`;
  const priceId = priceIdMap[key];

  const fetchClientSecret = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: { priceId },
    });

    if (error || !data?.clientSecret) {
      setError("Unable to initialize checkout. Please try again.");
      throw new Error("Failed to get client secret");
    }

    return data.clientSecret as string;
  }, [priceId]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              Complete your {planLabels[plan]} plan subscription
            </h1>
            <p className="text-sm text-muted-foreground">
              14-day free trial · Cancel anytime · {interval === "yearly" ? "Annual" : "Monthly"} billing
            </p>
          </div>
          <img
            src="/salesos-logo-small.webp"
            alt="SalesOS"
            className="h-8 w-auto hidden sm:block"
          />
        </div>
      </div>

      {/* Checkout body */}
      <div className="container mx-auto px-4 sm:px-6 py-8 max-w-3xl">
        <div className="mb-6 rounded-2xl border border-border/40 bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground mb-2">What happens next</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            After checkout, SalesOS will confirm your plan and guide you into account setup or sign-in. If anything looks off, you can return to pricing or contact support.
          </p>
          <p className="text-xs text-muted-foreground/80">
            14-day trial where applicable • Cancel anytime • 30-day money-back guarantee
          </p>
        </div>
        {error ? (
          <div className="text-center py-16">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={() => navigate("/pricing")}>
              Return to pricing
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/40 overflow-hidden bg-card">
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
