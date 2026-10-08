/**
 * What one turn is allowed to spend.
 *
 * The only ceiling on a turn was wall-clock: outOfTime() stops the loop when
 * the invocation is about to be killed. Nothing looked at tokens. A turn that
 * drags a hundred-lead list and six research briefs through eight model steps
 * costs real money and stays inside the time budget the whole way, and a turn
 * that resumes after a restart starts its clock again while its spend carries
 * on from where it was.
 *
 * So the spend is counted, carried across a resume, and the loop stops when it
 * is gone — with the user told plainly, because a turn that quietly stops
 * short having claimed nothing is the failure mode this product already has
 * the most of.
 */

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Everything this turn has spent, including the steps before a resume. */
  cumulative_tokens?: number;
}

/*
 * Generous on purpose.
 *
 * This is a stop on a runaway, not a cost control: a turn that legitimately
 * reads a long lead list and drafts from it should never hit it. The number to
 * tune down is the model and the context, not this.
 */
export const DEFAULT_TURN_TOKEN_BUDGET = 400_000;

/** The ceiling, from the environment when it is set and sane. */
export function turnTokenBudget(raw: string | undefined | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TURN_TOKEN_BUDGET;
  // A budget under a single large context is a turn that cannot do anything.
  return Math.max(50_000, Math.trunc(n));
}

/**
 * Tokens in one model response.
 *
 * Providers disagree about which fields they send: some give a total, some
 * only the two halves. Prefer the total when it is there, add the halves when
 * it is not, and treat an absent or unusable figure as zero rather than
 * guessing — an invented number spent against a budget stops real work.
 */
export function tokensIn(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const u = usage as TokenUsage;
  const total = Number(u.total_tokens);
  if (Number.isFinite(total) && total > 0) return Math.trunc(total);
  const prompt = Number(u.prompt_tokens);
  const completion = Number(u.completion_tokens);
  const sum = (Number.isFinite(prompt) ? prompt : 0) + (Number.isFinite(completion) ? completion : 0);
  return sum > 0 ? Math.trunc(sum) : 0;
}

/** What a resumed turn has already spent, from the step it left behind. */
export function carriedTokens(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  const carried = Number((usage as TokenUsage).cumulative_tokens);
  return Number.isFinite(carried) && carried > 0 ? Math.trunc(carried) : 0;
}

export function budgetExhausted(used: number, budget: number): boolean {
  return used >= budget;
}

/**
 * The sentence the user gets.
 *
 * Written for them, not for the model: the loop has already broken by the
 * time this is used, so there is no further turn to instruct. Deliberately
 * specific about what it does not mean — a turn that stops here has done real
 * work, and reporting it as a failure sends someone hunting a fault that is
 * not there, while reading as completion is the mistake this product keeps
 * making.
 */
export function budgetNote(used: number, budget: number): string {
  return (
    `That request got large enough to hit this run's size limit ` +
    `(${used.toLocaleString()} of ${budget.toLocaleString()} tokens), so I stopped here rather than ` +
    "keep spending. Everything above is saved and nothing was undone. Tell me to keep going and " +
    "I'll pick up from exactly here."
  );
}
