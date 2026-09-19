// Managed email transport for hand-composed emails.
//
// Sends synchronously through Lovable's managed email API. Delivery, retries,
// suppression, rate limits and unsubscribe are handled by Lovable — this module
// only adds the app's own behavior: reserved-test-domain skipping and the
// append-only email_send_log audit rows the app reads elsewhere.
import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'

export const SITE_NAME = 'OutReign'
export const SENDER_DOMAIN = 'notify.outreign.io'
export const FROM_DOMAIN = 'notify.outreign.io'
export const DEFAULT_FROM = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`

// Never send to reserved / synthetic test addresses. Automated smoke tests
// create throwaway signups, and delivering to those domains produces real hard
// bounces that pollute sender reputation and the health report.
const TEST_DOMAINS = ['outreign-tests.com', 'example.com', 'example.org', 'example.net']
const TEST_TLDS = ['.test', '.invalid', '.localhost', '.local']

export function isReservedTestRecipient(email: string): boolean {
  const domain = (email ?? '').toLowerCase().split('@')[1] ?? ''
  if (!domain) return false
  return TEST_DOMAINS.includes(domain) || TEST_TLDS.some((tld) => domain.endsWith(tld))
}

/**
 * Where replies to platform-sent email land.
 *
 * Lovable's managed sender has no mailbox of its own, so a reply to
 * noreply@notify.outreign.io would vanish. Every app email therefore carries a
 * Reply-To pointing at a real inbox, and the address used is recorded on the
 * send row so the admin email panel can say where to look for answers.
 */
export const DEFAULT_REPLY_TO = 'brandon@bdotindustries.com'

/**
 * Open tracking for platform email.
 *
 * Managed delivery records sends, bounces, complaints and unsubscribes but
 * never opens, so each send embeds its own pixel pointing at
 * track-app-email-open with the row's pixel_id.
 */
export function trackingPixelUrl(pixelId: string): string | null {
  const base = Deno.env.get('SUPABASE_URL')
  if (!base) return null
  return `${base}/functions/v1/track-app-email-open?id=${pixelId}`
}

export function appendTrackingPixel(html: string, url: string | null): string {
  if (!url) return html
  const img = `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`
  return html.includes('</body>') ? html.replace('</body>', `${img}</body>`) : html + img
}

export interface EmailLogRow {
  message_id?: string | null
  template_name: string
  recipient_email: string | null
  status: string
  error_message?: string | null
  pixel_id?: string | null
  reply_to?: string | null
}


// deno-lint-ignore no-explicit-any
export async function logEmailEvent(supabase: any, row: EmailLogRow): Promise<void> {
  const { error } = await supabase.from('email_send_log').insert(row)
  if (error) {
    console.error('Failed to write email_send_log row', {
      code: error.code,
      message: error.message,
      status: row.status,
      template_name: row.template_name,
    })
  }
}

export function isRateLimited(error: unknown): boolean {
  if (error instanceof EmailAPIError) return error.status === 429
  return false
}

export function retryAfterSeconds(error: unknown): number {
  if (error instanceof EmailAPIError) return error.retryAfterSeconds ?? 60
  return 60
}

export interface SendManagedEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  /** Used as template_name in email_send_log and as the send label. */
  label: string
  idempotencyKey?: string
  from?: string
  replyTo?: string
}

export type SendManagedEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; messageId: string; reason: 'recipient_suppressed' | 'test_domain_skipped' }

/**
 * Renders nothing — sends already-composed HTML through Lovable's managed email
 * API and records the outcome in email_send_log. Throws on any failure other
 * than an expected suppression.
 */
// deno-lint-ignore no-explicit-any
export async function sendManagedEmail(
  supabase: any,
  input: SendManagedEmailInput,
): Promise<SendManagedEmailResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')

  const messageId = crypto.randomUUID()
  const to = (input.to ?? '').trim()

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await logEmailEvent(supabase, {
      message_id: messageId,
      template_name: input.label,
      recipient_email: to || null,
      status: 'failed',
      error_message: 'Invalid recipient email address (rejected before send)',
    })
    throw new Error('Invalid recipient email address')
  }

  if (isReservedTestRecipient(to)) {
    // No log row: 'skipped' is not an accepted email_send_log status.
    console.log('Email skipped (reserved test domain)', { label: input.label })
    return { sent: false, messageId, reason: 'test_domain_skipped' }
  }

  const pixelId = crypto.randomUUID()
  const replyTo = input.replyTo ?? DEFAULT_REPLY_TO

  const payload = {
    to,
    from: input.from ?? DEFAULT_FROM,
    sender_domain: SENDER_DOMAIN,
    subject: input.subject,
    html: appendTrackingPixel(input.html, trackingPixelUrl(pixelId)),
    text: input.text ?? input.subject,
    purpose: 'transactional' as const,
    label: input.label,
    idempotency_key: input.idempotencyKey || messageId,
    reply_to: replyTo,
  }


  const options = { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') }

  try {
    try {
      await sendLovableEmail(payload, options)
    } catch (error) {
      // A 429 means the workspace is sending faster than its allowance —
      // wait the advertised window once, then try again.
      if (isRateLimited(error)) {
        await new Promise((r) => setTimeout(r, retryAfterSeconds(error) * 1000))
        await sendLovableEmail(payload, options)
      } else {
        throw error
      }
    }
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await logEmailEvent(supabase, {
        message_id: messageId,
        template_name: input.label,
        recipient_email: to,
        status: 'suppressed',
      })
      return { sent: false, messageId, reason: 'recipient_suppressed' }
    }

    const message = error instanceof Error ? error.message : String(error)
    await logEmailEvent(supabase, {
      message_id: messageId,
      template_name: input.label,
      recipient_email: to,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })
    throw error
  }

  await logEmailEvent(supabase, {
    message_id: messageId,
    template_name: input.label,
    recipient_email: to,
    status: 'sent',
  })

  return { sent: true, messageId }
}
