import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, requireInternalOrAdmin } from "../_shared/internal-auth.ts";
import { verifyGoogleCredential } from "../_shared/google-credential-check.ts";

/**
 * Which integration secrets this deployment actually has.
 *
 * Google sending broke and stayed broken for days because nothing could
 * answer one question: are `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
 * present in the edge-function environment? `google-oauth-init` knew — it
 * throws when the id is missing — but it turned that into the same opaque 500
 * as every other failure, so the answer existed and nobody could read it.
 * Rotating the credential repeatedly is what you do when you cannot tell
 * whether the last rotation landed.
 *
 * Reports presence, length and a short fingerprint. NEVER the value. A length
 * and a hash prefix are enough to tell "nothing is set" from "something is set
 * but it is not what I just pasted" — which is the distinction that was
 * missing — without putting a credential on a screen or in a log.
 *
 * Same gate as the SMTP probe: any signed-in user, because the answer is
 * yes/no about configuration and contains no secret.
 */

const SECRETS = [
  { key: "GOOGLE_CLIENT_ID", used: "Connecting a Gmail mailbox, refreshing its token, sending, reading replies" },
  { key: "GOOGLE_CLIENT_SECRET", used: "The same, at the token-exchange and refresh steps" },
  { key: "SUPABASE_URL", used: "Every function that talks to the database" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", used: "Every function that reads a row on a user's behalf" },
  { key: "SUPABASE_ANON_KEY", used: "Verifying a caller's session" },
  /*
   * Only `send-seo-digest` reads this. The label said "invites, alerts,
   * password resets", which was wrong and alarming in the one place that must
   * not be: a panel read while something is already broken. Transactional
   * mail — password resets, auth links — goes through Supabase's own mailer
   * via `auth-email-hook`, which needs no key here, so this being unset costs
   * the SEO digest and nothing a customer sees.
   */
  { key: "RESEND_API_KEY", used: "The weekly SEO digest only — not password resets or auth email" },
  { key: "INTERNAL_TRIGGER_SECRET", used: "Letting pg_cron call the scheduled workers" },
] as const;

/** First 8 hex of SHA-256. Enough to compare two values, useless for recovering one. */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const unauth = await requireInternalOrAdmin(req);
  if (unauth) return unauth;

  const secrets = [];
  for (const { key, used } of SECRETS) {
    const value = Deno.env.get(key) ?? "";
    secrets.push({
      key,
      used,
      present: value.length > 0,
      length: value.length,
      fingerprint: value ? await fingerprint(value) : null,
      /*
       * A value that is only whitespace, or that still has quotes around it,
       * is set as far as `Deno.env.get` is concerned and wrong everywhere it
       * is used. Pasting into a secrets box is exactly where that happens.
       */
      suspicious: value.length > 0 && (value.trim().length !== value.length || /^["']|["']$/.test(value)),
    });
  }

  const missing = secrets.filter((s) => !s.present).map((s) => s.key);
  const suspicious = secrets.filter((s) => s.suspicious).map((s) => s.key);

  /*
   * Presence is not correctness, and the gap between the two is where Google
   * sign-in lived for days: the secret was set, the right length, and wrong.
   * So the pair is put to Google itself.
   *
   * Scope, stated because it is the part that misleads: this reads the EDGE
   * FUNCTION secret. The auth provider keeps its own separate copy of the
   * same credential, and that copy is what signs users in. A "valid" verdict
   * here therefore proves the secret exists in a working form and narrows a
   * sign-in failure to the auth provider's copy being a different, older one.
   */
  const google = await verifyGoogleCredential(
    Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  );

  return new Response(
    JSON.stringify({
      ok: missing.length === 0 && suspicious.length === 0,
      missing,
      suspicious,
      secrets,
      google: {
        ...google,
        scope:
          "Checked against Google. This is the copy the edge functions use for Gmail. The auth provider keeps a separate copy for sign-in, which this cannot read.",
      },
      note:
        missing.length === 0 && suspicious.length === 0
          ? "Every secret these functions read is set."
          : "A missing or padded secret fails at runtime, usually as a generic error.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
