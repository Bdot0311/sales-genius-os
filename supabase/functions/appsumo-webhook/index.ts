import { createClient } from 'npm:@supabase/supabase-js@^2.76.1';
import { corsHeaders } from 'npm:@supabase/supabase-js@^2.76.1/cors';
import { z } from 'npm:zod@3.25.76';
import { APP_SUMO_EVENTS, appSumoStatus, validAppSumoSignature } from '../_shared/appsumo-licensing.ts';

const schema = z.object({
  license_key: z.string().min(1).max(200), event: z.enum(APP_SUMO_EVENTS),
  event_timestamp: z.number().int().nonnegative(), created_at: z.number().optional(),
  license_status: z.string().max(40).optional(), status: z.string().max(40).optional(),
  tier: z.number().int().min(1).max(5).optional(), test: z.boolean().optional().default(false),
  prev_license_key: z.string().max(200).optional(), parent_license_key: z.string().max(200).optional(),
  partner_plan_name: z.string().max(255).optional(), unit_quantity: z.number().int().nonnegative().optional(),
  extra: z.record(z.unknown()).optional(),
});
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ success: false, error: 'Method not allowed' }, 405);
  try {
    const key = Deno.env.get('APPSUMO_PRIVATE_KEY');
    if (!key) return reply({ success: false, error: 'Licensing is not configured' }, 503);
    const raw = await req.text();
    if (raw.length > 32_768) return reply({ success: false, error: 'Payload too large' }, 413);
    if (!await validAppSumoSignature(raw, req.headers.get('X-Appsumo-Timestamp'), req.headers.get('X-Appsumo-Signature'), key)) return reply({ success: false, error: 'Invalid signature or expired request' }, 401);
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return reply({ success: false, error: 'Invalid license event' }, 400);
    const payload = parsed.data;
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
    const { error } = await db.rpc('appsumo_apply_event', { payload: { ...payload, resolved_status: appSumoStatus(payload.event, payload.license_status ?? payload.status) } });
    if (error) { console.error('AppSumo event persistence failed', { code: error.code }); return reply({ success: false, error: 'License update could not be saved' }, 503); }
    return reply({ success: true, event: payload.event });
  } catch {
    return reply({ success: false, error: 'License event could not be processed' }, 400);
  }
});