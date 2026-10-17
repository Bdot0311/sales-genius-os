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

// Never send to reserved / synthetic test addresses. The rule moved to
// test-recipients.ts, which imports nothing: this module's `npm:` specifier for
// the managed transport made it Deno-only, so a vitest file could not import
// the predicate to check it. Re-exported here so every existing caller is
// unchanged.
import { isReservedTestRecipient } from './test-recipients.ts'
export { isReservedTestRecipient, TEST_DOMAINS, TEST_TLDS } from './test-recipients.ts'

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
  /** The caller's idempotency key, when they gave one. Unique where not null. */
  dedupe_key?: string | null
}


// deno-lint-ignore no-explicit-any
export async function logEmailEvent(supabase: any, row: EmailLogRow): Promise<void> {
  const { error } = await supabase.from('email_send_log').insert(row)
  if (error) {
    /*
     * A unique violation on dedupe_key is not a failure: another run recorded
     * the same keyed send first. Logging it as an error would make the normal
     * outcome of the race look like a fault.
     */
    if (error.code === '23505') return
    console.error('Failed to write email_send_log row', {
      code: error.code,
      message: error.message,
      status: row.status,
      template_name: row.template_name,
    })
  }
}

/**
 * Has a send under this key already landed?
 *
 * At-most-once, checked where it can be verified. The primary check is
 * `email_send_log` rather than the email provider's own dedupe window, which
 * this codebase cannot see or test. The provider key still goes out and covers
 * the one case this read cannot: two sends racing closely enough that neither
 * has recorded a row yet. The unique index on `dedupe_key` then lets only one
 * of them record it.
 *
 * Returns false when the check itself fails. The alternative is dropping a
 * welcome or confirmation email because one SELECT failed, and a duplicate is
 * the lesser of those two.
 *
 * Shared by both transports — the plain sender and the template wrapper — so
 * an idempotency key means the same thing whichever one a feature uses.
 */
// deno-lint-ignore no-explicit-any
export async function alreadySentUnderKey(
  supabase: any,
  key: string | undefined,
  label: string,
): Promise<boolean> {
  if (!key) return false
  const { data: prior, error: priorErr } = await supabase
    .from('email_send_log')
    .select('id')
    .eq('dedupe_key', key)
    .in('status', ['sent', 'suppressed'])
    .limit(1)
    .maybeSingle()
  if (priorErr) {
    console.error('Dedupe check failed; sending and relying on the provider key', {
      label,
      code: priorErr.code,
      message: priorErr.message,
    })
    return false
  }
  if (prior) {
    console.log('Email skipped (already sent under this key)', { label })
    return true
  }
  return false
}

/**
 * An at-most-once key built from its parts, bounded by construction.
 *
 * Every key this replaces was assembled by template and then truncated with
 * `.slice(0, 200)`, which fails in two directions at once. A long part — a
 * 150-character customer email in a billing alert — eats the end of the
 * string, and the end is where the hour bucket lives: the key stops varying
 * by hour, so the *first* alert of its kind is the last one ever sent. And two
 * different identities sharing a 200-character prefix become one key, so the
 * second incident reaches nobody. In an alert channel both of those are
 * silence, which is the one failure a monitoring path must not have.
 *
 * Hashing the whole identity removes the truncation rather than moving it: the
 * result is a short label plus a 128-bit digest, so no input length can push
 * any part of the identity out of the key. The label stays readable because
 * `email_send_log.template_name` is what a human greps, and `created_at` says
 * which hour it was.
 *
 * Parts are joined with NUL, which cannot appear in any of them, so
 * ("a", "bc") and ("ab", "c") are different identities rather than one.
 */
export async function dedupeKey(
  label: string,
  ...parts: (string | number | null | undefined)[]
): Promise<string> {
  const material = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("\u0000")
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)),
  )
  let hex = ""
  for (const b of bytes.subarray(0, 16)) hex += b.toString(16).padStart(2, "0")
  return `${label.slice(0, 40)}-${hex}`
}

/** The hour an alert belongs to, as the bucket every alert key shares. */
export function alertHour(): string {
  return new Date().toISOString().slice(0, 13)
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
  /**
   * At-most-once key. A send carrying one is skipped if `email_send_log`
   * already holds a delivered or suppressed row with the same key, and the key
   * is recorded on the row this send writes.
   *
   * It must not contain a clock. Nine call sites once passed
   * `...-${Date.now()}`, which is a different key on every attempt and so
   * could never match a previous one — the appearance of at-most-once with
   * none of it. Omit the key entirely when a repeat *should* send, such as a
   * password reset the person asked to be resent; the transport then falls
   * back to a fresh id of its own.
   */
  idempotencyKey?: string
  from?: string
  replyTo?: string
}

export type SendManagedEmailResult =
  | { sent: true; messageId: string }
  | { sent: false; messageId: string; reason: 'recipient_suppressed' | 'test_domain_skipped' | 'already_sent' }

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

  if (await alreadySentUnderKey(supabase, input.idempotencyKey, input.label)) {
    return { sent: false, messageId, reason: 'already_sent' }
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
        dedupe_key: input.idempotencyKey ?? null,
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
    pixel_id: pixelId,
    reply_to: replyTo,
    dedupe_key: input.idempotencyKey ?? null,
  })


  return { sent: true, messageId }
}
