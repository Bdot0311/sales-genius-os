import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, isInternalCaller } from '../_shared/internal-auth.ts'
import { sendAppEmail } from '../_shared/transactional-email-templates/send-app-email.ts'

const TARGETS = [
  { id: 'e9b6a292-cee5-49b4-840c-69695c6a0302', template: 'inactive-trial-checkin' },
  { id: '0a5b5ced-299f-4b8c-a756-8a94cf72b62b', template: 'inactive-signup-checkin' },
  { id: '3a0544fc-4b99-4099-8d3d-b0a3a5c14e79', template: 'inactive-signup-checkin' },
] as const

const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!url || !serviceKey) return json(500, { error: 'Server configuration error' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  if (!isInternalCaller(req)) {
    const { data: userData } = await admin.auth.getUser(token)
    const actor = userData?.user
    if (!actor) return json(401, { error: 'Unauthorized' })

    const { data: role } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', actor.id)
      .eq('role', 'admin')
      .maybeSingle()
    if (!role) return json(403, { error: 'Admin privileges required' })
  }

  const results: Array<Record<string, unknown>> = []
  for (const target of TARGETS) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, last_sign_in_at')
      .eq('id', target.id)
      .maybeSingle()

    if (!profile?.email) {
      results.push({ userId: target.id, status: 'skipped', reason: 'missing_profile_or_email' })
      continue
    }
    if (profile.last_sign_in_at) {
      results.push({ userId: target.id, status: 'skipped', reason: 'already_signed_in' })
      continue
    }

    const { data: prior } = await admin
      .from('email_send_log')
      .select('id')
      .eq('recipient_email', profile.email)
      .eq('template_name', target.template)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle()
    if (prior) {
      results.push({ userId: target.id, status: 'skipped', reason: 'already_sent' })
      continue
    }

    const firstName = profile.full_name?.trim().split(/\s+/)[0] || undefined
    const templateData: Record<string, unknown> = { name: firstName }

    if (target.template === 'inactive-trial-checkin') {
      const { data: subscription } = await admin
        .from('subscriptions')
        .select('account_status, trial_end_date')
        .eq('user_id', target.id)
        .maybeSingle()
      if (subscription?.account_status !== 'trial' || !subscription.trial_end_date) {
        results.push({ userId: target.id, status: 'skipped', reason: 'trial_not_active' })
        continue
      }
      const remainingMs = new Date(subscription.trial_end_date).getTime() - Date.now()
      const daysRemaining = Math.max(0, Math.ceil(remainingMs / 86_400_000))
      templateData.daysRemaining = daysRemaining
    }

    const result = await sendAppEmail(admin, target.template, profile.email, {
      idempotencyKey: `${target.template}-${target.id}`,
      templateData,
      replyTo: 'support@bdotindustries.com',
    })
    results.push({ userId: target.id, status: result.sent ? 'sent' : 'skipped', reason: result.sent ? undefined : result.reason })
  }

  return json(200, { success: true, results })
})