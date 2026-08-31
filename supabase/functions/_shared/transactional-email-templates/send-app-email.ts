// Feature-facing wrapper around the scaffolded send helper.
//
// Adds the app's own behavior on top of Lovable's managed delivery:
// reserved-test-domain skipping and the append-only email_send_log rows the
// admin/health surfaces read. Import from edge functions only.
import { EmailAPIError } from 'npm:@lovable.dev/email-js@0.1.0'
import {
  isReservedTestRecipient,
  logEmailEvent,
  isRateLimited,
  retryAfterSeconds,
} from '../managed-email.ts'
import { sendTemplateEmail } from './send-email.ts'
import { TEMPLATES } from './registry.ts'

export type SendAppEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' | 'test_domain_skipped' | 'failed'; error?: string }

export interface SendAppEmailOptions {
  templateData?: Record<string, unknown>
  idempotencyKey?: string
  replyTo?: string
  /** When false (default) failures are reported in the result instead of thrown. */
  throwOnError?: boolean
}

/**
 * Sends a registered app-email template to one recipient and records the
 * outcome in email_send_log.
 */
// deno-lint-ignore no-explicit-any
export async function sendAppEmail(
  supabase: any,
  templateName: string,
  recipientEmail: string,
  options: SendAppEmailOptions = {},
): Promise<SendAppEmailResult> {
  const template = TEMPLATES[templateName]
  // Template-level `to` wins — notification templates always go to their fixed address.
  const recipient = (template?.to || recipientEmail || '').trim()

  if (!recipient) {
    return { sent: false, reason: 'failed', error: 'Recipient is required' }
  }

  if (isReservedTestRecipient(recipient)) {
    // No log row: 'skipped' is not an accepted email_send_log status.
    console.log('App email skipped (reserved test domain)', { templateName })
    return { sent: false, reason: 'test_domain_skipped' }
  }

  const send = () =>
    sendTemplateEmail(templateName, recipient, {
      templateData: options.templateData as Record<string, any> | undefined,
      idempotencyKey: options.idempotencyKey,
      replyTo: options.replyTo,
    })

  const messageId = crypto.randomUUID()

  try {
    let result: Awaited<ReturnType<typeof sendTemplateEmail>>
    try {
      result = await send()
    } catch (error) {
      if (isRateLimited(error)) {
        await new Promise((r) => setTimeout(r, retryAfterSeconds(error) * 1000))
        result = await send()
      } else {
        throw error
      }
    }

    if (!result.sent) {
      await logEmailEvent(supabase, {
        message_id: messageId,
        template_name: templateName,
        recipient_email: recipient,
        status: 'suppressed',
      })
      return { sent: false, reason: 'recipient_suppressed' }
    }

    await logEmailEvent(supabase, {
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'sent',
    })
    return { sent: true }
  } catch (error) {
    const message =
      error instanceof EmailAPIError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : String(error)

    await logEmailEvent(supabase, {
      message_id: messageId,
      template_name: templateName,
      recipient_email: recipient,
      status: 'failed',
      error_message: message.slice(0, 1000),
    })

    console.error('App email send failed', { templateName, error: message })
    if (options.throwOnError) throw error
    return { sent: false, reason: 'failed', error: message }
  }
}
