import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getPlanSearchLimits, PLAN_SEARCH_LIMITS, type PlanId } from '../../supabase/functions/_shared/plan-limits';

interface LeadsUsage {
  leadsCount: number;
  leadsLimit: number;
  plan: PlanId;
  percentageUsed: number;
}

export function resolveLeadsUsage(leadsCount: number, storedPlan: string, currentPlan?: string): LeadsUsage {
  const candidate = currentPlan ?? storedPlan;
  const normalized = candidate === 'elite' ? 'pro' : candidate;
  const plan: PlanId = Object.prototype.hasOwnProperty.call(PLAN_SEARCH_LIMITS, normalized)
    ? normalized as PlanId : 'free';
  const leadsLimit = getPlanSearchLimits(plan).monthlySearchCredits;
  return { leadsCount, leadsLimit, plan, percentageUsed: (leadsCount / leadsLimit) * 100 };
}

export const useLeadsUsage = (currentPlan?: string) => {
  const [storedUsage, setStoredUsage] = useState<{ leadsCount: number; plan: string } | null>(null);
  const usage = storedUsage ? resolveLeadsUsage(storedUsage.leadsCount, storedUsage.plan, currentPlan) : null;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_leads_usage');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const usageData = data[0];
        // The legacy RPC's leads_limit can still contain the old Free default.
        // Resolve the displayed allowance from the current plan's canonical limits.
        setStoredUsage({
          leadsCount: Number(usageData.leads_count),
          plan: String(usageData.plan),
        });
      }
    } catch (error) {
      console.error('Error loading leads usage:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    usage,
    loading,
    refreshUsage: loadUsage,
  };
};
