import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

// Terminal delivery events from Lovable's managed email delivery.
// These writes are notification/audit only — Lovable enforces suppression at
// send time, so nothing here gates a future send.
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

const STATUS: Record<Reason, string> = {
  bounce: 'bounced',
  complaint: 'complained',
  unsubscribe: 'suppressed',
}

const MESSAGE: Record<Reason, string> = {
  bounce: 'Permanent bounce — email address is invalid or rejected',
  complaint: 'Spam complaint — recipient marked email as spam',
  unsubscribe: 'Recipient unsubscribed',
}

async function record(reason: Reason, recipient: string, messageId: string | null, eventId: string) {
  const email = (recipient ?? '').toLowerCase()
  if (!email) return

  // Idempotent on email — safe for redeliveries.
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      code: suppressError.code,
      message: suppressError.message,
      event_id: eventId,
    })
    throw new Error('suppressed_emails write failed')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: messageId ?? null,
    template_name: 'system',
    recipient_email: email,
    status: STATUS[reason],
    error_message: MESSAGE[reason],
    metadata: null,
  })

  if (logError) {
    console.error('Failed to insert email_send_log row', {
      code: logError.code,
      message: logError.message,
      event_id: eventId,
    })
    throw new Error('email_send_log write failed')
  }

  console.log('Email event processed', { reason, event_id: eventId })
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record('bounce', event.data.recipient, event.data.message_id ?? null, event.event_id)
    },
    'email.complaint': async (event) => {
      await record('complaint', event.data.recipient, event.data.message_id ?? null, event.event_id)
    },
    'email.unsubscribed': async (event) => {
      await record('unsubscribe', event.data.recipient, event.data.message_id ?? null, event.event_id)
    },
  },
})

Deno.serve((req) => handler(req))
