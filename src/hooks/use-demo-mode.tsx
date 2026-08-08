import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DemoModeState {
  enabled: boolean;
  seededAt: string | null;
  adminUserId: string | null;
}

const EMPTY: DemoModeState = { enabled: false, seededAt: null, adminUserId: null };

function parse(value: unknown): DemoModeState {
  if (!value || typeof value !== "object") return EMPTY;
  const v = value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    seededAt: typeof v.seeded_at === "string" ? v.seeded_at : null,
    adminUserId: typeof v.admin_user_id === "string" ? v.admin_user_id : null,
  };
}

/**
 * Demo mode is scoped to a single admin account: it only reports `active`
 * when the signed-in user is the admin who turned it on.
 */
export const useDemoMode = () => {
  const [state, setState] = useState<DemoModeState>(EMPTY);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id ?? null;
    setUserId(uid);

    if (!uid) {
      setState(EMPTY);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("admin_settings")
      .select("setting_value")
      .eq("setting_key", "demo_mode")
      .maybeSingle();

    setState(parse(data?.setting_value));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel("demo-mode-setting")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_settings", filter: "setting_key=eq.demo_mode" },
        () => { load(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const isDemoMode = state.enabled && !!userId && state.adminUserId === userId;

  return { isDemoMode, state, loading, refresh: load };
};
