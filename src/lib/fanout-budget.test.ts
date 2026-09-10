import { describe, expect, it } from "vitest";
import { normalizeIndustry } from "../../supabase/functions/_shared/icp-vocab.ts";

/**
 * The ICP fan-out runs one backend search per title. The backend marks
 * everyone it hands back as shown, so a lead the fan-out asks for and then
 * discards is a lead the user can never be offered again.
 *
 * This mirrors the variant-building and page-budget arithmetic so the two
 * ways it used to overspend stay fixed: duplicate variants, and asking each
 * variant for double what the page can hold.
 */
const buildVariants = (titles: string[], industries: string[]) => {
  const variants: Array<Record<string, string | undefined>> = [];
  const seen = new Set<string>();
  for (const t of titles) {
    for (const ind of industries) {
      const industry = normalizeIndustry(ind || "") || undefined;
      const key = JSON.stringify([t, industry, undefined]);
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({ job_title: t, industry });
    }
  }
  return variants;
};

const perVariant = (limit: number, variants: number) =>
  Math.max(1, Math.ceil(limit / Math.max(variants, 1)));

describe("fan-out variants", () => {
  it("does not run the same search twice", () => {
    // Two ICP industries that normalise to the same value. The duplicate used
    // to burn a second slice of the pool the user was never offered.
    const variants = buildVariants(["Founder", "Co-Founder"], ["saas", "software"]);
    expect(normalizeIndustry("saas")).toBe(normalizeIndustry("software"));
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.job_title)).toEqual(["Founder", "Co-Founder"]);
  });

  it("keeps variants that genuinely differ", () => {
    const variants = buildVariants(["Founder"], ["software", "healthcare"]);
    expect(variants).toHaveLength(2);
    expect(new Set(variants.map((v) => v.industry)).size).toBe(2);
  });

  it("still fans out across titles", () => {
    const variants = buildVariants(["Founder", "Head of Sales", "VP of Sales"], [""]);
    expect(variants).toHaveLength(3);
  });
});

describe("fan-out page budget", () => {
  it("never asks for more than the page can hold", () => {
    // The old rule was ceil(limit / variants) * 2 with a floor of 5, so a page
    // of 6 across 2 variants asked for 12 and displayed 6.
    for (const limit of [6, 10, 25, 50]) {
      for (const variants of [1, 2, 3, 4, 8]) {
        const ask = perVariant(limit, variants) * variants;
        expect(ask, `limit=${limit} variants=${variants}`).toBeLessThanOrEqual(
          limit + variants,
        );
      }
    }
  });

  it("the production case asks for six, not twelve", () => {
    expect(perVariant(6, 2) * 2).toBe(6);
    const old = Math.max(5, Math.ceil(6 / 2) * 2) * 2;
    expect(old).toBe(12);
  });

  it("always asks each variant for at least one", () => {
    // A page smaller than the variant count must not ask for zero.
    expect(perVariant(2, 8)).toBe(1);
    expect(perVariant(1, 4)).toBe(1);
  });
});
