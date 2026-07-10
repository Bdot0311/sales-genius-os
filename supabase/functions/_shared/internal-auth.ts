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

