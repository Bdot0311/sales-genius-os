import { createClient } from 'npm:@supabase/supabase-js@^2.76.1';
import { corsHeaders } from 'npm:@supabase/supabase-js@^2.76.1/cors';
import { z } from 'npm:zod@3.25.76';
import { claimDigest } from '../_shared/appsumo-licensing.ts';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('redeem'), claim: z.string().regex(/^[a-f0-9-]{72}$/) }),
  z.object({ action: z.literal('lookup'), license_key: z.string().min(1).max(200) }),
  z.object({ action: z.literal('status') }),
]);
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return reply({ error: 'Sign in to continue' }, 401);
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return reply({ error: 'Sign in to continue' }, 401);
    const input = schema.safeParse(await req.json());
    if (!input.success) return reply({ error: 'Invalid request' }, 400);
    if (input.data.action === 'redeem') {
      const { data, error } = await db.rpc('appsumo_claim_license', { claim_hash: await claimDigest(input.data.claim), owner_id: user.id });
      if (error) {
        const reasons = ['Redemption has expired or was already used', 'License is not redeemable', 'License belongs to a different account', 'This account already has an active license', 'An existing billed subscription must be resolved before redemption', 'AppSumo tier allowance is not configured'];
        return reply({ error: reasons.includes(error.message) ? error.message : 'Your license could not be linked. Contact support.' }, 409);
      }
      return reply(data);
    }
    if (input.data.action === 'lookup') {
      const { data: role, error: roleError } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (roleError || !role) return reply({ error: 'Administrator access required' }, 403);
      const key = input.data.license_key;
      const [license, events] = await Promise.all([
        db.from('appsumo_licenses').select('license_key,user_id,license_status,tier,is_test,prev_license_key,parent_license_key,event_timestamp,partner_plan_name,unit_quantity').eq('license_key', key).maybeSingle(),
        db.from('appsumo_license_events').select('event,event_timestamp,is_test,received_at,payload').eq('license_key', key).order('event_timestamp', { ascending: false }).limit(50),
      ]);
      if (license.error || events.error) return reply({ error: 'Could not load licensing history' }, 503);
      return reply({ license: license.data, events: events.data ?? [] });
    }
    const { data, error } = await db.from('appsumo_licenses').select('license_key,license_status,tier,is_test,partner_plan_name').eq('user_id', user.id).eq('is_test', false).order('event_timestamp', { ascending: false }).limit(10);
    if (error) return reply({ error: 'Could not load your licenses' }, 503);
    return reply({ licenses: data ?? [] });
  } catch { return reply({ error: 'Could not process licensing request' }, 400); }
});