import { createClient } from 'npm:@supabase/supabase-js@^2.76.1';
import { corsHeaders } from 'npm:@supabase/supabase-js@^2.76.1/cors';
import { claimDigest } from '../_shared/appsumo-licensing.ts';
import { safeOrigin } from '../_shared/safe-origin.ts';

const headers = { ...corsHeaders, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const fail = (message: string, status: number) => new Response(JSON.stringify({ success: false, error: message }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'GET') return fail('Method not allowed', 405);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const origin = safeOrigin(Deno.env.get('APPSUMO_APP_ORIGIN'));
  if (!code) return new Response('OutReign AppSumo redemption is ready. Activate your license on AppSumo, then sign in to OutReign to finish redemption.', { status: 200, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
  if (code.length > 512 || !/^[a-zA-Z0-9_-]+$/.test(code)) return fail('Invalid authorization code', 400);
  try {
    const clientId = Deno.env.get('APPSUMO_CLIENT_ID');
    const clientSecret = Deno.env.get('APPSUMO_CLIENT_SECRET');
    const redirectUri = Deno.env.get('APPSUMO_REDIRECT_URL');
    if (!clientId || !clientSecret || !redirectUri) return fail('AppSumo sign-in is not configured yet', 503);
    const tokenResponse = await fetch('https://appsumo.com/openid/token/', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code, grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) return fail('AppSumo authorization expired. Start redemption again on AppSumo.', 400);
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string' || !tokens.access_token) return fail('AppSumo authorization could not be completed', 400);
    const licenseUrl = new URL('https://appsumo.com/openid/license_key/');
    licenseUrl.searchParams.set('access_token', tokens.access_token);
    const licenseResponse = await fetch(licenseUrl, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!licenseResponse.ok) return fail('AppSumo license could not be verified', 400);
    const verified = await licenseResponse.json();
    if (typeof verified.license_key !== 'string' || verified.status !== 'active') return fail('This AppSumo license is not active', 403);
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
    const { data: license, error } = await db.from('appsumo_licenses').select('license_key,user_id,license_status,is_test').eq('license_key', verified.license_key).maybeSingle();
    if (error || !license || license.license_status !== 'active') return fail('License activation has not arrived yet. Retry redemption shortly.', 409);
    // Conformance licenses are recorded but must never grant a real account access.
    if (license.is_test) return new Response('AppSumo test authorization and license lookup completed.', { status: 200, headers: { ...headers, 'Content-Type': 'text/plain' } });
    if (license.user_id) {
      const { data: userData, error: userError } = await db.auth.admin.getUserById(license.user_id);
      const email = userData.user?.email;
      if (userError || !email) return fail('The linked account is unavailable. Contact support.', 409);
      const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${origin}/auth?next=%2Fdashboard` } });
      if (linkError || !link.properties?.action_link) return fail('Could not sign in to the linked account', 503);
      return new Response(null, { status: 302, headers: { ...headers, Location: link.properties.action_link } });
    }
    const claim = crypto.randomUUID() + crypto.randomUUID();
    const { error: claimError } = await db.from('appsumo_redemption_claims').insert({ token_hash: await claimDigest(claim), license_key: license.license_key, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() });
    if (claimError) return fail('Could not prepare license redemption', 503);
    return new Response(null, { status: 302, headers: { ...headers, Location: `${origin}/appsumo#claim=${claim}` } });
  } catch {
    console.error('AppSumo OAuth failed');
    return fail('AppSumo redemption is temporarily unavailable. Start again on AppSumo.', 503);
  }
});