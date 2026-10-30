/**
 * Turning a stored email body into something readable in the inbox.
 *
 * Two things were showing up raw in the thread pane.
 *
 * The signature. `send-email` appends an HTML signature to the body
 * (`appendSignatureToBody`) and then stores that same string as `body_text`,
 * so "text" bodies routinely contain markup. The inbox stripped tags only on
 * the `body_html` fallback, and `body_text` won. Rendered with
 * `whitespace-pre-wrap`, the signature came out as a visible
 * `<img src="https://…signature-logos/….png" width="320" style="…" />`.
 *
 * The quoted history. Every reply carries the message it answers, as an
 * `On <date>, <someone> wrote:` attribution followed by `>` lines. In a view
 * that already shows both sides of the thread, that is the same text twice,
 * and it grows with every round.
 */

/** Decodes the handful of entities that survive tag-stripping. */
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

/**
 * Plain text from a body that may be HTML, text, or text with markup in it.
 *
 * Block-level tags become line breaks so paragraphs survive; everything else
 * is dropped. `<style>` and `<script>` have their contents removed rather than
 * just their tags, or the CSS inside would be rendered as body copy.
 */
export function toReadableText(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw;
  // Contents, not just the tags: stripping `<style>` alone leaves the CSS.
  text = text.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ");
  // Breaks before the markup goes, so paragraphs do not run together.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|blockquote)\s*>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  // Collapse the runs of blank lines that stripping leaves behind.
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export interface SplitBody {
  /** What this message actually says. */
  visible: string;
  /** The thread it quoted back, if any. Shown behind a toggle. */
  quoted: string;
}

/*
 * The attribution line that introduces quoted history.
 *
 * Gmail, Outlook and Apple Mail all write some variant of "On <date>,
 * <someone> wrote:", sometimes wrapped across two lines, which is why this
 * tolerates a newline before `wrote:`. Matched only at the start of a line so
 * a sentence that happens to contain the word cannot trigger it.
 */
const ATTRIBUTION = /^[ \t]*On\s[\s\S]{0,200}?\bwrote:\s*$/im;

/** Mail clients that mark the quote with a divider instead. */
const DIVIDERS = [
  /^[ \t]*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^[ \t]*_{5,}\s*$/m,
  /^[ \t]*-{5,}\s*$/m,
];

/**
 * Splits a reply into what it says and what it quoted.
 *
 * Conservative on purpose: when the quote cannot be located confidently the
 * whole body stays visible. Hiding part of a real reply is the worse error —
 * a prospect's answer going unread costs more than a few lines of duplication.
 */
export function splitQuotedReply(raw: string | null | undefined): SplitBody {
  const text = toReadableText(raw);
  if (!text) return { visible: "", quoted: "" };

  const cuts: number[] = [];
  const attribution = text.match(ATTRIBUTION);
  if (attribution?.index !== undefined) cuts.push(attribution.index);
  for (const divider of DIVIDERS) {
    const m = text.match(divider);
    if (m?.index !== undefined) cuts.push(m.index);
  }
  /*
   * A run of `>` lines with no attribution above it — some clients quote
   * without one. Only counted from the first of a run, so a single `>` used
   * for emphasis mid-sentence does not cut the message in half.
   */
  const bareQuote = text.match(/(?:^[ \t]*>.*\n){2,}/m);
  if (bareQuote?.index !== undefined) cuts.push(bareQuote.index);

  if (cuts.length === 0) return { visible: text, quoted: "" };
  const cut = Math.min(...cuts);

  const visible = text.slice(0, cut).trim();
  const quoted = text.slice(cut).trim();
  // Everything was quote: better to show it than to show an empty message.
  if (!visible) return { visible: text, quoted: "" };
  return { visible, quoted };
}
