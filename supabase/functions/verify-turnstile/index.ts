// Verifies a Cloudflare Turnstile token server-side.
// Public endpoint (called before an account exists), but it only ever answers
// "is this token valid" — it holds no user data and grants no access on its own.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) {
      // Fail OPEN when the key isn't configured: a missing secret must not
      // lock every real user out of signup.
      console.warn("[VERIFY-TURNSTILE] TURNSTILE_SECRET_KEY not set - skipping verification");
      return json({ success: true, skipped: true });
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    if (!token) {
      return json({ success: false, reason: "missing_token" });
    }

    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) form.append("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const result = await res.json();

    if (!result.success) {
      console.log("[VERIFY-TURNSTILE] Rejected:", result["error-codes"]);
      return json({ success: false, reason: "failed", codes: result["error-codes"] ?? [] });
    }

    return json({ success: true });
  } catch (error) {
    console.error("[VERIFY-TURNSTILE] Error:", error);
    // Cloudflare unreachable / transient failure: fail open, same rationale as above.
    return json({ success: true, skipped: true, error: "verifier_unreachable" });
  }
});
