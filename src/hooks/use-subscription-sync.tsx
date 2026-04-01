import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useSubscriptionSync = () => {
  const syncSubscription = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Subscription sync error:', error);
        return { success: false, error: error.message };
      }

      console.log('Subscription synced:', data);
      return { success: true, data };
    } catch (error) {
      console.error('Unexpected sync error:', error);
      return { success: false, error: 'Failed to sync subscription' };
    }
  }, []);

  const manualSync = useCallback(async () => {
    const result = await syncSubscription();
    
    if (result.success) {
      toast.success('Subscription status updated successfully');
      // Trigger a refresh of subscription data
      window.location.reload();
    } else {
      toast.error('Failed to sync subscription status');
    }
    
    return result;
  }, [syncSubscription]);

  useEffect(() => {
    // Sync on mount (login/page load)
    syncSubscription();

    // Set up periodic sync every 5 minutes
    const intervalId = setInterval(() => {
      syncSubscription();
    }, 5 * 60 * 1000);

    // Set up auth state change listener
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        syncSubscription();
      }
    });

    return () => {
      clearInterval(intervalId);
      authSubscription.unsubscribe();
    };
  }, [syncSubscription]);

  return {
    syncSubscription,
    manualSync
  };
};
