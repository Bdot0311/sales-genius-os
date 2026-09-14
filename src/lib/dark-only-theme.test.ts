import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The `dark:` variant does nothing in this app, and a lot of code assumed it did.
 *
 * tailwind.config.ts sets `darkMode: ["class"]`, which means every `dark:`
 * utility compiles to a rule under `.dark`. Nothing anywhere adds that class to
 * the document — the palette is dark because the tokens in index.css are dark
 * values on bare `:root`, not because a theme is switched on.
 *
 * So every `dark:` variant in the product was dead, and whatever sat in front of
 * it is what actually rendered. That is not a cosmetic difference when the thing
 * in front is a light-mode shade:
 *
 *   text-yellow-700 dark:text-yellow-400   →  yellow-700 on a near-black ground
 *   text-amber-800                          →  near-invisible
 *   prose prose-sm dark:prose-invert        →  Tailwind's light prose colours,
 *                                              i.e. dark grey body text on black
 *
 * The prose case was the worst of it: the Coach's replies, playbook content,
 * role-play feedback and the email detail sheet all render generated markdown
 * through it, so their body text was rendering at roughly gray-700 on a
 * 2%-lightness background.
 */

const sourceFiles = (() => {
  const out: { path: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(p);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
        out.push({ path: p, src: readFileSync(p, "utf8") });
      }
    }
  };
  walk("src");
  return out;
})();

describe("the theme is dark, not toggled", () => {
  it("found the source files to check", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it("nothing adds the class the dark: variant needs", () => {
    // If this ever changes, the assertions below stop being the right rule —
    // dark: variants would start working and could come back deliberately.
    const config = readFileSync("tailwind.config.ts", "utf8");
    expect(config).toContain('darkMode: ["class"]');
    for (const f of sourceFiles) {
      expect(f.src, f.path).not.toMatch(/classList\.(add|toggle)\(\s*["']dark["']/);
    }
  });

  it("no light-mode text shade is used as a colour", () => {
    // 600 and darker are meant for light backgrounds. On this one they range
    // from dim to unreadable, and they were carrying warnings.
    for (const f of sourceFiles) {
      const hits = f.src.match(/text-(?:yellow|amber|green|red|blue|orange)-(?:600|700|800|900)\b/g);
      expect(hits ?? [], `${f.path}: ${hits?.join(", ")}`).toEqual([]);
    }
  });

  it("generated markdown is inverted unconditionally", () => {
    // `dark:prose-invert` never fired, so prose rendered in Tailwind's
    // light-mode colours — dark grey body text on a near-black page.
    for (const f of sourceFiles) {
      expect(f.src, f.path).not.toContain("dark:prose-invert");
    }
    const prose = sourceFiles.filter((f) => f.src.includes("prose-invert"));
    expect(prose.length).toBeGreaterThanOrEqual(4);
  });
});
