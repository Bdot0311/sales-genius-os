// HeyCatch server-side business events. Never throws — analytics must not
// break billing processing.
import { analytics } from "npm:@heycatch/sdk@0.7.0";

analytics.init({ projectKey: "hck_pk_VgVASkSJkbBwJBEWh_CuEjUgEzDkKPNt" });

export async function trackBusinessEvent(
  name: string,
  userId: string,
  properties: Record<string, unknown> = {},
  personProperties?: Record<string, unknown>,
): Promise<void> {
  try {
    if (personProperties) await analytics.setIdentity(userId, personProperties);
    await analytics.trackEvent(name, properties as Record<string, string | number | boolean | null>, { userId });
  } catch (e) {
    console.log(`[HEYCATCH] track failed for ${name}: ${String(e)}`);
  }
}
