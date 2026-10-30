import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitQuotedReply, toReadableText } from "./message-body";

/**
 * The inbox was showing two things it should never show.
 *
 * `send-email` appends an HTML signature to the body and stores that same
 * string as `body_text`, so a "text" body routinely contains markup. The
 * inbox stripped tags only on the `body_html` fallback and `body_text` won,
 * so the signature rendered as a visible `<img src="…" width="320" …/>` in
 * the middle of the message — which is what prompted this.
 *
 * And every reply carried the thread it answered, as `On <date> … wrote:`
 * followed by `>` lines, in a pane that already shows both sides.
 */

// The signature exactly as it appeared in the thread pane.
const SIGNATURE =
  '<img src="https://ghgfjnepvxvxrncmskys.supabase.co/storage/v1/object/public/' +
  'signature-logos/fdcd1ed6-f1f3-4dd6-8cde-69d917432a45/logo-1786056620491.png" ' +
  'alt="Email signature logo" width="320" ' +
  'style="display:block;max-width:320px;width:100%;height:auto;margin-top:8px;" />';

const SENT_BODY = `Hi Molly,

Saw you on the pricing pages earlier today across the US and UK versions.

Which one is it, or am I off base?

Brandon
Founder, BDØT Industries LLC

${SIGNATURE}`;

const REPLY_WITH_QUOTE = `Hey Brandon,

I actually was just on your site because I saw someone from your company
visited our website

So was just searching to see if you had any open engineering roles that we
could help your team fill.

On Fri, Sep 25, 2026 at 5:16 PM brandon yakubov <brandon@bdotindustries.com>
wrote:

> Hi Molly,
>
> Saw you on the pricing pages earlier today across the US and UK versions.
> Usually when ops leaders pull those up back-to-back like that, there's`;

describe("a stored body becomes readable text", () => {
  it("the signature does not render as markup", () => {
    const text = toReadableText(SENT_BODY);
    expect(text).not.toContain("<img");
    expect(text).not.toContain("signature-logos");
    expect(text).not.toContain("max-width:320px");
    // The message itself survives intact.
    expect(text).toContain("Hi Molly,");
    expect(text).toContain("Founder, BDØT Industries LLC");
  });

  it("paragraphs survive the stripping", () => {
    const text = toReadableText("<p>First line.</p><p>Second line.</p>");
    expect(text).toBe("First line.\nSecond line.");
    expect(toReadableText("one<br>two")).toBe("one\ntwo");
  });

  it("style and script contents go, not just their tags", () => {
    // Stripping `<style>` alone leaves the CSS to render as body copy.
    const text = toReadableText("<style>.x{color:red}</style><p>Hello</p>");
    expect(text).toBe("Hello");
    expect(text).not.toContain("color:red");
  });

  it("entities are decoded", () => {
    expect(toReadableText("Tom &amp; Jerry &#39;24 &lt;b&gt;")).toBe("Tom & Jerry '24 <b>");
  });

  it("a plain-text body is left alone", () => {
    const plain = "Hi there,\n\nNo markup at all.\n\nThanks";
    expect(toReadableText(plain)).toBe(plain);
  });

  it("empty input is empty, not the string null", () => {
    expect(toReadableText(null)).toBe("");
    expect(toReadableText(undefined)).toBe("");
    expect(toReadableText("")).toBe("");
  });
});

describe("a reply is split from the thread it quoted", () => {
  it("the quoted history is separated out", () => {
    const { visible, quoted } = splitQuotedReply(REPLY_WITH_QUOTE);
    expect(visible).toContain("Hey Brandon,");
    expect(visible).toContain("open engineering roles");
    // The attribution line and everything after it is the quote.
    expect(visible).not.toContain("wrote:");
    expect(visible).not.toContain("> Hi Molly,");
    expect(quoted).toContain("wrote:");
    expect(quoted).toContain("> Hi Molly,");
  });

  it("a reply with no quote is left whole", () => {
    const { visible, quoted } = splitQuotedReply("Sounds great, Brandon. Have a great rest of your week.");
    expect(visible).toBe("Sounds great, Brandon. Have a great rest of your week.");
    expect(quoted).toBe("");
  });

  it("a message that is entirely quote stays visible", () => {
    /*
     * Conservative on purpose. Hiding part of a real reply is the worse
     * error: a prospect's answer going unread costs more than duplication.
     */
    // A forward with nothing added: the attribution is the first line, so the
    // cut lands at 0 and there is no "visible" part at all.
    const forwarded = "On Fri, Sep 25, 2026 at 5:16 PM someone wrote:\n\n> the whole message";
    const { visible, quoted } = splitQuotedReply(forwarded);
    expect(visible).toContain("the whole message");
    expect(quoted).toBe("");
  });

  it("the word 'wrote' mid-sentence does not cut the message", () => {
    const body = "I wrote: the proposal is attached.\n\nLet me know what you think.";
    const { visible, quoted } = splitQuotedReply(body);
    expect(visible).toContain("Let me know what you think.");
    expect(quoted).toBe("");
  });

  it("a single > used for emphasis does not cut the message", () => {
    // Only a run of quoted lines counts, so one stray marker is safe.
    const body = "Revenue is up\n> 40% this quarter\nand churn is flat.";
    const { visible } = splitQuotedReply(body);
    expect(visible).toContain("and churn is flat.");
  });

  it("an Outlook divider splits too", () => {
    const body = "Short answer: yes.\n\n-----Original Message-----\nFrom: someone";
    const { visible, quoted } = splitQuotedReply(body);
    expect(visible).toBe("Short answer: yes.");
    expect(quoted).toContain("Original Message");
  });

  it("markup inside a reply is stripped before splitting", () => {
    const { visible } = splitQuotedReply(`<p>Yes please.</p>${SIGNATURE}`);
    expect(visible).toContain("Yes please.");
    expect(visible).not.toContain("<img");
  });
});

describe("the inbox actually uses it", () => {
  const PAGE = readFileSync("src/pages/Inbox.tsx", "utf8");

  it("every body goes through the reader", () => {
    /*
     * Three mappings build message bodies — the sent email, the analysed
     * reply, and the reply-tracking row. The signature bug was in the first
     * one only, and the other two carried quoted history, so all three need
     * it rather than the one that was reported.
     */
    expect([...PAGE.matchAll(/toReadableText\(/g)].length).toBeGreaterThanOrEqual(3);
    // The old form preferred body_text, which is exactly where the markup is.
    expect(PAGE).not.toContain('row.body_text || (row.body_html');
  });

  it("quoted text is hidden behind a toggle, not discarded", () => {
    // "What did they quote back" is occasionally the whole question.
    expect(PAGE).toContain("splitQuotedReply");
    expect(PAGE).toContain("Show quoted text");
    expect(PAGE).toContain("Hide quoted text");
  });
});
