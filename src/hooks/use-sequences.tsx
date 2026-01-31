import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Sequence {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  total_enrollments: number | null;
  total_completed: number | null;
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_days: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  step_type: string;
  trigger_condition: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  lead_id: string;
  user_id: string;
  current_step: number;
  engagement_state: string;
  status: string;
  paused_reason: string | null;
  next_action_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  last_activity_at: string | null;
}

export function useSequences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sequences, isLoading, error } = useQuery({
    queryKey: ['sequences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Sequence[];
    },
  });

  const createSequence = useMutation({
    mutationFn: async (newSequence: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('email_sequences')
        .insert({
          user_id: user.id,
          name: newSequence.name,
          description: newSequence.description || null,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data as Sequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      toast({
        title: "Sequence created",
        description: "Your new email sequence has been created.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSequence = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Sequence> & { id: string }) => {
      const { data, error } = await supabase
        .from('email_sequences')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Sequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSequence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_sequences')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      toast({
        title: "Sequence deleted",
        description: "The sequence has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    sequences: sequences ?? [],
    isLoading,
    error,
    createSequence,
    updateSequence,
    deleteSequence,
  };
}

export function useSequenceSteps(sequenceId: string | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: steps, isLoading, error } = useQuery({
    queryKey: ['sequence-steps', sequenceId],
    queryFn: async () => {
      if (!sequenceId) return [];

      const { data, error } = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', sequenceId)
        .order('step_number', { ascending: true });

      if (error) throw error;
      return data as SequenceStep[];
    },
    enabled: !!sequenceId,
  });

  const createStep = useMutation({
    mutationFn: async (newStep: Omit<SequenceStep, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('sequence_steps')
        .insert(newStep)
        .select()
        .single();

      if (error) throw error;
      return data as SequenceStep;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence-steps', sequenceId] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStep = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SequenceStep> & { id: string }) => {
      const { data, error } = await supabase
        .from('sequence_steps')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as SequenceStep;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence-steps', sequenceId] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sequence_steps')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequence-steps', sequenceId] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    steps: steps ?? [],
    isLoading,
    error,
    createStep,
    updateStep,
    deleteStep,
  };
}

export function useSequenceEnrollments(sequenceId?: string) {
  const { data: enrollments, isLoading, error } = useQuery({
    queryKey: ['sequence-enrollments', sequenceId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from('sequence_enrollments')
        .select(`
          *,
          leads:lead_id (
            id,
            contact_name,
            company_name,
            contact_email,
            engagement_state
          )
        `)
        .eq('user_id', user.id);

      if (sequenceId) {
        query = query.eq('sequence_id', sequenceId);
      }

      const { data, error } = await query.order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  return {
    enrollments: enrollments ?? [],
    isLoading,
    error,
  };
}
