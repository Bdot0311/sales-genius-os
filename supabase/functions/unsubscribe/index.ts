import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@^2.76.1';

/**
 * The opt-out endpoint, for a person clicking and for a mail client posting.
 *
 * It was GET only. RFC 8058 one-click — the thing Gmail and Yahoo require of
 * bulk senders, and what List-Unsubscribe-Post advertises — is a POST with no
 * body the client makes itself, without ever showing the page. A GET-only
 * endpoint answering that POST means the header promises a control that does
 * nothing, which is worse than sending no header: the recipient presses
 * unsubscribe, the client reports it done, and the next email arrives.
 *
 * Both verbs land in the same place. A browser gets the page; a client gets
 * 200 and nothing to render.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const html = (body: string, status = 200) =>
  new Response(
    `<html><body style="font-family:-apple-system,sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#333">${body}</body></html>`,
    { status, headers: { ...corsHeaders, 'Content-Type': 'text/html' } }
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const oneClick = req.method === "POST";
  // A one-click POST has nobody to show a page to.
  const fail = (message: string) =>
    oneClick
      ? new Response(JSON.stringify({ ok: false, error: message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      : html(`<h2 style="font-weight:600">Invalid unsubscribe link</h2><p style="color:#666">${message}</p>`);

  const url = new URL(req.url);
  let token = url.searchParams.get('token');

  /*
   * Some clients post the List-Unsubscribe=One-Click pair as a form body
   * rather than keeping the query string, so the token can arrive either way.
   */
  if (!token && oneClick) {
    try {
      const form = await req.formData();
      token = (form.get("token") as string | null) ?? null;
    } catch {
      // No body, or not a form. The query string was the only other option.
    }
  }

  if (!token) return fail("Missing token.");

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: tokenRecord, error: lookupError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('email, user_id, used_at')
    .eq('token', token)
    .maybeSingle();

  if (lookupError || !tokenRecord) return fail("This link is not valid.");

  const email = tokenRecord.email;

  // Mark token used (idempotent — a second visit just re-confirms).
  await supabase
    .from('email_unsubscribe_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  /*
   * Recorded against the sender whose email carried the token.
   *
   * It used to be written with the address alone, so unsubscribing from one
   * account stopped every other account on the platform from mailing that
   * person — and told them, by refusing the send, that somebody else had
   * already been there. A NULL user_id still means every sender, which is
   * what rows written before this keep.
   */
  const address = email.toLowerCase().trim();
  const senderId = tokenRecord.user_id ?? null;

  if (senderId) {
    await supabase.from('email_optouts').upsert(
      { email: address, user_id: senderId, opted_out_at: new Date().toISOString() },
      { onConflict: 'user_id,email' },
    );
  } else {
    /*
     * A token minted before opt-outs carried a sender. It can only produce a
     * global row, and the uniqueness there is a PARTIAL index (email WHERE
     * user_id IS NULL) that ON CONFLICT cannot infer through PostgREST. So it
     * is read first and written only when absent, rather than upserted into a
     * constraint the query cannot name.
     */
    const { data: existing } = await supabase
      .from('email_optouts')
      .select('id')
      .eq('email', address)
      .is('user_id', null)
      .maybeSingle();
    if (!existing) {
      await supabase
        .from('email_optouts')
        .insert({ email: address, user_id: null, opted_out_at: new Date().toISOString() });
    }
  }

  if (oneClick) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return html(
    '<h2 style="font-weight:600">You\'ve been unsubscribed</h2>' +
    '<p style="color:#666">You won\'t receive any more emails from this sender.</p>'
  );
});
