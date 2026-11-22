import { describe, expect, it } from 'vitest';
import { importSignup, processSignupImports, type SignupImport } from '../../supabase/functions/send-blog-newsletter/signup-import';
import type { MailchimpClient } from '../../supabase/functions/send-blog-newsletter/newsletter';

describe('consented signup Mailchimp import', () => {
  it('normalizes email and subscribes only a new audience member', async () => {
    const calls: unknown[][] = [];
    const client: MailchimpClient = async <T>(...args: [string, string?, unknown?]) => { calls.push(args); return { status: 'subscribed' } as T; };
    expect(await importSignup(' New@Example.org ', 'audience', client, async email => { expect(email).toBe('new@example.org'); return 'hash'; })).toBe('subscribed');
    expect(calls).toEqual([['lists/audience/members/hash', 'PUT', { email_address: 'new@example.org', status_if_new: 'subscribed' }]]);
  });
  it.each(['unsubscribed', 'cleaned', 'pending'])('does not overwrite existing %s status', async status => {
    const client: MailchimpClient = async <T>(_path: string, _method?: string, body?: unknown) => {
      expect(body).not.toHaveProperty('status');
      return { status } as T;
    };
    expect(await importSignup('new@example.org', 'audience', client, async () => 'hash')).toBe(status);
  });
  it('does not import anyone when there are no eligible opt-ins', async () => {
    const client: MailchimpClient = async () => { throw new Error('Unexpected provider call'); };
    expect(await processSignupImports({ claim: async () => undefined, save: async () => { throw new Error('Unexpected save'); }, mailchimp: client, audienceId: 'audience', hash: async () => 'hash' })).toEqual({ synced: 0, failed: 0 });
  });
  it('stops and defers idempotent imports when Mailchimp rate limits', async () => {
    const job: SignupImport = { user_id: 'user', email: 'new@example.org', updated_at: 'now', attempts: 1 };
    let claims = 0;
    const results: unknown[][] = [];
    const client: MailchimpClient = async () => { throw new Error('Mailchimp [429]: rate limited'); };
    expect(await processSignupImports({ claim: async () => { claims++; return job; }, save: async (...args) => { results.push(args); }, mailchimp: client, audienceId: 'audience', hash: async () => 'hash' })).toEqual({ synced: 0, failed: 1 });
    expect(claims).toBe(1);
    expect(results[0]?.[1]).toBe('pending');
  });
});