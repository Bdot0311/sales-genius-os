// Shared guard for internal-only edge functions (cron jobs, DB triggers).
// Accepts either:
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>  (admin/user callers)
//   Authorization: Bearer <INTERNAL_TRIGGER_SECRET>    (DB triggers/cron via vault)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function requireServiceRole(req: Request): Response | null {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const internalSecret = Deno.env.get("INTERNAL_TRIGGER_SECRET") ?? "";
  const ok = !!token && ((serviceKey && token === serviceKey) || (internalSecret && token === internalSecret));
  if (!ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }
  return null;
}

export function isInternalCaller(req: Request): boolean {
  return requireServiceRole(req) === null;
}

// For internal jobs that a signed-in user may also trigger manually from the
// app (e.g. "run warmup now"). Anonymous callers are always rejected.
export async function requireInternalOrUser(req: Request): Promise<Response | null> {
  if (isInternalCaller(req)) return null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (token && url && anonKey) {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    });
    if (res.ok) {
      const user = await res.json().catch(() => null);
      if (user?.id) return null;
    }
  }

  return new Response(JSON.stringify({ error: "Authentication required" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 401,
  });
}

