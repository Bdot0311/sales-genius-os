import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { toReadableText } from "./message-body";

/**
 * `body_text` is supposed to be the plain-text half of a sent email, and it
 * was not.
 *
 * `appendSignatureToBody` puts an HTML signature into the body, and the same
 * string was then written to both `body_html` and `body_text`. Fixing the
 * inbox made the markup invisible there; it did nothing for the other five
 * readers, none of which want HTML either:
 *
 *   - `_shared/draft-one.ts` feeds it to the model as "the last email you
 *     sent", so the model read `<img src="…" style="…" />` as prose.
 *   - `agent-chat` returns it as the email body in three places.
 *   - `EditScheduledEmailDialog` loads it into a textarea the user edits —
 *     markup they would have to delete by hand, or re-send as literal text.
 *   - `EmailDetailSheet` renders it with `whitespace-pre-wrap`, the same way
 *     the inbox did.
 *
 * That every reader wanted text is what makes the write side the right place
 * to fix it.
 */

const FUNCTIONS = "supabase/functions";

const HELPER = `${FUNCTIONS}/_shared/plain-text.ts`;

// The Deno helper, evaluated here by stripping its import/export syntax —
// the alternative is trusting that two copies of a regex stayed identical.
const denoSource = readFileSync(HELPER, "utf8")
  .replace(/^export /gm, "")
  .replace(/^import .*$/gm, "");
const htmlToPlainText = new Function(
  `${denoSource.replace(/: string \| null \| undefined/g, "").replace(/: string/g, "").replace(/: Record<string, string>/g, "").replace(/\): string \{/g, ") {")}
   return htmlToPlainText;`,
)() as (raw: string) => string;


/** Every `body_text:` written by an edge function, with its file and that file's source. */
function bodyTextWrites(): Array<{ file: string; line: string; code: string }> {
  const out: Array<{ file: string; line: string; code: string }> = [];
  for (const dir of readdirSync(FUNCTIONS)) {
    const path = `${FUNCTIONS}/${dir}/index.ts`;
    let code: string;
    try {
      code = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of code.split("\n")) {
      if (/\bbody_text:\s*\S/.test(line)) out.push({ file: path, line: line.trim(), code });
    }
  }
  return out;
}

/**
 * Whether the value this line stores is plain by the time it is stored.
 *
 * The first version of this only accepted the call written inline, which was
 * enough while every fix happened to be written that way. It is not a property
 * of being stripped: `supabase/functions/mcp/index.ts` is a BUNDLE generated
 * from `src/lib/mcp/**`, and the generator hoists the call into a `const`, so
 * the fix arrives as `body_text: plainBody` with `plainBody` assigned from the
 * stripper a few lines up. Rejecting that would push someone toward editing
 * the generated file, which is the one move that cannot work.
 */
function isPlainAtRest(line: string, code: string): boolean {
  // A literal written in the source is already plain by construction; only
  // values carried in from elsewhere can hold markup.
  if (/body_text:\s*[`"']/.test(line)) return true;
  if (line.includes("htmlToPlainText(")) return true;
  // An identifier bound to a stripper call in the same file.
  const name = line.match(/body_text:\s*([A-Za-z_$][\w$]*)\s*,/)?.[1];
  if (!name) return false;
  return new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*htmlToPlainText\\(`).test(code);
}

describe("what gets stored as body_text is plain text", () => {
  it("every write goes through the stripper", () => {
    const writes = bodyTextWrites();
    // If this stops finding them, the checks below pass by knowing nothing.
    expect(writes.length).toBeGreaterThanOrEqual(5);

    const unstripped = writes
      .filter((w) => !isPlainAtRest(w.line, w.code))
      .map((w) => `${w.file}: ${w.line}`);
    expect(unstripped, "these can carry the HTML signature").toEqual([]);
  });

  it("a bare identifier is not mistaken for a stripped one", () => {
    /*
     * The binding rule above is the part of this guard most likely to be too
     * generous, so it is pinned directly. `body_text: plainBody` passes only
     * because of what `plainBody` is assigned from, not because it is spelled
     * reassuringly.
     */
    const stripped = "const plainBody = htmlToPlainText(body);";
    expect(isPlainAtRest("body_text: plainBody,", stripped)).toBe(true);
    expect(isPlainAtRest("body_text: plainBody,", "const plainBody = body;")).toBe(false);
    expect(isPlainAtRest("body_text: body,", stripped)).toBe(false);
    // A different variable that merely sits in a file containing a strip call.
    expect(isPlainAtRest("body_text: rawBody,", stripped)).toBe(false);
  });

  it("the stripper leaves the sender's own formatting alone", () => {
    /*
     * Deliberately no whitespace tidying on text with no markup: this decides
     * what gets STORED, and collapsing blank lines in a body somebody wrote by
     * hand rewrites their email to no purpose.
     */
    const handWritten = "Hi there,\n\n\n\nBlank lines on purpose.   \n";
    expect(htmlToPlainText(handWritten)).toBe(handWritten);
    expect(htmlToPlainText("Plain, no markup.")).toBe("Plain, no markup.");
  });

  it("but an entity is still decoded, with or without tags", () => {
    // A stray `&amp;` reaching the model or an edit box is the same defect as
    // a stray `<img>`. Tagless input took an early return that skipped this
    // until the cross-check below caught it.
    expect(htmlToPlainText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });

  it("body_html is still written, so nothing is lost", () => {
    // Stripping body_text would discard the only copy of the rendered email
    // if the HTML column were not populated beside it.
    const send = readFileSync(`${FUNCTIONS}/send-email/index.ts`, "utf8");
    expect(send).toContain("body_html: trackedHtmlBody");
  });
});

describe("the two strippers agree", () => {
  /*
   * There are two: `_shared/plain-text.ts` runs in Deno at write time, and
   * `src/lib/message-body.ts` runs in the browser for rows already stored
   * with markup in them. They cannot share a module across that boundary, so
   * this pins them together instead. Drift would mean a message reading one
   * way in the inbox and another to the agent.
   *
   * They agree on markup and on entities. They differ, on purpose, on the
   * whitespace of text that has no markup at all: the browser one is
   * collapsing it for display, while the Deno one is deciding what to store
   * and must not rewrite what the sender typed. The case below pins that
   * difference so it stays deliberate.
   *
   * Writing this test is what caught them disagreeing: the Deno side was
   * returning tagless text untouched, so `&amp;` would have reached the
   * model, the agent and the edit box undecoded — the same defect as a stray
   * `<img>`, one character class over.
   */
  const CASES = [
    '<p>Hi there</p><p>Second line</p>',
    'Plain text, no markup at all.',
    '<style>.x{color:red}</style><p>Hello</p>',
    'Tom &amp; Jerry &#39;24',
    'one<br>two',
    '<img src="https://example.com/logo.png" width="320" style="display:block;" />',
    '',
  ];

  for (const input of CASES) {
    it(`agree on ${JSON.stringify(input.slice(0, 44))}`, () => {
      expect(htmlToPlainText(input)).toBe(toReadableText(input));
    });
  }

  it("but differ on the whitespace of tagless text, deliberately", () => {
    const handWritten = "Hi there,\n\n\n\nI left those blank lines on purpose.   \n";
    // Stored as typed.
    expect(htmlToPlainText(handWritten)).toBe(handWritten);
    // Tidied for display.
    expect(toReadableText(handWritten)).toBe("Hi there,\n\nI left those blank lines on purpose.");
  });

  it("and the shared cases are not all trivially empty", () => {
    const answers = CASES.map((c) => htmlToPlainText(c)).filter(Boolean);
    expect(answers.length).toBeGreaterThan(4);
  });
});

describe("the rows already stored with markup still read correctly", () => {
  /*
   * The write-side fix only helps emails sent from now on. Every row already
   * in `sent_emails` keeps its HTML signature in `body_text`, so each surface
   * that renders one has to cope — and two of them had the identical bug the
   * inbox was reported for.
   *
   * A backfill was considered and rejected: rewriting stored history to fix a
   * display problem is the bigger risk, and there is no way to tell a
   * signature that was appended from one the sender typed.
   */
  const SURFACES = [
    "src/pages/Inbox.tsx",
    "src/components/outreach/EmailDetailSheet.tsx",
    "src/components/outreach/EditScheduledEmailDialog.tsx",
  ];

  for (const file of SURFACES) {
    it(`${file.split("/").pop()} reads through the reader`, () => {
      const code = readFileSync(file, "utf8");
      expect(code).toContain("toReadableText");
    });
  }

  it("the edit box does not hand the user markup to delete", () => {
    /*
     * This one is worse than a display bug: the textarea is what gets saved
     * and sent, so markup left in it goes back out as literal text in the
     * next email.
     */
    const code = readFileSync("src/components/outreach/EditScheduledEmailDialog.tsx", "utf8");
    expect(code).toContain("setBodyText(toReadableText(email.body_text))");
    expect(code).not.toContain('setBodyText(email.body_text || "")');
  });
});

describe("the mcp edge function is generated, so the fix lives in its source", () => {
  /*
   * This cost three rounds to find, and the reason is worth writing down.
   *
   * `supabase/functions/mcp/index.ts` is not a file anybody wrote. Its first
   * line says so: "AUTO-GENERATED by @lovable.dev/mcp-js — do not edit.
   * Regenerated by the Vite plugin." It is bundled from `src/lib/mcp/**` on
   * every `vite build`.
   *
   * The stripper was applied to the generated file by hand, three times, and
   * vanished three times:
   *
   *   - once blamed on a `git stash` / `pop` cycle,
   *   - once on commit `406d3450` ("Changes", the platform bot) — which was a
   *     publish, and a publish runs a build,
   *   - once on this branch's own `npm run build`, two minutes after a test
   *     run had confirmed the line was present.
   *
   * None of those was a revert. Every one was the generator doing exactly what
   * its banner says it does. "Lovable reverted my change" was the wrong
   * diagnosis three times over, and it survived that long because the guard
   * only checked the generated output — so it reported the symptom correctly
   * and said nothing about where the cause was.
   */
  const GENERATED = `${FUNCTIONS}/mcp/index.ts`;
  const SOURCE = "src/lib/mcp/tools/send-reply.ts";

  it("the generated file still declares itself generated", () => {
    /*
     * If this banner ever goes, the plugin stops rewriting the file and
     * hand-editing it becomes correct — at which point the rule below is
     * wrong and should fail until somebody reads this.
     */
    const first = readFileSync(GENERATED, "utf8").split("\n")[0];
    expect(first, "the banner is what makes a hand-edit futile").toContain("AUTO-GENERATED");
    expect(first).toContain("do not edit");
  });

  it("the source that generates it strips the body", () => {
    const src = readFileSync(SOURCE, "utf8");
    expect(src, "the fix has to be here, not in the bundle").toContain("htmlToPlainText(body)");
    // Both columns, from the one stripped value: body_html is built from the
    // body too, and escaping markup there turns tags into visible `&lt;p&gt;`.
    expect(src).toContain("body_text: plainBody");
    expect(src).not.toContain("body_text: body,");
  });

  it("the generated bundle carries the stripper, not a call to a missing one", () => {
    /*
     * The plugin inlines dependency-free local imports. If it ever instead
     * emitted a bare `import { htmlToPlainText } from "../_shared/..."`, the
     * Deno function would still type-check and still be wrong at runtime,
     * because the bundle is deployed on its own.
     */
    const gen = readFileSync(GENERATED, "utf8");
    expect(gen).toContain("function htmlToPlainText(");
    expect(gen).toContain("body_text: plainBody");
  });
});
