import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresenceUser {
  user_id: string;
  /** Display name only. See the note on scoping below — no email goes on the wire. */
  name: string;
  avatar_url?: string | null;
  editing?: boolean;
  online_at: string;
}

/**
 * Track which people are currently viewing (or editing) the same record.
 * Pass a stable `recordKey` like `lead:<id>` or `deal:<id>`.
 *
 * Why the topic is scoped, and why there is no email in the payload:
 *
 * Presence rides a realtime channel, and a channel topic is joinable by anyone
 * who can guess it. `presence:lead:<id>` was guessable from a lead id alone,
 * and the payload carried the viewer's email address — so an unrelated account
 * that learned an id could sit on the topic and collect who was working the
 * record. The topic now includes the id of the account the record lives under
 * (the team owner), which only teammates and the owner can resolve, and the
 * payload carries a display name instead of an email. Real teammates see each
 * other exactly as before; a stranger has nothing to join and nothing to read.
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

      // The account the work belongs to: the team owner when this person was
      // invited into someone else's account, otherwise themselves.
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_owner_id")
        .eq("member_user_id", user.id)
        .eq("status", "accepted")
        .limit(1)
        .maybeSingle();
      const scopeId = membership?.team_owner_id ?? user.id;
      if (cancelled) return;

      const meta = (user.user_metadata || {}) as Record<string, any>;
      const me: PresenceUser = {
        user_id: user.id,
        name: meta.full_name ?? meta.name ?? user.email?.split("@")[0] ?? "Teammate",
        avatar_url: meta.avatar_url ?? null,
        editing,
        online_at: new Date().toISOString(),
      };

      channel = supabase.channel(`presence:${scopeId}:${recordKey}`, {
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
