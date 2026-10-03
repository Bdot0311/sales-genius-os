/**
 * API + MCP rate limits per plan. Mirrors public.api_tier_limits() in the
 * database, which is what actually enforces them. Free has no API/MCP access.
 */
export const API_TIER_LIMITS = {
  free: null,
  starter: { perMinute: 30, perDay: 2000 },
  growth: { perMinute: 60, perDay: 10000 },
  pro: { perMinute: 120, perDay: 50000 },
  agency: { perMinute: 300, perDay: 200000 },
} as const;

export function apiLimitLabel(plan: keyof typeof API_TIER_LIMITS): string | false {
  const l = API_TIER_LIMITS[plan];
  return l ? `${l.perMinute}/min · ${l.perDay.toLocaleString("en-US")}/day` : false;
}
