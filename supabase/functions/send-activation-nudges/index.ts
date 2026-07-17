import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface NudgeRule {
  template: string
  dayMin: number
  filter: (r: any) => boolean
}

const RULES: NudgeRule[] = [
  { template: 'nudge-run-first-search', dayMin: 2, filter: (r) => !r.first_search_at && !!r.verified_email_at },
  { template: 'nudge-save-first-lead', dayMin: 4, filter: (r) => !!r.first_search_at && !r.first_lead_saved_at },
  { template: 'nudge-connect-mailbox', dayMin: 6, filter: (r) => !!r.first_lead_saved_at && !r.mailbox_connected_at },
  { template: 'nudge-send-first-email', dayMin: 10, filter: (r) => !!r.mailbox_connected_at && !r.first_email_sent_at },
]

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const now = Date.now()

    // Load activation rows with a signup age >=2 days and <=45 days
    const { data: rows, error } = await admin
      .from('user_activation')
      .select('user_id, signed_up_at, verified_email_at, first_search_at, first_lead_saved_at, mailbox_connected_at, first_email_sent_at, last_nudge_sent, last_nudge_sent_at')
      .lt('signed_up_at', new Date(now - 2 * 86400000).toISOString())
      .gt('signed_up_at', new Date(now - 45 * 86400000).toISOString())

    if (error) throw error

    let sent = 0
    let skipped = 0

    for (const row of rows ?? []) {
      const ageDays = (now - new Date(row.signed_up_at).getTime()) / 86400000
      const rule = RULES.find((r) => ageDays >= r.dayMin && r.filter(row))
      if (!rule) { skipped++; continue }
      if (row.last_nudge_sent === rule.template) { skipped++; continue }

      // Cooldown: at most one nudge every 48h per user
      if (row.last_nudge_sent_at && (now - new Date(row.last_nudge_sent_at).getTime()) < 2 * 86400000) {
        skipped++; continue
      }

      // Lookup profile
      const { data: prof } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', row.user_id)
        .maybeSingle()
      if (!prof?.email) { skipped++; continue }

      // Check we haven't already sent this template historically (email_send_log)
      const { data: prior } = await admin
        .from('email_send_log')
        .select('id')
        .eq('recipient_email', prof.email)
        .eq('template_name', rule.template)
        .limit(1)
      if (prior && prior.length > 0) {
        // mark it so we don't recheck forever
        await admin.from('user_activation').update({ last_nudge_sent: rule.template, last_nudge_sent_at: new Date().toISOString() }).eq('user_id', row.user_id)
        skipped++; continue
      }

      const idempotency = `nudge-${rule.template}-${row.user_id}`
      const { error: invokeErr } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: rule.template,
          recipientEmail: prof.email,
          idempotencyKey: idempotency,
          templateData: { name: (prof.full_name || '').split(' ')[0] || undefined },
        },
      })

      if (invokeErr) {
        console.error('send failed', row.user_id, rule.template, invokeErr)
        continue
      }

      await admin.from('user_activation').update({
        last_nudge_sent: rule.template,
        last_nudge_sent_at: new Date().toISOString(),
      }).eq('user_id', row.user_id)

      sent++
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, considered: rows?.length ?? 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('send-activation-nudges error', e)
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
