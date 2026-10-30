/**
 * The plain-text half of a sent email.
 *
 * `body_html` and `body_text` are meant to be the two renderings of one
 * message. They were not: the HTML signature is appended to the body
 * (`appendSignatureToBody`) and the result stored in BOTH columns, so
 * `body_text` routinely carried markup. Every reader of it wants text:
 *
 *   - `draft-one.ts` feeds it to the model as "the last email you sent",
 *     so the model was reading `<img src="…" style="…" />` as prose.
 *   - `agent-chat` hands it back as the email body in three places.
 *   - `EditScheduledEmailDialog` puts it in a textarea the user edits.
 *   - `EmailDetailSheet` and the inbox render it with `whitespace-pre-wrap`,
 *     which is where it became visible and got reported.
 *
 * Not one of them wanted HTML, which is what makes fixing the write side the
 * right move rather than patching each reader.
 */

/**
 * Plain text from a body that may be HTML, text, or text with markup in it.
 *
 * A no-op on text that has no tags — deliberately. Collapsing whitespace in a
 * body the sender wrote by hand would rewrite their email to no purpose, so
 * this only reformats when there is markup to remove.
 */
export function htmlToPlainText(raw: string | null | undefined): string {
  if (!raw) return "";
  /*
   * No tags: decode entities, but leave the sender's formatting alone.
   *
   * These are two different concerns and only one of them is safe to apply
   * unconditionally. A stray `&amp;` reaching the model, the agent or an edit
   * box is the same defect as a stray `<img>`, so entities are always
   * decoded. Collapsing blank lines and trailing spaces is not — doing that
   * to a body somebody wrote by hand rewrites their email to no purpose.
   */
  if (!/<[a-z!/][\s\S]*?>/i.test(raw)) return decodeEntities(raw);

  let text = raw;
  // Contents, not just the tags: stripping `<style>` alone leaves the CSS to
  // read as body copy.
  text = text.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ");
  // Breaks before the markup goes, so paragraphs do not run together.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** The handful of entities that survive tag-stripping. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    "#39": "'",
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const key = code.toLowerCase();
    if (key in named) return named[key];
    if (key.startsWith("#x")) {
      const n = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    if (key.startsWith("#")) {
      const n = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });
}
