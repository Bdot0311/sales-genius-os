import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ScoringWeights {
  title: number;
  industry: number;
  size: number;
  tech: number;
}

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
  // Advanced firmographics
  business_model: string | null;
  funding_stages: string[];
  growth_stage: string | null;
  company_age_range: string | null;
  deal_size_range: string | null;
  sales_cycle: string | null;
  // People
  departments: string[];
  seniority_levels: string[];
  budget_authority: string | null;
  // Signals
  event_triggers: string[];
  intent_keywords: string[];
  hiring_signals: string[];
  competitor_tools: string[];
  // Exclusions
  exclude_industries: string[];
  exclude_titles: string[];
  exclude_keywords: string[];
  // Strategy
  value_proposition: string | null;
  use_cases: string[];
  objections: string[];
  success_metrics: string[];
  preferred_channels: string[];
  customer_examples: string | null;
  // Scoring
  scoring_weights: ScoringWeights;
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
        departments: d.departments || [],
        seniority_levels: d.seniority_levels || [],
        funding_stages: d.funding_stages || [],
        event_triggers: d.event_triggers || [],
        intent_keywords: d.intent_keywords || [],
        hiring_signals: d.hiring_signals || [],
        competitor_tools: d.competitor_tools || [],
        exclude_industries: d.exclude_industries || [],
        exclude_titles: d.exclude_titles || [],
        exclude_keywords: d.exclude_keywords || [],
        use_cases: d.use_cases || [],
        objections: d.objections || [],
        success_metrics: d.success_metrics || [],
        preferred_channels: d.preferred_channels || [],
        scoring_weights: d.scoring_weights || { title: 25, industry: 25, size: 25, tech: 25 },
      })) as ICPProfile[];
    },
  });

  const createProfile = useMutation({
    mutationFn: async (profile: Partial<ICPProfile>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("icp_profiles")
        .insert({ ...(profile as any), user_id: user.id, name: profile.name || "New ICP" })
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
        .update(updates as any)
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
