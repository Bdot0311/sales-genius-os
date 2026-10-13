/**
 * Which addresses are synthetic, in a file anything can import.
 *
 * This lived in managed-email.ts, which opens with an `npm:` specifier for the
 * managed transport. That makes the whole module Deno-only: a vitest file that
 * imports it to check the predicate fails to resolve the package, so the one
 * rule standing between the smoke tests and a real inbox had no test on it.
 *
 * Nothing here imports anything. It is a list and a string comparison, and it
 * is the single definition — managed-email.ts re-exports it.
 */

/**
 * Reserved and synthetic domains.
 *
 * Automated smoke tests create throwaway signups. Delivering to these produces
 * real hard bounces that pollute sender reputation and the health report, and
 * reporting them produces admin mail about users who do not exist.
 */
export const TEST_DOMAINS = ['outreign-tests.com', 'example.com', 'example.org', 'example.net']
export const TEST_TLDS = ['.test', '.invalid', '.localhost', '.local']

export function isReservedTestRecipient(email: string): boolean {
  const domain = (email ?? '').toLowerCase().split('@')[1] ?? ''
  if (!domain) return false
  return TEST_DOMAINS.includes(domain) || TEST_TLDS.some((tld) => domain.endsWith(tld))
}
