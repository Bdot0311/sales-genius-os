import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PLAN_CONFIG, type PlanType } from '@/lib/stripe-config';
import { useAdmin } from './use-admin';

interface SearchCredits {
  baseCredits: number;
  addonCredits: number;
  totalCredits: number;
  remainingCredits: number;
  dailySearchesUsed: number;
  dailySearchLimit: number;
  plan: PlanType;
  addonPriceId: string | null;
  creditsResetAt: string | null;
}

export const useSearchCredits = () => {
  const [credits, setCredits] = useState<SearchCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const { isAdmin } = useAdmin();

  const fetchCredits = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setCredits(null);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan, search_credits_base, search_credits_addon, search_credits_remaining, daily_searches_used, daily_searches_reset_at, credits_reset_at, addon_price_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const plan = (data.plan || 'free') as PlanType;
        const planConfig = PLAN_CONFIG[plan];
        
        setCredits({
          baseCredits: data.search_credits_base || planConfig.monthlyProspects,
          addonCredits: data.search_credits_addon || 0,
          totalCredits: (data.search_credits_base || planConfig.monthlyProspects) + (data.search_credits_addon || 0),
          remainingCredits: data.search_credits_remaining || planConfig.monthlyProspects,
          dailySearchesUsed: data.daily_searches_used || 0,
          dailySearchLimit: planConfig.dailyLimit,
          plan,
          addonPriceId: data.addon_price_id,
          creditsResetAt: data.credits_reset_at,
        });
      }
    } catch (error) {
      console.error('Error fetching search credits:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const purchaseTopUp = useCallback(async (priceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in first');
        return { success: false };
      }

      const { data, error } = await supabase.functions.invoke('purchase-credit-topup', {
        body: { priceId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.open(data.url, '_blank');
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start checkout';
      toast.error(message);
      return { success: false, error: message };
    }
  }, []);

  const verifyTopUp = useCallback(async (sessionId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false };

      const { data, error } = await supabase.functions.invoke('verify-topup-payment', {
        body: { sessionId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.success && !data?.already_processed) {
        toast.success(`${data.prospects_added} prospect credits added!`);
      }

      await fetchCredits();
      return { success: true, ...data };
    } catch (error) {
      console.error('Error verifying topup:', error);
      return { success: false };
    }
  }, [fetchCredits]);

  const useCredit = useCallback(async (amount: number = 1, description?: string) => {
    // Admin users bypass credit checks
    if (isAdmin) {
      return { success: true };
    }

    if (!credits || credits.remainingCredits < amount) {
      toast.error('Insufficient search credits');
      return { success: false };
    }

    if (credits.dailySearchesUsed >= credits.dailySearchLimit) {
      toast.error('Daily search limit reached');
      return { success: false };
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false };

      const newRemaining = credits.remainingCredits - amount;
      const newDailyUsed = credits.dailySearchesUsed + 1;

      // Update credits in database
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          search_credits_remaining: newRemaining,
          daily_searches_used: newDailyUsed,
        })
        .eq('user_id', session.user.id);

      if (updateError) throw updateError;

      // Log transaction
      await supabase.from('search_transactions').insert({
        user_id: session.user.id,
        type: 'usage',
        amount: -amount,
        balance_after: newRemaining,
        description: description || 'Search query',
      });

      setCredits(prev => prev ? {
        ...prev,
        remainingCredits: newRemaining,
        dailySearchesUsed: newDailyUsed,
      } : null);

      return { success: true };
    } catch (error) {
      console.error('Error using credit:', error);
      return { success: false };
    }
  }, [credits, isAdmin]);

  return {
    credits,
    loading,
    fetchCredits,
    purchaseTopUp,
    verifyTopUp,
    useCredit,
    // Admins always have unlimited credits
    hasCredits: isAdmin ? true : (credits ? credits.remainingCredits > 0 : false),
    canSearch: isAdmin ? true : (credits ? credits.dailySearchesUsed < credits.dailySearchLimit && credits.remainingCredits > 0 : false),
  };
};
