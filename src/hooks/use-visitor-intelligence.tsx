import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** True only when the kill switch and this workspace's admin grant are both on. */
export function useVisitorIntelligence() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.rpc("visitor_intelligence_enabled").then(({ data, error }) => {
      if (!active) return;
      setEnabled(data === true && !error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { enabled, loading };
}
