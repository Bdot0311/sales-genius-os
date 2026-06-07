// Shared rate-limit helper. Calls the public.consume_rate_limit RPC.
// Returns { allowed, retryAfterSeconds }. Fails open on DB errors so a database
// blip never takes down public endpoints.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

let cached: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cached;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await serviceClient().rpc("consume_rate_limit", {
      _key: key,
      _max: max,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc error, failing open:", error.message);
      return { allowed: true, retryAfter: 0 };
    }
    return { allowed: data === true, retryAfter: data === true ? 0 : windowSeconds };
  } catch (e) {
    console.error("[rate-limit] exception, failing open:", (e as Error).message);
    return { allowed: true, retryAfter: 0 };
  }
}

export function rateLimitResponse(retryAfter: number, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Please slow down." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
