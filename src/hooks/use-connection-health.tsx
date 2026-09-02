import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { diagnoseConnection, type ConnectionDiagnosis } from "@/lib/deliverability-verdict";
import type { SendingAccount } from "@/lib/deliverability-db";

/**
 * Whether each mailbox can currently send.
 *
 * The OAuth state lives on `integrations`, not on `sending_accounts`, so a
 * mailbox whose sign-in has lapsed still reads as "active" in the sending
 * table. Joining the two here is what turns "active" into the truth.
 */

interface IntegrationRow {
  id: string;
  is_active: boolean;
  config: unknown;
}

export interface MailboxConnection {
  account: SendingAccount;
  diagnosis: ConnectionDiagnosis;
}

function readTokenState(config: unknown): { expiresAt: number | null; hasRefreshToken: boolean } {
  const c = (config ?? {}) as Record<string, unknown>;
  const expiresAt = typeof c.expiresAt === "number" ? c.expiresAt : null;
  const hasRefreshToken = typeof c.refreshToken === "string" && c.refreshToken.length > 0;
  return { expiresAt, hasRefreshToken };
}

export function useConnectionHealth(accounts: SendingAccount[]) {
  const ids = accounts.map((a) => a.integration_id).filter((v): v is string => !!v);

  return useQuery({
    queryKey: ["connection-health", ids.slice().sort().join(",")],
    enabled: accounts.length > 0,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<MailboxConnection[]> => {
      let integrations = new Map<string, IntegrationRow>();
      if (ids.length > 0) {
        const { data } = await supabase
          .from("integrations")
          .select("id, is_active, config")
          .in("id", ids);
        integrations = new Map(((data as IntegrationRow[]) ?? []).map((r) => [r.id, r]));
      }

      return accounts.map((account) => {
        const integration = account.integration_id ? integrations.get(account.integration_id) : undefined;
        const { expiresAt, hasRefreshToken } = readTokenState(integration?.config);

        return {
          account,
          diagnosis: diagnoseConnection({
            email: account.email,
            status: account.status,
            pausedReason: account.paused_reason,
            sentToday: account.sent_today,
            dailyLimit: account.daily_limit,
            // No integration row at all means the link is gone, not that we
            // failed to read it — the account row still points at an id.
            integrationActive: integration ? integration.is_active : !account.integration_id,
            tokenExpiresAt: expiresAt,
            hasRefreshToken,
          }),
        };
      });
    },
  });
}
