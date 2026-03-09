import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PLAN_FEATURES, type PlanType } from '@/lib/plan-features';
import { useAdmin } from './use-admin';

export type SubscriptionPlan = 'free' | 'starter' | 'growth' | 'pro' | 'elite';

export interface UserSubscription {
  plan: SubscriptionPlan;
  hasAutomations: boolean;
  hasAiCoach: boolean;
  hasAnalytics: boolean;
  hasApiAccess: boolean;
  leadsLimit: number;
  // Plan feature details
  features: typeof PLAN_FEATURES[PlanType];
  // Extended subscription details
  status?: string;
  accountStatus?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  searchCreditsBase?: number;
  searchCreditsRemaining?: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  creditsResetAt?: string;
}

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      // Get basic plan info from RPC
      const { data, error } = await supabase.rpc('get_user_plan');
      
      if (error) throw error;
      
      // Get extended subscription details
      const { data: { user } } = await supabase.auth.getUser();
      let extendedDetails = {
        status: 'active',
        accountStatus: 'active',
        stripeCustomerId: null as string | null,
        stripeSubscriptionId: null as string | null,
        searchCreditsBase: 0,
        searchCreditsRemaining: 0,
        currentPeriodStart: undefined as string | undefined,
        currentPeriodEnd: undefined as string | undefined,
        creditsResetAt: undefined as string | undefined,
      };

      if (user) {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (subData) {
          extendedDetails = {
            status: subData.status || 'active',
            accountStatus: subData.account_status || 'active',
            stripeCustomerId: subData.stripe_customer_id,
            stripeSubscriptionId: subData.stripe_subscription_id,
            searchCreditsBase: subData.search_credits_base || 350,
            searchCreditsRemaining: subData.search_credits_remaining || 350,
            currentPeriodStart: subData.current_period_start,
            currentPeriodEnd: subData.current_period_end,
            creditsResetAt: subData.credits_reset_at || undefined,
          };
        }
      }
      
      if (data && data.length > 0) {
        const planData = data[0];
        const plan = planData.plan as SubscriptionPlan;
        const features = PLAN_FEATURES[plan];
        
        setSubscription({
          plan,
          hasAutomations: planData.has_automations,
          hasAiCoach: planData.has_ai_coach,
          hasAnalytics: planData.has_analytics,
          hasApiAccess: planData.has_api_access,
          leadsLimit: planData.leads_limit,
          features,
          ...extendedDetails,
        });
      } else {
        // Default to free plan
        setSubscription({
          plan: 'free',
          hasAutomations: false,
          hasAiCoach: false,
          hasAnalytics: false,
          hasApiAccess: false,
          leadsLimit: 0,
          features: PLAN_FEATURES.free,
          ...extendedDetails,
        });
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Default to free plan on error
      setSubscription({
        plan: 'free',
        hasAutomations: false,
        hasAiCoach: false,
        hasAnalytics: false,
        hasApiAccess: false,
        leadsLimit: 0,
        features: PLAN_FEATURES.free,
        status: 'active',
        accountStatus: 'active',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        searchCreditsBase: 0,
        searchCreditsRemaining: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const hasFeature = (feature: 'automations' | 'coach' | 'analytics' | 'api') => {
    // Admins have access to all features
    if (isAdmin) return true;
    
    if (!subscription) return false;
    
    switch (feature) {
      case 'automations':
        return subscription.hasAutomations;
      case 'coach':
        return subscription.hasAiCoach;
      case 'analytics':
        return subscription.hasAnalytics;
      case 'api':
        return subscription.hasApiAccess;
      default:
        return false;
    }
  };

  return {
    subscription,
    loading,
    hasFeature,
    refreshSubscription: loadSubscription,
  };
};
