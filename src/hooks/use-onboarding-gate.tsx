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

      if (error) {
        setNeedsOnboarding(false);
      } else if (data) {
        setNeedsOnboarding(data.onboarding_completed !== true);
      } else {
        // No row at all. That is a brand-new account only if it was created
        // after the questionnaire shipped — accounts older than that predate
        // it and must never be bounced into a mandatory form.
        const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
        setNeedsOnboarding(createdAt >= QUESTIONNAIRE_LAUNCHED_AT);
      }
      setLoading(false);
    };


    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, needsOnboarding };
};
