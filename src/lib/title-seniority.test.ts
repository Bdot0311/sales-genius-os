import { describe, expect, it } from "vitest";
import { titleStatesSeniority } from "../../supabase/functions/_shared/icp-vocab.ts";

/**
 * The ICP fan-out runs one search per title. A seniority that one of those
 * titles already states was read off that title rather than stated separately,
 * so putting it on the others asks for something nobody requested — a VP of
 * Sales who is also an owner.
 */
describe("titleStatesSeniority", () => {
  it("recognises the titles from the production ICP", () => {
    // "Founders, Heads of Sales, or VPs of Sales" -> seniority "owner", from
    // the first title. All three state their own level.
    for (const title of ["Founder", "Head of Sales", "VP of Sales"]) {
      expect(titleStatesSeniority(title), title).toBe(true);
    }
  });

  it("recognises level words wherever they sit in the title", () => {
    for (const title of [
      "Co-Founder",
      "Chief Revenue Officer",
      "CTO",
      "Owner",
      "Senior Director of Engineering",
      "Regional Sales Manager",
      "Vice President, Marketing",
      "Principal Engineer",
    ]) {
      expect(titleStatesSeniority(title), title).toBe(true);
    }
  });

  it("says no to titles that carry no level", () => {
    // A seniority sent beside one of these is the only thing narrowing the
    // search, so the fan-out must keep it.
    for (const title of [
      "Account Executive",
      "Software Engineer",
      "Recruiter",
      "Designer",
      "Sales",
    ]) {
      expect(titleStatesSeniority(title), title).toBe(false);
    }
  });

  it("does not match a level word buried inside another word", () => {
    // "Leadership" contains "lead"; "Interns" is fine but "International" is
    // not an intern, and "Ownership" is not an owner.
    expect(titleStatesSeniority("Leadership Coach")).toBe(false);
    expect(titleStatesSeniority("International Sales")).toBe(false);
    expect(titleStatesSeniority("Ownership Programs")).toBe(false);
  });

  it("says no to nothing at all", () => {
    expect(titleStatesSeniority("")).toBe(false);
    expect(titleStatesSeniority("   ")).toBe(false);
    expect(titleStatesSeniority(undefined as unknown as string)).toBe(false);
  });
});
