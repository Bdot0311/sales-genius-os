// How many resolve jobs one invocation will take, and when it stops taking more.
//
// The cron fires every two minutes and the claim used to ask for 2 rows, so
// the whole product resolved about one address a minute. Ingest allows 2,000
// events a minute per site. A job whose raw address sits past ip_raw_until
// (24h) is cleared by visitor_apply_retention and can never match.
//
// The claim SQL already refuses a limit above 20. This run asks for that
// many, works a few at a time, and stops starting new ones well inside the
// ~150s edge wall clock (docs/AGENT_BATCH_QUEUE.md). Jobs still in the list
// when the budget is spent are returned so the caller can put them back to
// queued. A job left `running` would wait for the 10-minute reclaim and
// would spend one of its three attempts without having been started.

/** Matches the cap in claim_visitor_resolve_jobs: LEAST(..., 20). */
export const RESOLVE_CLAIM_LIMIT = 20;

/** DNS and RDAP for one job are already parallel. Four jobs at once is enough. */
export const RESOLVE_CONCURRENCY = 4;

/**
 * Stop starting jobs after this long. The platform kills the invocation
 * around 150s; 50s leaves the in-flight lookups room to finish and write
 * their row before that, and the next cron is two minutes out.
 */
export const RESOLVE_WALL_BUDGET_MS = 50_000;

export function releaseQueuedClaim(attempts: number | null | undefined): {
  status: "queued";
  attempts: number;
  claimed_at: null;
} {
  const current = typeof attempts === "number" && Number.isFinite(attempts) ? attempts : 1;
  return { status: "queued", attempts: Math.max(0, current - 1), claimed_at: null };
}

/**
 * Run `jobs` with at most `concurrency` in flight. Once `now() - startedAt`
 * reaches `budgetMs`, no further job is started. Those leftover jobs are
 * `deferred` and were not passed to `run`.
 */
export async function runResolveBatch<T>(
  jobs: readonly T[],
  options: {
    concurrency: number;
    budgetMs: number;
    startedAt: number;
    now: () => number;
    run: (job: T) => Promise<void>;
  },
): Promise<{ started: T[]; deferred: T[] }> {
  const pending = [...jobs];
  const started: T[] = [];
  let stopped = false;

  const take = (): T | undefined => {
    if (stopped || options.now() - options.startedAt >= options.budgetMs) {
      stopped = true;
      return undefined;
    }
    const next = pending.shift();
    if (!next) return undefined;
    started.push(next);
    return next;
  };

  const worker = async () => {
    for (;;) {
      const job = take();
      if (!job) return;
      await options.run(job);
    }
  };

  const workers = jobs.length === 0 ? 0 : Math.min(Math.max(1, options.concurrency), jobs.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { started, deferred: pending };
}
