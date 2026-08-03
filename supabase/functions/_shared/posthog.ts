// Server-side PostHog capture. Fire-and-forget: never throws, never blocks the
// caller — analytics must not break billing, signup or agent runs.
//
// Credentials come from the linked PostHog connector:
//   POSTHOG_API_KEY  — project (ingest) token
//   POSTHOG_REGION   — "eu" | "us"

const projectToken = Deno.env.get("POSTHOG_API_KEY");
const region = (Deno.env.get("POSTHOG_REGION") || "eu").toLowerCase();
const apiHost = region === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

export const isPostHogConfigured = Boolean(projectToken);

export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
  personProperties?: Record<string, unknown>,
): Promise<void> {
  if (!projectToken) return;
  if (!distinctId) return;
  try {
    const res = await fetch(`${apiHost}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: projectToken,
        event,
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        properties: {
          ...properties,
          source: "server",
          ...(personProperties ? { $set: personProperties } : {}),
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`[POSTHOG] capture failed for ${event} [${res.status}]: ${body}`);
    }
  } catch (e) {
    console.log(`[POSTHOG] capture error for ${event}: ${String(e)}`);
  }
}
