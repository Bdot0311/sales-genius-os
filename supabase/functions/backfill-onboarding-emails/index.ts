// One-shot admin utility: sends the "onboarding-offer" transactional email to
// recent signups who haven't received it yet. Requires service_role auth.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Require service_role bearer
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.includes(SERVICE_ROLE)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 1), 90);

  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .gte('created_at', sinceIso)
    .not('email', 'is', null)
    .order('created_at', { ascending: false });

  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const emails = (profiles ?? []).map((p) => p.email!.toLowerCase());
  const { data: existing } = await supabase
    .from('email_send_log')
    .select('recipient_email, status')
    .eq('template_name', 'onboarding-offer')
    .in('recipient_email', emails);

  const already = new Set(
    (existing ?? [])
      .filter((r: any) => ['sent', 'pending'].includes(r.status))
      .map((r: any) => (r.recipient_email as string).toLowerCase()),
  );

  const results: Array<{ email: string; status: string; error?: string }> = [];

  for (const p of profiles ?? []) {
    const email = (p.email as string).toLowerCase();
    if (already.has(email)) {
      results.push({ email, status: 'skipped_already_sent' });
      continue;
    }

    const firstName = (p.full_name as string | null)?.split(' ')[0] || null;

    const { error: sendErr } = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'onboarding-offer',
        recipientEmail: p.email,
        idempotencyKey: `onboarding-offer-backfill-${p.id}`,
        templateData: { firstName },
      },
    });

    if (sendErr) {
      results.push({ email, status: 'failed', error: sendErr.message });
    } else {
      results.push({ email, status: 'queued' });
    }
  }

  return new Response(
    JSON.stringify({
      total: profiles?.length ?? 0,
      queued: results.filter((r) => r.status === 'queued').length,
      skipped: results.filter((r) => r.status === 'skipped_already_sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
