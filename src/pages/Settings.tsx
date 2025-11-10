import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-subscription";
import { useLeadsUsage } from "@/hooks/use-leads-usage";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CreditCard, TrendingUp, Check } from "lucide-react";

const Settings = () => {
  const { subscription, loading: subLoading } = useSubscription();
  const { usage, loading: usageLoading } = useLeadsUsage();

  const plans = [
    {
      name: 'Growth',
      value: 'growth',
      price: '$49',
      features: [
        '1,000 leads',
        'Basic pipeline management',
        'Email integration',
        'Standard support'
      ]
    },
    {
      name: 'Pro',
      value: 'pro',
      price: '$99',
      features: [
        '10,000 leads',
        'Advanced automations',
        'AI-powered coach',
        'Advanced analytics',
        'Priority support'
      ]
    },
    {
      name: 'Elite',
      value: 'elite',
      price: '$199',
      features: [
        'Unlimited leads',
        'Everything in Pro',
        'API access',
        'Custom integrations',
        'Dedicated support'
      ]
    }
  ];

  const handleCheckout = async (plan: 'growth' | 'pro' | 'elite') => {
    try {
      const priceIds = {
        growth: 'price_growth_monthly',
        pro: 'price_pro_monthly',
        elite: 'price_elite_monthly'
      };

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId: priceIds[plan] }
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout process');
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('Failed to open customer portal');
    }
  };

  if (subLoading || usageLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your subscription and usage</p>
        </div>

        {usage && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Leads Usage
              </CardTitle>
              <CardDescription>
                Track your leads usage against your plan limit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{usage.leadsCount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">
                    of {usage.leadsLimit.toLocaleString()} leads used
                  </p>
                </div>
                <Badge variant={usage.percentageUsed > 90 ? 'destructive' : 'secondary'}>
                  {usage.percentageUsed.toFixed(1)}%
                </Badge>
              </div>
              <Progress value={usage.percentageUsed} className="h-2" />
              {usage.percentageUsed > 80 && (
                <p className="text-sm text-amber-600">
                  You're approaching your leads limit. Consider upgrading your plan.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Plans
            </CardTitle>
            <CardDescription>
              Choose the plan that works best for you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isCurrentPlan = subscription?.plan === plan.value;
                return (
                  <Card key={plan.value} className={isCurrentPlan ? 'border-primary' : ''}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>{plan.name}</CardTitle>
                        {isCurrentPlan && (
                          <Badge>Current Plan</Badge>
                        )}
                      </div>
                      <CardDescription>
                        <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                        <span className="text-muted-foreground">/month</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="space-y-2">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      {isCurrentPlan ? (
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={handleManageSubscription}
                        >
                          Manage Subscription
                        </Button>
                      ) : (
                        <Button 
                          className="w-full"
                          onClick={() => handleCheckout(plan.value as 'growth' | 'pro' | 'elite')}
                        >
                          {subscription && subscription.plan !== plan.value ? 'Change Plan' : 'Get Started'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
