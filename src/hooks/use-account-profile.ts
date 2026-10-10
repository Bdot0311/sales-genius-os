import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const accountProfileKey = (userId?: string) => ["account-profile", userId];

export function useAccountProfile(userId?: string) {
  return useQuery({
    queryKey: accountProfileKey(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) throw new Error("Sign in to view your profile.");
      const { data, error } = await supabase.from("profiles")
        .select("display_name, full_name, avatar_path").eq("id", userId).single();
      if (error) throw error;
      let avatarUrl: string | undefined;
      if (data.avatar_path) {
        const { data: image } = await supabase.storage.from("profile-avatars")
          .createSignedUrl(data.avatar_path, 3600);
        avatarUrl = image?.signedUrl;
      }
      return { ...data, avatarUrl };
    },
    refetchInterval: 30 * 60_000,
  });
}