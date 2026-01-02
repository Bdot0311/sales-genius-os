import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PLAN_FEATURES, type PlanType } from '@/lib/plan-features';
import { useAdmin } from './use-admin';

export type SubscriptionPlan = 'growth' | 'pro' | 'elite';

export interface UserSubscription {
  plan: SubscriptionPlan;
  hasAutomations: boolean;
  hasAiCoach: boolean;
  hasAnalytics: boolean;
  hasApiAccess: boolean;
  leadsLimit: number;
  // Plan feature details
  features: typeof PLAN_FEATURES[PlanType];
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
      const { data, error } = await supabase.rpc('get_user_plan');
      
      if (error) throw error;
      
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
        });
      } else {
        // Default to growth plan
        setSubscription({
          plan: 'growth',
          hasAutomations: false,
          hasAiCoach: false,
          hasAnalytics: false,
          hasApiAccess: false,
          leadsLimit: 500,
          features: PLAN_FEATURES.growth,
        });
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      // Default to growth plan on error
      setSubscription({
        plan: 'growth',
        hasAutomations: false,
        hasAiCoach: false,
        hasAnalytics: false,
        hasApiAccess: false,
        leadsLimit: 500,
        features: PLAN_FEATURES.growth,
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
