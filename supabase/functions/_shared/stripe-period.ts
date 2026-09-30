import Stripe from "https://esm.sh/stripe@18.5.0";

/**
 * Stripe moved current_period_start/current_period_end off the Subscription
 * object onto subscription.items.data[n] in API version 2025-08-27.basil.
 * Event payloads from before that version still carry them at the top level,
 * so read item-level first and fall back to the object-level fields.
 */
export function getSubscriptionPeriod(sub: Stripe.Subscription): { startSec: number; endSec: number } {
  const item = sub.items?.data?.[0] as (typeof sub.items.data[number] & {
    current_period_start?: number;
    current_period_end?: number;
  }) | undefined;
  const subAny = sub as unknown as { current_period_start?: number; current_period_end?: number };

  const nowSec = Math.floor(Date.now() / 1000);
  const start = item?.current_period_start ?? subAny.current_period_start;
  const end = item?.current_period_end ?? subAny.current_period_end;

  return {
    startSec: typeof start === 'number' && Number.isFinite(start) && start > 0 ? start : nowSec,
    endSec: typeof end === 'number' && Number.isFinite(end) && end > 0 ? end : nowSec + 30 * 86400,
  };
}

/** Convert unix seconds to ISO, never throwing on missing/invalid input. */
export function toIsoUnix(sec: number | undefined | null, fallbackSecondsFromNow = 30 * 86400): string {
  const ms = typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? sec * 1000 : Date.now() + fallbackSecondsFromNow * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date(Date.now() + fallbackSecondsFromNow * 1000).toISOString() : d.toISOString();
}
