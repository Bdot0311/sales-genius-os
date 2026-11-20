import { describe, it, expect } from 'vitest';
import { appSumoStatus, validAppSumoSignature } from '../../supabase/functions/_shared/appsumo-licensing';

// Public fixture, never a configured credential.
const fixtureKey = 'appsumo-test-fixture-only';
async function sign(body: string, timestamp: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(fixtureKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + body));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
describe('AppSumo webhook security', () => {
  const now = 1795219200000;
  const body = '{"event":"activate","tier":1}';
  it('verifies the timestamp followed by the unmodified raw body', async () => {
    const timestamp = String(now);
    expect(await validAppSumoSignature(body, timestamp, await sign(body, timestamp), fixtureKey, now)).toBe(true);
    expect(await validAppSumoSignature(body + ' ', timestamp, await sign(body, timestamp), fixtureKey, now)).toBe(false);
  });
  it('refuses bad and missing signatures', async () => {
    expect(await validAppSumoSignature(body, String(now), '0'.repeat(64), fixtureKey, now)).toBe(false);
    expect(await validAppSumoSignature(body, String(now), null, fixtureKey, now)).toBe(false);
  });
  it('refuses requests dated ten minutes ago', async () => {
    const timestamp = String(now - 600_000);
    expect(await validAppSumoSignature(body, timestamp, await sign(body, timestamp), fixtureKey, now)).toBe(false);
  });
  it('refuses future timestamps outside five minutes', async () => {
    const timestamp = String(now + 300_001);
    expect(await validAppSumoSignature(body, timestamp, await sign(body, timestamp), fixtureKey, now)).toBe(false);
  });
});
describe('AppSumo lifecycle', () => {
  it('does not enable a purchased but unactivated license', () => expect(appSumoStatus('purchase', 'active')).toBe('inactive'));
  it('activates upgraded and downgraded keys even when AppSumo reports inactive', () => {
    expect(appSumoStatus('upgrade', 'inactive')).toBe('active');
    expect(appSumoStatus('downgrade', 'inactive')).toBe('active');
  });
  it('deactivation revokes access', () => expect(appSumoStatus('deactivate', 'active')).toBe('inactive'));
});