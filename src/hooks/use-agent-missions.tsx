import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
// Mission tables are not in generated types until their migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const missionsDb = supabase as any;

/** True only when the kill switch and this workspace's admin grant are both on. */
export function useAgentMissions() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    missionsDb.rpc("agent_missions_enabled").then(({ data, error }) => {
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
