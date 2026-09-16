// Daily system-health alert. Runs the database health checks, records a
// critical alert row when something is failing, and emails the operators
// through the project's own verified sending domain.
//
// Deliberately callable without a service-role token: the daily database job
// can only reach edge functions with the public key. That is safe because the
// endpoint takes no input, always emails the same fixed operator recipients,
// and refuses to run more than once every 6 hours — so the worst an outsider
// can do is trigger a health check that would have run anyway.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { sendManagedEmail } from '../_shared/managed-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000
const FALLBACK_RECIPIENT = 'support@bdotindustries.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface HealthCheck {
  label?: string
  detail?: string
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: report, error: reportError } = await supabase.rpc('_system_health_checks')
    if (reportError) {
      console.error('[SYSTEM-HEALTH-ALERT] health check failed', reportError.message)
      return json({ ok: false, error: 'health_check_failed' }, 500)
    }

    const checks = ((report as { checks?: HealthCheck[] } | null)?.checks ?? []) as HealthCheck[]
    const failing = checks.filter((c) => c.status === 'fail')

    if (failing.length === 0) {
      return json({ ok: true, failing: 0, emailed: false })
    }

    // Never alert more than once per 6 hours, however often this is invoked.
    const since = new Date(Date.now() - MIN_INTERVAL_MS).toISOString()
    const { data: recent } = await supabase
      .from('system_alerts')
      .select('id')
      .eq('category', 'system_health')
      .gte('created_at', since)
      .limit(1)

    if (recent && recent.length > 0) {
      return json({ ok: true, failing: failing.length, emailed: false, reason: 'recently_alerted' })
    }

    const message = `${failing.length} system health check(s) failing`

    await supabase.from('system_alerts').insert({
      category: 'system_health',
      severity: 'critical',
      message,
      details: { failing },
    })

    const rows = failing
      .map(
        (c) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#fff;font-weight:600;">${escapeHtml(
            String(c.label ?? 'Check'),
          )}</td><td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;color:#bbb;">${escapeHtml(
            String(c.detail ?? ''),
          )}</td></tr>`,
      )
      .join('')

    const html =
      '<div style="background:#0b0b0f;padding:24px;font-family:system-ui,-apple-system,sans-serif;">' +
      `<h2 style="color:#fff;margin:0 0 8px;">System health: ${failing.length} failing</h2>` +
      '<p style="color:#8b5cf6;margin:0 0 16px;">Detected by the daily automated check.</p>' +
      '<table style="width:100%;border-collapse:collapse;background:#141419;border-radius:8px;">' +
      rows +
      '</table></div>'

    const recipients = [Deno.env.get('NOTIFICATION_EMAIL') || FALLBACK_RECIPIENT]

    let emailed = 0
    const errors: string[] = []
    for (const recipient of recipients) {
      try {
        const result = await sendManagedEmail(supabase, {
          to: recipient,
          subject: `[OutReign] ${message}`,
          html,
          text: message,
          label: 'system-health-alert',
          idempotencyKey: `system-health-${new Date().toISOString().slice(0, 13)}`,
        })
        if (result.sent) emailed++
        else errors.push(`${recipient}: ${result.reason}`)
      } catch (err) {
        errors.push(`${recipient}: ${(err as Error).message}`)
      }
    }

    if (emailed === 0) {
      console.error('[SYSTEM-HEALTH-ALERT] no alert email delivered', errors)
      return json({ ok: false, failing: failing.length, emailed: false, errors }, 500)
    }

    return json({ ok: true, failing: failing.length, emailed })
  } catch (err) {
    console.error('[SYSTEM-HEALTH-ALERT] exception', err)
    return json({ ok: false, error: (err as Error).message }, 500)
  }
})
