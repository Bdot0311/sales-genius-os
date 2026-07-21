import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SALES_EMAIL = 'sales@bdotindustries.com'

interface Payload {
  name?: string
  email?: string
  company?: string
  website?: string
  audience?: string
  goal?: string
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

  const name = clean(raw.name, 120)
  const email = clean(raw.email, 200).toLowerCase()
  const company = clean(raw.company, 200)
  const website = clean(raw.website, 300)
  const audience = clean(raw.audience, 1000)
  const goal = clean(raw.goal, 1000)

  if (!name || name.length < 2) return jsonResponse(400, { error: 'Please enter your name.' })
  if (!email || !isEmail(email)) return jsonResponse(400, { error: 'Please enter a valid email address.' })
  if (!audience) return jsonResponse(400, { error: 'Tell us who your ideal customer is.' })
  if (!goal) return jsonResponse(400, { error: 'Tell us your goal for outbound.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('submit-campaign-setup: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    return jsonResponse(500, { error: 'Server configuration error' })
  }

  // Rate limit: 3 submissions per hour per email + per IP
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  const admin = createClient(supabaseUrl, serviceKey)
  try {
    const [{ data: emailOk }, { data: ipOk }] = await Promise.all([
      admin.rpc('consume_rate_limit', { _key: `campaign-setup:email:${email}`, _max: 3, _window_seconds: 3600 }),
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
