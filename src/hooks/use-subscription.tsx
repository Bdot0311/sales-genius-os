import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SubscriptionPlan = 'growth' | 'pro' | 'elite';

export interface UserSubscription {
  plan: SubscriptionPlan;
  hasAutomations: boolean;
  hasAiCoach: boolean;
  hasAnalytics: boolean;
  hasApiAccess: boolean;
  leadsLimit: number;
}

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_plan');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const planData = data[0];
        setSubscription({
          plan: planData.plan as SubscriptionPlan,
          hasAutomations: planData.has_automations,
          hasAiCoach: planData.has_ai_coach,
          hasAnalytics: planData.has_analytics,
          hasApiAccess: planData.has_api_access,
          leadsLimit: planData.leads_limit,
        });
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasFeature = (feature: 'automations' | 'coach' | 'analytics' | 'api') => {
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
