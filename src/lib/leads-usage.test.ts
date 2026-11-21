import { describe, expect, it } from 'vitest';
import { resolveLeadsUsage } from '../hooks/use-leads-usage';

describe('leads-used allowance follows the current tier', () => {
  it.each([
    ['free', 100], ['starter', 1000], ['growth', 2500], ['pro', 5000], ['agency', 15000],
  ] as const)('%s uses its published allowance, not a stale Free limit', (plan, limit) => {
    const usage = resolveLeadsUsage(176, 'free', plan);
    expect(usage.plan).toBe(plan);
    expect(usage.leadsLimit).toBe(limit);
    expect(usage.leadsCount).toBe(176);
    expect(usage.percentageUsed).toBeCloseTo(176 / limit * 100);
  });

  it('Agency displays 176 of 15,000 at 1.17%, not 176%', () => {
    const usage = resolveLeadsUsage(176, 'agency');
    expect(usage.leadsLimit).toBe(15000);
    expect(usage.percentageUsed).toBeCloseTo(1.1733333333);
    expect(usage.percentageUsed > 80).toBe(false);
  });

  it('recalculates after a plan change without altering the saved count', () => {
    expect(resolveLeadsUsage(176, 'starter', 'agency').leadsLimit).toBe(15000);
    expect(resolveLeadsUsage(176, 'agency', 'starter').leadsLimit).toBe(1000);
  });

  it('retains the legacy Elite to Pro mapping', () => {
    expect(resolveLeadsUsage(176, 'elite').leadsLimit).toBe(5000);
  });
});