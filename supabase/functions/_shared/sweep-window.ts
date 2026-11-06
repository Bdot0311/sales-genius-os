/**
 * Which slice of a counted set one pass should read.
 *
 * A cron that always takes the first page never reaches the rest. The page
 * advances with time, and one full cycle of pages covers every row once.
 * `pageSize` is a bound on rows read per pass. It is not a throughput claim.
 */
export function sweepSlice(
  total: number,
  pageSize: number,
  nowMs: number,
  intervalMs: number,
): { from: number; to: number; page: number; pages: number } {
  if (total <= 0 || pageSize <= 0) return { from: 0, to: -1, page: 0, pages: 0 };
  const pages = Math.ceil(total / pageSize);
  const page = Math.floor(nowMs / Math.max(1, intervalMs)) % pages;
  const from = page * pageSize;
  return { from, to: Math.min(total, from + pageSize) - 1, page, pages };
}
