import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync('supabase/functions/admin-create-user/index.ts', 'utf8');
const mapping = source.match(/const safeErrors: Record<string, string> = (\{[\s\S]*?\n    \});/);
if (!mapping) throw new Error('Missing safe error mapping');
const safeErrors = runInNewContext(`(${mapping[1]})`) as Record<string, string>;

describe('admin account creation errors', () => {
  it('allows the known weak-password rejection through the safe error mapping', () => {
    expect(Object.prototype.hasOwnProperty.call(safeErrors, 'Password is known to be weak and easy to guess, please choose a different one.')).toBe(true);
  });

  it('does not expose arbitrary internal errors', () => {
    expect(Object.prototype.hasOwnProperty.call(safeErrors, 'database connection failed: private details')).toBe(false);
  });
});