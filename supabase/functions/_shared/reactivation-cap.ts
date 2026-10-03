// Shared frequency cap for every "come back / reactivate" email.
// Investor feedback: 5 emails in 10 days gets reported as spam. So across ALL
// reactivation-style templates combined, a recipient gets at most one email per
// REACTIVATION_GAP_DAYS and at most REACTIVATION_LIFETIME_MAX ever.
export const REACTIVATION_TEMPLATES = [
  're-engagement-email',
  'churn-interview',
  'customer-interview',
  'inactive-signup-checkin',
  'inactive-trial-checkin',
  'nudge-run-first-search',
  'nudge-save-first-lead',
  'nudge-connect-mailbox',
  'nudge-send-first-email',
];
export const REACTIVATION_GAP_DAYS = 14;
export const REACTIVATION_LIFETIME_MAX = 3;

export function capDecision(sentDates: Date[], now = new Date()): { allowed: boolean; reason?: string } {
  if (sentDates.length >= REACTIVATION_LIFETIME_MAX) return { allowed: false, reason: 'lifetime_cap_reached' };
  const gapMs = REACTIVATION_GAP_DAYS * 86400000;
  if (sentDates.some((d) => now.getTime() - d.getTime() < gapMs)) return { allowed: false, reason: 'sent_recently' };
  return { allowed: true };
}

// deno-lint-ignore no-explicit-any
export async function reactivationAllowed(supabase: any, email: string): Promise<{ allowed: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from('email_send_log')
    .select('created_at, message_id, status')
    .ilike('recipient_email', email.trim().toLowerCase())
    .in('template_name', REACTIVATION_TEMPLATES)
    .in('status', ['sent', 'pending'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { allowed: false, reason: 'cap_check_failed' }; // fail closed
  // One logical email can have several log rows (pending -> sent); dedupe by message_id.
  const seen = new Set<string>();
  const dates: Date[] = [];
  for (const r of data ?? []) {
    const key = r.message_id ?? r.created_at;
    if (seen.has(key)) continue;
    seen.add(key);
    dates.push(new Date(r.created_at));
  }
  return capDecision(dates);
}
