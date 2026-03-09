import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PLAN_CONFIG, type PlanType } from '@/lib/stripe-config';
import { toast } from 'sonner';

interface ProspectUsage {
  monthlyUsed: number;
  monthlyLimit: number;
  dailyUsed: number;
  dailyLimit: number;
  plan: PlanType;
  canRevealProspect: boolean;
  dailyResetAt: string | null;
  monthlyResetAt: string | null;
}

export const useProspectUsage = () => {
  const [usage, setUsage] = useState<ProspectUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUsage(null);
        setLoading(false);
        return;
      }

      const { data: subData, error } = await supabase
        .from('subscriptions')
        .select('plan, search_credits_remaining, daily_searches_used, daily_searches_reset_at, credits_reset_at')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      const plan = (subData?.plan || 'free') as PlanType;
      const planConfig = PLAN_CONFIG[plan];
      
      // Check if daily counter needs reset (client-side check)
      const dailyResetAt = subData?.daily_searches_reset_at;
      const now = new Date();
      let dailyUsed = subData?.daily_searches_used || 0;
      
      if (dailyResetAt) {
        const resetDate = new Date(dailyResetAt);
        if (now >= resetDate) {
          // Reset needed - will be handled by backend, show 0 for now
          dailyUsed = 0;
        }
      }

      const monthlyUsed = (planConfig.monthlyProspects - (subData?.search_credits_remaining || 0));
      const monthlyLimit = planConfig.monthlyProspects;
      const dailyLimit = planConfig.dailyLimit;

      const canRevealProspect = 
        plan !== 'free' && 
        monthlyUsed < monthlyLimit && 
        dailyUsed < dailyLimit;

      setUsage({
        monthlyUsed: Math.max(0, monthlyUsed),
        monthlyLimit,
        dailyUsed,
        dailyLimit,
        plan,
        canRevealProspect,
        dailyResetAt: subData?.daily_searches_reset_at || null,
        monthlyResetAt: subData?.credits_reset_at || null,
      });
    } catch (error) {
      console.error('Error loading prospect usage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const checkCanReveal = useCallback((): { allowed: boolean; reason?: string } => {
    if (!usage) {
      return { allowed: false, reason: 'Loading usage data...' };
    }

    if (usage.plan === 'free') {
      return { 
        allowed: false, 
        reason: 'Upgrade to a paid plan to access verified prospects.' 
      };
    }

    if (usage.monthlyUsed >= usage.monthlyLimit) {
      return { 
        allowed: false, 
        reason: "You've reached your monthly prospect limit. Upgrade your plan or purchase additional prospect packs." 
      };
    }

    if (usage.dailyUsed >= usage.dailyLimit) {
      return { 
        allowed: false, 
        reason: "You've reached today's prospect limit. Please try again tomorrow." 
      };
    }

    return { allowed: true };
  }, [usage]);

  const consumeProspect = useCallback(async (count: number = 1): Promise<boolean> => {
    const check = checkCanReveal();
    if (!check.allowed) {
      toast.error(check.reason);
      return false;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Update both monthly and daily counters
      const { error } = await supabase
        .from('subscriptions')
        .update({
          search_credits_remaining: (usage?.monthlyLimit || 0) - (usage?.monthlyUsed || 0) - count,
          daily_searches_used: (usage?.dailyUsed || 0) + count,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh usage
      await loadUsage();
      return true;
    } catch (error) {
      console.error('Error consuming prospect:', error);
      toast.error('Failed to update usage');
      return false;
    }
  }, [usage, checkCanReveal, loadUsage]);

  return {
    usage,
    loading,
    refreshUsage: loadUsage,
    checkCanReveal,
    consumeProspect,
  };
};
