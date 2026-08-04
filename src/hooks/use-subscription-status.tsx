import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdmin } from './use-admin';

export interface SubscriptionStatus {
  isTrialUser: boolean;
  isPaidUser: boolean;
  accountStatus: string | null;
  trialEndDate: string | null;
  hasStripeSubscription: boolean;
}

const PAID_PLANS = new Set(['starter', 'growth', 'pro', 'agency']);

export const useSubscriptionStatus = () => {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAdmin();

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus({
          isTrialUser: false,
          isPaidUser: false,
          accountStatus: null,
          trialEndDate: null,
          hasStripeSubscription: false,
        });
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, account_status, trial_end_date, stripe_subscription_id, status')
        .eq('user_id', session.user.id)
        .single();

      if (error) throw error;

      const trialEndTime = data?.trial_end_date ? new Date(data.trial_end_date).getTime() : 0;
      const isTrialUser = data?.account_status === 'trial' && trialEndTime > Date.now();
      const hasStripeSubscription = !!data?.stripe_subscription_id;
      // An unexpired trial receives the selected paid tier even when it was
      // granted manually and therefore has no Stripe subscription ID.
      const isPaidUser = data?.status === 'active' && (
        (isTrialUser && PAID_PLANS.has(data?.plan || 'free')) ||
        (data?.account_status === 'active' && hasStripeSubscription)
      );

      setStatus({
        isTrialUser,
        isPaidUser,
        accountStatus: data?.account_status || null,
        trialEndDate: data?.trial_end_date || null,
        hasStripeSubscription,
      });
    } catch (error) {
      console.error('Error loading subscription status:', error);
      setStatus({
        isTrialUser: false,
        isPaidUser: false,
        accountStatus: null,
        trialEndDate: null,
        hasStripeSubscription: false,
      });
    } finally {
      setLoading(false);
    }
  };

  // Admins are treated as fully paid users with no restrictions
  const effectiveStatus = isAdmin && status ? {
    ...status,
    isTrialUser: false,
    isPaidUser: true,
    accountStatus: 'admin',
    hasStripeSubscription: true,
  } : status;

  return {
    status: effectiveStatus,
    loading,
    refreshStatus: loadStatus,
    isAdmin,
  };
};
