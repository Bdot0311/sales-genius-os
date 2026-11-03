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


/**
 * Who a request is acting for.
 *
 * generate-email called auth.getUser() on whatever token arrived, and the batch
 * worker arrives holding the service role because nobody is sitting in front of
 * it. A service key is not a user, so every queued item got 401 and the queue
 * recorded a hundred per cent failure for as long as it existed.
 *
 * Fixing that in one function and then repeating it in enrich-lead, score-lead
 * and research-lead would be four copies of a security decision, and the copy
 * that drifts is the one nobody re-reads. So it is here.
 *
 * An internal caller comes back with `userId: null` — trusted, but it has NOT
 * said who it is acting for, and it does not get to. The caller resolves the
 * owner from the row it is about (`ownerOf` below), so the only thing a request
 * chooses is which record, and the database decides whose it is. A forged
 * user_id in a body cannot work because no body is ever read for one.
 */
export type Caller =
  | { ok: true; internal: true; userId: null }
  | { ok: true; internal: false; userId: string }
  | { ok: false; response: Response };

export async function resolveCaller(req: Request): Promise<Caller> {
  const unauthorized = (): Caller => ({
    ok: false,
    response: new Response(JSON.stringify({ error: "Unauthorized" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    }),
  });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return unauthorized();
  if (isInternalCaller(req)) return { ok: true, internal: true, userId: null };

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!token || !url || !anonKey) return unauthorized();

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!res.ok) return unauthorized();
  const user = await res.json().catch(() => null);
  if (!user?.id) return unauthorized();
  return { ok: true, internal: false, userId: String(user.id) };
}

/**
 * The owner of one row, and whether this caller may act on it.
 *
 * `admin` must be a service-role client: an internal caller has no session to
 * read the row with. Returns the owner's id, or null when the row does not
 * exist or belongs to somebody else — which are deliberately the same answer,
 * so the reply cannot be used to find out whose a record is.
 */
export async function ownerOf(
  admin: { from: (t: string) => any },
  table: string,
  id: string,
  caller: Caller,
): Promise<string | null> {
  if (!caller.ok || !id) return null;
  const { data } = await admin.from(table).select("user_id").eq("id", id).maybeSingle();
  const owner = data?.user_id ? String(data.user_id) : null;
  if (!owner) return null;
  if (!caller.internal && owner !== caller.userId) return null;
  return owner;
}

/**
 * Internal caller, or a signed-in user holding the admin role in
 * public.user_roles. For jobs that touch shared/site-wide data.
 */
export async function requireInternalOrAdmin(req: Request): Promise<Response | null> {
  const caller = await resolveCaller(req);
  if (!caller.ok) return caller.response;
  if (caller.internal) return null;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(`${url}/rest/v1/rpc/has_role`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ _user_id: caller.userId, _role: "admin" }),
  }).catch(() => null);
  const isAdmin = res?.ok ? (await res.json().catch(() => false)) === true : false;
  if (isAdmin) return null;
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 403,
  });
}
