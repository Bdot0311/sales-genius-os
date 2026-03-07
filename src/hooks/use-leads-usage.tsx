import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LeadsUsage {
  leadsCount: number;
  leadsLimit: number;
  plan: 'free' | 'growth' | 'pro' | 'elite';
  percentageUsed: number;
}

export const useLeadsUsage = () => {
  const [usage, setUsage] = useState<LeadsUsage | null>(null);
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
        setUsage({
          leadsCount: Number(usageData.leads_count),
          leadsLimit: usageData.leads_limit,
          plan: usageData.plan,
          percentageUsed: (Number(usageData.leads_count) / usageData.leads_limit) * 100,
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
