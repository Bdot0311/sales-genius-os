import type { MailchimpClient } from './newsletter.ts';

export interface SignupImport {
  user_id: string;
  email: string;
  updated_at: string;
  attempts: number;
}

export async function importSignup(email: string, audienceId: string, mailchimp: MailchimpClient, hash: (email: string) => Promise<string>) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Invalid signup email');
  const member = await mailchimp<{ status: string }>(`lists/${audienceId}/members/${await hash(normalized)}`, 'PUT', {
    email_address: normalized,
    // Existing unsubscribed/cleaned/pending members retain their choice.
    status_if_new: 'subscribed',
  });
  if (!member.status) throw new Error('Mailchimp member status missing');
  return member.status;
}

export async function processSignupImports(options: {
  claim: () => Promise<SignupImport | undefined>;
  save: (job: SignupImport, status: 'synced' | 'pending' | 'failed', memberStatus: string | null, error: string | null) => Promise<void>;
  mailchimp: MailchimpClient;
  audienceId: string;
  hash: (email: string) => Promise<string>;
}) {
  let synced = 0;
  let failed = 0;
  for (let i = 0; i < 20; i++) {
    const job = await options.claim();
    if (!job) break;
    try {
      const status = await importSignup(job.email, options.audienceId, options.mailchimp, options.hash);
      await options.save(job, 'synced', status, null);
      synced++;
    } catch (error) {
      // Transport/429/5xx retries are safe: the member PUT is idempotent.
      const message = error instanceof Error ? error.message : String(error);
      const transient = /\[(429|5\d\d)\]|fetch|network|timeout/i.test(message);
      await options.save(job, transient && job.attempts < 3 ? 'pending' : 'failed', null, message.split(job.email).join('[email]').slice(0, 2000));
      failed++;
      if (transient) break; // Respect provider pressure; existing hourly recovery handles retry.
    }
  }
  return { synced, failed };
}