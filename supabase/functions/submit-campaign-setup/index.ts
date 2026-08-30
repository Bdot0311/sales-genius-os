import { createClient } from 'npm:@supabase/supabase-js@2'
import { botRejectionMessage, botSignals } from '../_shared/bot-signals.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SALES_EMAIL = 'sales@bdotindustries.com'

interface Payload {
  name?: string
  company?: string
  website?: string
  audience?: string
  goal?: string
  /** Which CTA opened the form, for attribution in admin. */
  source?: string
  /** The click this form was opened from, so the two rows join up. */
  requestId?: string
  /** Anti-automation, checked server-side. See _shared/bot-signals.ts. */
  company_fax?: string
  elapsedMs?: number
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  let raw: Payload
  try {
    raw = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('submit-campaign-setup: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return jsonResponse(500, { error: 'Server configuration error' })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  // A campaign setup is work a human on the team does for a real customer, so
  // the request has to come from a real account. Anonymous posts used to reach
  // the sales inbox with whatever address the body claimed — an open relay to
  // ourselves, and the reason alerts arrived reading "Unknown visitor".
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Please sign in to request a campaign setup.' })
  }
  const { data: authData } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  const user = authData?.user
  if (!user) {
    return jsonResponse(401, { error: 'Your session expired. Please sign in again.' })
  }

  // The address comes from the verified account, never from the request body.
  // A body-supplied address is a claim; this one was confirmed at signup.
  const email = clean(user.email, 200).toLowerCase()
  if (!email || !isEmail(email)) {
    return jsonResponse(400, { error: 'Your account has no usable email address.' })
  }

  const { data: profile } = await admin
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  const name = clean(raw.name, 120) || clean(profile?.full_name, 120)
  const company = clean(raw.company, 200)
  const website = clean(raw.website, 300)
  const audience = clean(raw.audience, 1000)
  const goal = clean(raw.goal, 1000)
  const source = clean(raw.source, 80) || 'campaign_setup_form'
  const requestId = clean(raw.requestId, 64)

  if (!name || name.length < 2) return jsonResponse(400, { error: 'Please enter your name.' })
  if (!audience) return jsonResponse(400, { error: 'Tell us who your ideal customer is.' })
  if (!goal) return jsonResponse(400, { error: 'Tell us your goal for outbound.' })

  // Automation checks, decided here rather than in the browser — a bot posting
  // straight to this endpoint never runs the client's validation.
  const signals = botSignals({
    honeypot: raw.company_fax,
    elapsedMs: raw.elapsedMs,
    answers: [audience, goal],
  })
  if (signals.length > 0) {
    console.warn(`submit-campaign-setup: rejected ${user.id} — ${signals.join(', ')}`)
    return jsonResponse(400, { error: botRejectionMessage(signals) })
  }

  // Rate limit: 3 submissions per hour per account + per IP
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  try {
    const [{ data: emailOk }, { data: ipOk }] = await Promise.all([
      admin.rpc('consume_rate_limit', { _key: `campaign-setup:user:${user.id}`, _max: 3, _window_seconds: 3600 }),
      admin.rpc('consume_rate_limit', { _key: `campaign-setup:ip:${ip}`, _max: 10, _window_seconds: 3600 }),
    ])
    if (emailOk === false || ipOk === false) {
      return jsonResponse(429, { error: "You've submitted this a few times already — check your inbox, we'll be in touch shortly." })
    }
  } catch (e) {
    console.warn('submit-campaign-setup: rate limit check failed, continuing', e)
  }

  const submittedAt = new Date().toUTCString()
  const idBase = `${email}-${Date.now()}`

  const invoke = async (templateName: string, recipientEmail: string, templateData: Record<string, unknown>, keySuffix: string) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        templateName,
        recipientEmail,
        idempotencyKey: `campaign-setup-${keySuffix}-${idBase}`,
        templateData,
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error(`submit-campaign-setup: ${templateName} failed [${res.status}]: ${text}`)
      throw new Error(`${templateName} send failed`)
    }
    return text
  }

  // Record the real request alongside the click that opened the form, so admin
  // shows the answers and not only that somebody pressed a button.
  try {
    if (requestId) {
      await admin.from('campaign_setup_requests').update({
        user_id: user.id,
        contact_email: email,
        contact_name: name,
        status: 'submitted',
        metadata: { company, website, audience, goal, source },
      }).eq('id', requestId)
    } else {
      await admin.from('campaign_setup_requests').insert({
        user_id: user.id,
        contact_email: email,
        contact_name: name,
        source,
        direction: 'inbound',
        status: 'submitted',
        metadata: { company, website, audience, goal },
      })
    }
  } catch (e) {
    console.warn('submit-campaign-setup: could not record request', e)
  }

  try {
    await Promise.all([
      invoke('campaign-setup-request', SALES_EMAIL, {
        name, email, company, website, audience, goal, submittedAt,
      }, 'sales'),
      invoke('campaign-setup-confirmation', email, { name }, 'user'),
    ])
  } catch (err) {
    console.error('submit-campaign-setup: send error', err)
    return jsonResponse(502, { error: "We couldn't send your request just now. Please email sales@bdotindustries.com directly." })
  }

  return jsonResponse(200, { success: true })
})
