import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether this account agreed to its outbound outcomes being used to improve
 * the lead scoring.
 *
 * Three states, and the third is not a "no": `null` means nobody has been
 * asked yet. Every screen that shows this has to say which of the three it is,
 * because a toggle that reads off when the question was never put is a lie
 * about what the account agreed to.
 *
 * Read and written through the outcome-consent function rather than the table,
 * so the answer is timestamped by the server and recorded in a history that
 * cannot be edited afterwards.
 */
export type OutcomeConsent = boolean | null;

export interface OutcomeConsentState {
  consent: OutcomeConsent;
  decidedAt: string | null;
}

export const OUTCOME_CONSENT_KEY = ["outcome-consent"] as const;

async function readConsent(): Promise<OutcomeConsentState> {
  const { data, error } = await supabase.functions.invoke("outcome-consent", { body: { action: "read" } });
  if (error) throw error;
  const body = (data ?? {}) as { consent?: unknown; decided_at?: unknown; error?: string };
  if (body.error) throw new Error(body.error);
  return {
    consent: typeof body.consent === "boolean" ? body.consent : null,
    decidedAt: typeof body.decided_at === "string" ? body.decided_at : null,
  };
}

export function useOutcomeConsent(enabled = true) {
  return useQuery({
    queryKey: OUTCOME_CONSENT_KEY,
    queryFn: readConsent,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSetOutcomeConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { consent: boolean; source: "prompt" | "settings" }) => {
      const { data, error } = await supabase.functions.invoke("outcome-consent", {
        body: { action: "set", consent: input.consent, source: input.source },
      });
      if (error) throw error;
      const body = (data ?? {}) as { consent?: unknown; decided_at?: unknown; error?: string };
      if (body.error) throw new Error(body.error);
      return {
        consent: typeof body.consent === "boolean" ? body.consent : input.consent,
        decidedAt: typeof body.decided_at === "string" ? body.decided_at : null,
      } satisfies OutcomeConsentState;
    },
    onSuccess: (state) => {
      // Written straight in, so the Settings row and the prompt agree at once
      // rather than one of them showing the old answer until a refetch.
      queryClient.setQueryData(OUTCOME_CONSENT_KEY, state);
    },
  });
}

/** What a person should see for each of the three states, never an implied no. */
export function describeConsent(state: OutcomeConsentState | undefined): string {
  if (!state || state.consent === null) return "Not set";
  const when = state.decidedAt
    ? new Date(state.decidedAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;
  const verb = state.consent ? "On" : "Off";
  return when ? `${verb} since ${when}` : verb;
}
