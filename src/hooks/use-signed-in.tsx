import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the visitor has an account, resolved before they click anything.
 *
 * The landing page has no auth provider, and checking at click time is too
 * late: opening a booking tab has to happen inside the user gesture, so the
 * decision about which path a CTA takes must already be made.
 *
 * `null` means "not known yet". Callers treat that as signed out, which is the
 * safe default — the visitor gets the public booking link rather than a form
 * they can't submit.
 */
export function useIsSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(!!data.session);
    }).catch(() => {
      if (active) setSignedIn(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setSignedIn(!!session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
