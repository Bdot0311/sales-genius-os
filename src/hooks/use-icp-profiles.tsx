import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ICPProfile {
  id: string;
  user_id: string;
  name: string;
  industries: string[];
  company_size_min: number;
  company_size_max: number;
  revenue_range: string | null;
  geographies: string[];
  target_titles: string[];
  tech_stack: string[];
  buying_signals: string[];
  pain_points: string[];
  disqualifiers: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useICPProfiles() {
  const queryClient = useQueryClient();

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ["icp-profiles"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("icp_profiles")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...d,
        industries: d.industries || [],
        geographies: d.geographies || [],
        target_titles: d.target_titles || [],
        tech_stack: d.tech_stack || [],
        buying_signals: d.buying_signals || [],
        pain_points: d.pain_points || [],
      })) as ICPProfile[];
    },
  });

  const createProfile = useMutation({
    mutationFn: async (profile: Partial<ICPProfile>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("icp_profiles")
        .insert({ ...profile, user_id: user.id, name: profile.name || "New ICP" })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-profiles"] });
      toast.success("ICP profile created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ICPProfile> & { id: string }) => {
      const { data, error } = await supabase
        .from("icp_profiles")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-profiles"] });
      toast.success("ICP profile updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("icp_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["icp-profiles"] });
      toast.success("ICP profile deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { profiles: profiles ?? [], isLoading, error, createProfile, updateProfile, deleteProfile };
}
