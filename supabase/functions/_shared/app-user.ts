// Resolve app identity without a privileged userId bridge. API callers carry
// their actual key; OAuth callers carry their verified user bearer token.
export async function resolveAppUser(req: Request, db: any): Promise<
  { user: { id: string }; error: null } | { user: null; error: string; status: number }
> {
  const apiKey = req.headers.get("X-API-Key");
  if (!apiKey) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return { user: null, error: "Authentication required", status: 401 };
    const { data, error } = await db.auth.getUser(token);
    return error || !data?.user
      ? { user: null, error: "Authentication required", status: 401 }
      : { user: { id: data.user.id }, error: null };
  }
  const { data: key, error } = await db.from("api_keys")
    .select("id,user_id,expires_at").eq("key", apiKey).eq("is_active", true).maybeSingle();
  if (error || !key || (key.expires_at && Date.parse(key.expires_at) <= Date.now())) {
    return { user: null, error: "Invalid or expired API key", status: 401 };
  }
  const base = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !service) return { user: null, error: "Access check unavailable", status: 503 };
  const response = await fetch(`${base}/functions/v1/check-rate-limit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ apiKeyId: key.id, endpoint: "app-actions", internalCall: true }),
  }).catch(() => null);
  const rate = response?.ok ? await response.json().catch(() => null) : null;
  if (!rate) return { user: null, error: "Access check unavailable", status: 503 };
  if (!rate.allowed) return { user: null, error: rate.reason ?? "Request limit reached", status: /Starter|paid plan/i.test(rate.reason ?? "") ? 403 : 429 };
  // Direct app-function calls with a key count too, not only REST requests.
  const { error: logError } = await db.from("api_usage_log").insert({
    api_key_id: key.id, endpoint: new URL(req.url).pathname,
    method: req.method, status_code: 200, response_time_ms: 0,
  });
  if (logError) return { user: null, error: "Usage check unavailable", status: 503 };
  return { user: { id: key.user_id }, error: null };
}