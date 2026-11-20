/** AppSumo signs the exact raw body, prefixed by its millisecond timestamp. */
export async function validAppSumoSignature(body: string, timestamp: string | null, signature: string | null, key: string, now = Date.now()): Promise<boolean> {
  if (!key || !timestamp || !/^\d{10,16}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const time = Number(timestamp);
  const milliseconds = time < 1e12 ? time * 1000 : time;
  if (Math.abs(now - milliseconds) > 300_000) return false;
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], part => parseInt(part, 16));
  return crypto.subtle.verify('HMAC', signingKey, bytes, encoder.encode(timestamp + body));
}

export const APP_SUMO_EVENTS = ['purchase', 'activate', 'upgrade', 'downgrade', 'deactivate', 'migrate'] as const;
export type AppSumoEvent = typeof APP_SUMO_EVENTS[number];
export function appSumoStatus(event: AppSumoEvent, reported?: string): string {
  if (event === 'deactivate') return 'inactive';
  if (event === 'purchase') return 'inactive';
  if (event === 'migrate') return reported === 'deactivated' || reported === 'inactive' ? 'inactive' : 'active';
  return 'active';
}
export async function claimDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}