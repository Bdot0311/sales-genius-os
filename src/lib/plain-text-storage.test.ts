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


/** Every `body_text:` written by an edge function, with its file. */
function bodyTextWrites(): Array<{ file: string; line: string }> {
  const out: Array<{ file: string; line: string }> = [];
  for (const dir of readdirSync(FUNCTIONS)) {
    const path = `${FUNCTIONS}/${dir}/index.ts`;
    let code: string;
    try {
      code = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    for (const line of code.split("\n")) {
      if (/\bbody_text:\s*\S/.test(line)) out.push({ file: path, line: line.trim() });
    }
  }
  return out;
}

describe("what gets stored as body_text is plain text", () => {
  it("every write goes through the stripper", () => {
    const writes = bodyTextWrites();
    // If this stops finding them, the checks below pass by knowing nothing.
    expect(writes.length).toBeGreaterThanOrEqual(5);

    const unstripped = writes
      // A literal string written in the source is already plain by
      // construction; only values carried in from elsewhere can hold markup.
      .filter((w) => !/body_text:\s*[`"']/.test(w.line))
      .filter((w) => !w.line.includes("htmlToPlainText("))
      .map((w) => `${w.file}: ${w.line}`);
    expect(unstripped, "these can carry the HTML signature").toEqual([]);
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
