import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const INBOX = readFileSync("src/pages/Inbox.tsx", "utf8");
const AGENT = readFileSync("src/pages/Agent.tsx", "utf8");
const CSS = readFileSync("src/index.css", "utf8");

/**
 * The Inbox folder strip rendered as a sliver with its labels behind a
 * scrollbar.
 *
 * The app already suppresses the scrollbar on [role="tablist"], which is why
 * every other strip looks right. The Inbox strip was a bare div of buttons that
 * merely looked like tabs, so it never matched that rule; on a platform that
 * always shows scrollbars the native track was drawn straight over an
 * eleven-pixel row.
 *
 * Fixing it by hiding the scrollbar would have worked and left it just as
 * inaccessible. It is a real tablist now, which is why the CSS reaches it.
 */
describe("the horizontal strips are what they look like", () => {
  it("the app suppresses the scrollbar on a tablist", () => {
    expect(CSS).toContain('[role="tablist"]::-webkit-scrollbar');
    expect(CSS).toContain(".scrollbar-hide::-webkit-scrollbar");
  });

  it("the Inbox folder strip declares itself a tablist", () => {
    expect(INBOX).toContain('role="tablist"');
    expect(INBOX).toContain('aria-label="Filter conversations"');
  });

  it("its buttons are tabs, and say which one is current", () => {
    // Arrow keys and a screen reader need this; a div of buttons never had it.
    expect(INBOX).toContain('role="tab"');
    expect(INBOX).toContain("aria-selected={active}");
  });

  it("the labels are readable rather than 11px under a scrollbar", () => {
    expect(INBOX).not.toContain("text-[0.6875rem] transition-colors");
    expect(INBOX).toContain("px-2 py-1.5 text-xs transition-colors");
  });

  it("where the scroller is a wrapper, the wrapper hides the scrollbar", () => {
    // The role sits on the TabsList inside, which is not the element that
    // scrolls, so the tablist rule cannot reach it.
    expect(AGENT).toContain('className="-mx-1 overflow-x-auto px-1 scrollbar-hide"');
  });
});
