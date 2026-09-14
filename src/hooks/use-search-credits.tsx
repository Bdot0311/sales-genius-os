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

      const plan = (data?.plan || 'free') as PlanType;
      const planConfig = PLAN_CONFIG[plan];

      setCredits({
        baseCredits: data?.search_credits_base || planConfig.monthlyProspects,
        addonCredits: data?.search_credits_addon || 0,
        totalCredits: (data?.search_credits_base || planConfig.monthlyProspects) + (data?.search_credits_addon || 0),
        remainingCredits: data?.search_credits_remaining ?? planConfig.monthlyProspects,
        dailySearchesUsed: data?.daily_searches_used || 0,
        dailySearchLimit: planConfig.dailyLimit,
        plan,
        addonPriceId: data?.addon_price_id ?? null,
        creditsResetAt: data?.credits_reset_at ?? null,
      });
    } catch (error) {
      console.error('Error fetching search credits:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  /**
   * Follow the balance instead of reading it once.
   *
   * "Credits don't move on the UI — I have 86 leads enriched many times and it
   * still says 15,000 of 15,000 every day."
   *
   * The deduction happens server-side, inside the edge functions, precisely so
   * a client cannot be the thing that decides what was spent. useCredit below
   * is not on that path — the leads page says so in as many words — so the only
   * client-side write to this state never fires for a search. Nothing else
   * refetched, so the number was whatever it had been at mount and stayed there
   * until a full page reload. A meter that updates once a session is not a
   * meter.
   *
   * `subscriptions` is already in the realtime publication, so this is a
   * subscription to the row that was already being broadcast, filtered to the
   * one user. Reconnecting also refetches, because a socket that dropped during
   * a search comes back to a stale number otherwise.
   */
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      channel = supabase
        .channel(`search-credits:${session.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "subscriptions",
            filter: `user_id=eq.${session.user.id}`,
          },
          () => { void fetchCredits(); },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void fetchCredits();
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchCredits]);

  /**
   * Refetch when the tab comes back to the foreground.
   *
   * The allowance also changes without any action in this tab — a scheduled
   * run, another tab, the monthly reset — and realtime only covers the window
   * the socket was actually open for.
   */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void fetchCredits(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

      // Use server-side RPC for atomic credit deduction
      const { data, error } = await supabase.rpc('deduct_search_credits', {
        _amount: amount,
        _description: description || 'Search query',
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; remaining?: number; daily_used?: number };
      
      if (!result.success) {
        toast.error(result.error || 'Failed to use credit');
        return { success: false };
      }

      setCredits(prev => prev ? {
        ...prev,
        remainingCredits: result.remaining ?? prev.remainingCredits - amount,
        dailySearchesUsed: result.daily_used ?? prev.dailySearchesUsed + 1,
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
    // Searching is free on paid plans — a credit is spent when a lead is
    // revealed — so only the free tier, which spends its allowance per search,
    // can be stopped by an empty balance. The daily rate limit binds everyone.
    canSearch: isAdmin ? true : (credits
      ? credits.dailySearchesUsed < credits.dailySearchLimit
        && (credits.plan !== 'free' || credits.remainingCredits > 0)
      : false),
  };
};
