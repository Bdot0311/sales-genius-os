import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether this account still owes us the signup questionnaire.
 *
 * Read from the server, never from localStorage — the whole point of the gate
 * is that clearing browser storage can't skip it.
 */
export const useOnboardingGate = () => {
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("onboarding_progress")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      // A missing row means a brand-new account: gate it.
      if (error) setNeedsOnboarding(false);
      else setNeedsOnboarding(!data || data.onboarding_completed !== true);
      setLoading(false);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, needsOnboarding };
};
