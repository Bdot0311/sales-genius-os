import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresenceUser {
  user_id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  editing?: boolean;
  online_at: string;
}

/**
 * Track which users are currently viewing (or editing) the same record.
 * Pass a stable `recordKey` like `lead:<id>` or `deal:<id>`.
 */
export function usePresence(recordKey: string | null, editing = false) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!recordKey) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const meta = (user.user_metadata || {}) as Record<string, any>;
      const me: PresenceUser = {
        user_id: user.id,
        email: user.email ?? "",
        name: meta.full_name ?? meta.name ?? null,
        avatar_url: meta.avatar_url ?? null,
        editing,
        online_at: new Date().toISOString(),
      };

      channel = supabase.channel(`presence:${recordKey}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<PresenceUser>();
          const flat = Object.values(state).flat() as PresenceUser[];
          setUsers(flat);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel!.track(me);
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [recordKey, editing]);

  return users;
}
